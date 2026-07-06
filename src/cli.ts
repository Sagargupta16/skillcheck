#!/usr/bin/env node
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { Command } from "commander";
import { glob } from "glob";
import { lintSkillDir } from "./lint/index.js";
import type { LintResult } from "./types.js";

const program = new Command();

program
  .name("skillcheck")
  .description("Conformance suite for Agent Skills (SKILL.md)")
  .version("0.1.0");

program
  .command("lint")
  .description(
    "Lint one or more skill directories against the Agent Skills spec",
  )
  .argument(
    "<paths...>",
    "skill directories (or parents containing */SKILL.md)",
  )
  .option(
    "--strict",
    "skills-ref parity: unknown/extension fields are errors",
    false,
  )
  .option(
    "--format <format>",
    "output format: pretty | json | github",
    "pretty",
  )
  .action(
    async (paths: string[], opts: { strict: boolean; format: string }) => {
      const skillDirs = await expandSkillDirs(paths);
      if (skillDirs.length === 0) {
        console.error("no SKILL.md found under the given paths");
        process.exit(2);
      }

      const results: LintResult[] = [];
      for (const dir of skillDirs) {
        results.push(await lintSkillDir(dir, { strict: opts.strict }));
      }

      report(results, opts.format);
      const hasErrors = results.some((r) => r.errorCount > 0);
      process.exit(hasErrors ? 1 : 0);
    },
  );

/** Resolve inputs: a dir with SKILL.md is a skill; otherwise search below it. */
async function expandSkillDirs(paths: string[]): Promise<string[]> {
  const dirs = new Set<string>();
  for (const p of paths) {
    if (await exists(join(p, "SKILL.md"))) {
      dirs.add(p);
      continue;
    }
    const matches = await glob("**/SKILL.md", {
      cwd: p,
      ignore: ["**/node_modules/**"],
      absolute: true,
    });
    for (const m of matches) {
      dirs.add(join(m, ".."));
    }
  }
  return [...dirs].sort();
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function report(results: LintResult[], format: string): void {
  if (format === "json") {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  if (format === "github") {
    // GitHub Actions workflow commands: annotate files inline on PRs.
    for (const r of results) {
      for (const f of r.findings) {
        const level = f.severity === "error" ? "error" : "warning";
        const file = join(r.skillDir, f.file);
        const line = f.line ?? 1;
        console.log(
          `::${level} file=${file},line=${line},title=${f.rule}::${f.message}`,
        );
      }
    }
    return;
  }

  // pretty
  let errors = 0;
  let warnings = 0;
  for (const r of results) {
    const label = r.skillName ?? "(unnamed)";
    if (r.findings.length === 0) {
      console.log(`ok   ${label}  ${r.skillDir}`);
      continue;
    }
    console.log(`\n${label}  ${r.skillDir}`);
    for (const f of r.findings) {
      console.log(
        `  ${f.severity === "error" ? "ERR " : "WARN"} [${f.rule}] ${f.message}`,
      );
    }
    errors += r.errorCount;
    warnings += r.warningCount;
  }
  console.log(
    `\n${results.length} skill(s) checked: ${errors} error(s), ${warnings} warning(s)`,
  );
}

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(2);
});
