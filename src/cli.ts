#!/usr/bin/env node
import { appendFile, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { Command } from "commander";
import { glob } from "glob";
import { checkEvals, initEvals } from "./evals/index.js";
import { crossSkillFindings, lintSkillDir } from "./lint/index.js";
import { toWorkflowCommands } from "./output/github.js";
import { toSarif } from "./output/sarif.js";
import type { LintResult, Profile } from "./types.js";

/** Replaced at build time by tsup's `define` (see tsup.config.ts) so the CLI,
 * the SARIF `tool.driver.version` and package.json can never disagree. Falls
 * back when the sources are run directly (vitest, `node --strip-types`). */
declare const __SKILLCHECK_VERSION__: string | undefined;
const VERSION =
  typeof __SKILLCHECK_VERSION__ === "string"
    ? __SKILLCHECK_VERSION__
    : "0.0.0-dev";

const FORMATS = ["pretty", "concise", "json", "github", "sarif"] as const;
const PROFILES = ["strict", "lenient"] as const;
const FAIL_ON = ["error", "warning", "never"] as const;

const program = new Command();

program
  .name("skillcheck")
  .description("Conformance suite for Agent Skills (SKILL.md)")
  .version(VERSION);

interface LintFlags {
  strict: boolean;
  profile: string;
  format: string;
  failOn: string;
  sarif?: string;
  maxWarnings?: string;
  ignorePattern?: string[];
}

/** Exit 2 ("usage or internal error") on a bad flag value. Silently coercing an
 * unrecognized value is worse than failing: `--fail-on wraning` would quietly
 * downgrade the CI gate to errors-only, and action.yml passes `fail-on` and
 * `profile` straight through from workflow inputs. */
function requireChoice(
  flag: string,
  value: string,
  allowed: readonly string[],
): void {
  if (allowed.includes(value)) return;
  console.error(
    `invalid value for ${flag}: '${value}' (expected one of: ${allowed.join(", ")})`,
  );
  process.exit(2);
}

program
  .command("lint")
  .description(
    "Lint one or more skill directories against the Agent Skills spec",
  )
  .argument(
    "<paths...>",
    "skill directories, a SKILL.md file, or parents containing */SKILL.md",
  )
  .option("--strict", "deprecated alias for --profile strict (default)", false)
  .option(
    "--profile <profile>",
    "strict (skills-ref parity) | lenient (client-guide)",
    "strict",
  )
  .option(
    "--format <format>",
    "output format: pretty | concise | json | github | sarif",
    "pretty",
  )
  .option(
    "--fail-on <severity>",
    "minimum severity that fails: error | warning | never",
    "error",
  )
  .option("--sarif <path>", "also write a SARIF 2.1.0 report to this path")
  .option("--max-warnings <n>", "fail when warnings exceed this count")
  .option(
    "--ignore-pattern <glob...>",
    "glob(s) to exclude during discovery (adds to config ignore)",
  )
  .action(async (paths: string[], opts: LintFlags) => {
    // --strict is a deprecated no-argument alias for the default profile;
    // it must not silently coexist with an explicit --profile lenient.
    if (opts.strict && opts.profile === "lenient") {
      console.error("--strict conflicts with --profile lenient; pick one");
      process.exit(2);
    }
    if (opts.strict) {
      console.error(
        "warning: --strict is deprecated; strict is the default (use --profile)",
      );
    }

    requireChoice("--profile", opts.profile, PROFILES);
    requireChoice("--format", opts.format, FORMATS);
    requireChoice("--fail-on", opts.failOn, FAIL_ON);
    const maxWarnings = parseMaxWarnings(opts.maxWarnings);

    const config = await loadConfig();
    const ignore = [...(config?.ignore ?? []), ...(opts.ignorePattern ?? [])];
    const skillDirs = await expandSkillDirs(paths, ignore);
    if (skillDirs.length === 0) {
      console.error("no SKILL.md found under the given paths");
      process.exit(2);
    }

    const profile: Profile = opts.profile === "lenient" ? "lenient" : "strict";

    const results: LintResult[] = [];
    for (const dir of skillDirs) {
      const result = await lintSkillDir(dir, {
        profile,
        ...(config?.rules ? { ruleOverrides: config.rules } : {}),
      });
      result.findings.push(...(await checkEvals(dir, result.skillName)));
      recount(result);
      results.push(result);
    }
    crossSkillFindings(results);

    if (opts.sarif) {
      await writeFile(opts.sarif, toSarif(results, VERSION), "utf8");
    }
    report(results, opts.format);
    await emitGithubOutputs(results);

    const errors = results.reduce((s, r) => s + r.errorCount, 0);
    const warnings = results.reduce((s, r) => s + r.warningCount, 0);

    let failed = false;
    if (opts.failOn === "never") failed = false;
    else if (opts.failOn === "warning") failed = errors > 0 || warnings > 0;
    else failed = errors > 0;
    if (warnings > maxWarnings) failed = true;

    process.exit(failed ? 1 : 0);
  });

const evalCmd = program
  .command("eval")
  .description("Trigger-test definitions for skills");

evalCmd
  .command("init")
  .description(
    "Scaffold evals/evals.json for a skill (skill-creator-compatible format)",
  )
  .argument("<skill-dir>", "skill directory")
  .action(async (dir: string) => {
    try {
      const path = await initEvals(dir);
      console.log(`created ${path}`);
      console.log(
        "Fill in the REPLACE placeholders: 3 explicit / 3 implicit / 3 contextual / 4 negative triggers.",
      );
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      process.exit(2);
    }
  });

evalCmd
  .command("check")
  .description("Validate evals/evals.json against the schema")
  .argument("<skill-dir>", "skill directory")
  .action(async (dir: string) => {
    const result = await lintSkillDir(dir);
    const findings = await checkEvals(dir, result.skillName);
    if (findings.length === 0) {
      console.log("evals.json ok (or absent)");
      process.exit(0);
    }
    for (const f of findings) {
      console.log(
        `${f.severity === "error" ? "ERR " : "WARN"} [${f.code}] ${f.message}`,
      );
    }
    process.exit(findings.some((f) => f.severity === "error") ? 1 : 0);
  });

interface Config {
  rules?: Record<string, "off" | "warn" | "error" | "info">;
  ignore?: string[];
}

/** `--max-warnings` as a non-negative integer. `Number("abc")` is NaN, and
 * `warnings > NaN` is always false, so an unvalidated typo turned the gate off
 * entirely. Absent means no ceiling. */
function parseMaxWarnings(raw: string | undefined): number {
  if (raw === undefined) return Number.POSITIVE_INFINITY;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    console.error(
      `invalid value for --max-warnings: '${raw}' (expected a non-negative integer)`,
    );
    process.exit(2);
  }
  return n;
}

async function loadConfig(): Promise<Config | null> {
  try {
    const raw = await readFile("skillcheck.config.json", "utf8");
    return JSON.parse(raw) as Config;
  } catch {
    return null;
  }
}

/** Resolve inputs: a SKILL.md file resolves to its parent, a dir with SKILL.md
 * is a skill, any other dir is searched below. */
async function expandSkillDirs(
  paths: string[],
  extraIgnore: string[] = [],
): Promise<string[]> {
  const dirs = new Set<string>();
  for (const p of paths) {
    const info = await statOrNull(p);
    // skills-ref validate() messages -- a misconfigured Action input should
    // say what is wrong with the path, not "no SKILL.md found".
    if (info === null) {
      console.error(`Path does not exist: ${p}`);
      process.exit(2);
    }
    if (info.isFile()) {
      if (!/^skill\.md$/i.test(basename(p))) {
        console.error(`Not a directory: ${p}`);
        process.exit(2);
      }
      dirs.add(dirname(p) || ".");
      continue;
    }
    if (
      (await exists(join(p, "SKILL.md"))) ||
      (await exists(join(p, "skill.md")))
    ) {
      dirs.add(p);
      continue;
    }
    const matches = await glob("**/{SKILL,skill}.md", {
      cwd: p,
      ignore: ["**/node_modules/**", "**/.git/**", ...extraIgnore],
      absolute: true,
    });
    for (const m of matches) {
      dirs.add(join(m, ".."));
    }
  }
  return [...dirs].sort();
}

async function statOrNull(
  path: string,
): Promise<import("node:fs").Stats | null> {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}

async function exists(path: string): Promise<boolean> {
  return (await statOrNull(path)) !== null;
}

function recount(r: LintResult): void {
  r.errorCount = r.findings.filter((f) => f.severity === "error").length;
  r.warningCount = r.findings.filter((f) => f.severity === "warning").length;
  r.infoCount = r.findings.filter((f) => f.severity === "info").length;
}

/** GitHub Actions integration: outputs + step summary when env vars exist. */
async function emitGithubOutputs(results: LintResult[]): Promise<void> {
  const errors = results.reduce((s, r) => s + r.errorCount, 0);
  const warnings = results.reduce((s, r) => s + r.warningCount, 0);

  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    await appendFile(
      outputPath,
      `error-count=${errors}\nwarning-count=${warnings}\n`,
      "utf8",
    );
  }

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    const lines = [
      "## skillcheck",
      "",
      `**${results.length}** skill(s) checked: **${errors}** error(s), **${warnings}** warning(s)`,
      "",
    ];
    const withFindings = results.filter((r) => r.findings.length > 0);
    if (withFindings.length > 0) {
      lines.push(
        "| Skill | Rule | Severity | Message |",
        "| --- | --- | --- | --- |",
      );
      for (const r of withFindings) {
        for (const f of r.findings.slice(0, 50)) {
          lines.push(
            `| ${r.skillName ?? r.skillDir} | ${f.code} | ${f.severity} | ${f.message.replace(/\|/g, "\\|").replace(/\r?\n/g, " ")} |`,
          );
        }
      }
    }
    await appendFile(summaryPath, `${lines.join("\n")}\n`, "utf8");
  }
}

function report(results: LintResult[], format: string): void {
  if (format === "json") {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  if (format === "sarif") {
    console.log(toSarif(results, VERSION));
    return;
  }

  if (format === "github") {
    // Workflow commands: inline PR annotations (caps: 10/type/step).
    // Paths and escaping live in output/github.ts.
    for (const line of toWorkflowCommands(results)) console.log(line);
    return;
  }

  if (format === "concise") {
    for (const r of results) {
      for (const f of r.findings) {
        const glyph =
          f.severity === "error" ? "x" : f.severity === "warning" ? "!" : "-";
        console.log(
          `${glyph} ${r.skillDir}/${f.file}:${f.line ?? 1}: ${f.code} (${f.alias}): ${f.message}`,
        );
      }
    }
    printTotals(results);
    return;
  }

  // pretty (default)
  for (const r of results) {
    const label = r.skillName ?? "(unnamed)";
    if (r.findings.length === 0) {
      console.log(`ok   ${label}  ${r.skillDir}`);
      continue;
    }
    console.log(`\n${label}  ${r.skillDir}`);
    for (const f of r.findings) {
      const tag =
        f.severity === "error"
          ? "ERR "
          : f.severity === "warning"
            ? "WARN"
            : "INFO";
      console.log(`  ${tag} [${f.code} ${f.alias}] ${f.message}`);
      if (f.suggestion) console.log(`       fix: ${f.suggestion}`);
    }
  }
  printTotals(results);
}

function printTotals(results: LintResult[]): void {
  const errors = results.reduce((s, r) => s + r.errorCount, 0);
  const warnings = results.reduce((s, r) => s + r.warningCount, 0);
  const infos = results.reduce((s, r) => s + r.infoCount, 0);
  console.log(
    `\n${results.length} skill(s) checked: ${errors} error(s), ${warnings} warning(s), ${infos} info`,
  );
}

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(2);
});
