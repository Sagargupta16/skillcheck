/** Corpus scan: lint every SKILL.md in a pinned set of public Agent Skills
 * repositories and write the measured results to docs/corpus.md (readable
 * report) and docs/corpus.json (the same numbers, plus per-skill rule codes).
 *
 * Run with `pnpm corpus`, which builds first: this script imports the built
 * library from dist/ so it measures exactly what ships to npm. Repositories
 * and their pinned commits live in scripts/corpus.json; clones are cached in
 * node_modules/.cache/skillcheck-corpus and re-fetched only when a pin
 * changes. The cache sits under node_modules on purpose: git, Biome and vitest
 * all skip it, so test files inside the cloned repos never run here.
 *
 *   pnpm corpus                scan the pinned commits
 *   pnpm corpus --update       re-pin every repo to its default-branch HEAD
 *                              first (then `pnpm lint:fix` reformats corpus.json)
 *   pnpm corpus --runs 9       benchmark repetitions (default 5)
 */

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { cpus, platform, release } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { glob } from "glob";
import {
  checkEvals,
  crossSkillFindings,
  lintSkillDir,
  RULES,
} from "../dist/index.js";
import type { LintResult, Profile } from "../src/types.ts";

interface CorpusFile {
  description: string;
  ignore: string[];
  repos: { repo: string; sha: string }[];
}

const root = fileURLToPath(new URL("..", import.meta.url));
const corpusPath = join(root, "scripts", "corpus.json");
const cacheDir = join(root, "node_modules", ".cache", "skillcheck-corpus");
const args = process.argv.slice(2);
const runsArg = args.indexOf("--runs");
const RUNS = runsArg === -1 ? 5 : Number(args[runsArg + 1]);
if (!Number.isInteger(RUNS) || RUNS < 1) {
  console.error("--runs expects a positive integer");
  process.exit(2);
}

const corpus = JSON.parse(readFileSync(corpusPath, "utf8")) as CorpusFile;
const version = (
  JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    version: string;
  }
).version;

function git(cwd: string, ...gitArgs: string[]): string {
  return execFileSync(
    "git",
    ["-c", "core.longpaths=true", "-c", "core.autocrlf=false", ...gitArgs],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

if (args.includes("--update")) {
  for (const entry of corpus.repos) {
    const out = git(
      root,
      "ls-remote",
      `https://github.com/${entry.repo}.git`,
      "HEAD",
    );
    entry.sha = out.split(/\s/)[0] ?? entry.sha;
  }
  writeFileSync(corpusPath, `${JSON.stringify(corpus, null, 2)}\n`, "utf8");
  console.log(`re-pinned ${corpus.repos.length} repos in scripts/corpus.json`);
}

/** Shallow-fetch exactly the pinned commit; reuse the cache when it matches. */
function checkout(repo: string, sha: string): string {
  const dir = join(cacheDir, repo.replace("/", "__"));
  if (existsSync(join(dir, ".git"))) {
    try {
      if (git(dir, "rev-parse", "HEAD") === sha) return dir;
    } catch {
      // broken cache entry: refetch below
    }
    rmSync(dir, { recursive: true, force: true });
  }
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q");
  git(
    dir,
    "fetch",
    "-q",
    "--depth",
    "1",
    `https://github.com/${repo}.git`,
    sha,
  );
  git(dir, "checkout", "-q", "FETCH_HEAD");
  return dir;
}

function recount(r: LintResult): void {
  r.errorCount = r.findings.filter((f) => f.severity === "error").length;
  r.warningCount = r.findings.filter((f) => f.severity === "warning").length;
  r.infoCount = r.findings.filter((f) => f.severity === "info").length;
}

/** The same pipeline `skillcheck lint` runs per invocation: lint, evals,
 * then cross-skill checks across the repo. */
async function lintRepo(
  skillDirs: string[],
  profile: Profile,
): Promise<LintResult[]> {
  const results: LintResult[] = [];
  for (const dir of skillDirs) {
    const result = await lintSkillDir(dir, { profile });
    result.findings.push(...(await checkEvals(dir, result.skillName)));
    recount(result);
    results.push(result);
  }
  crossSkillFindings(results);
  return results;
}

const PARITY_ERRORS = new Set(
  RULES.filter((r) => r.severity === "error" && r.code < "SC100").map(
    (r) => r.code,
  ),
);

/** skills-ref rejects every error-tier frontmatter finding and also every
 * client extension field, which skillcheck only warns about (SC301). */
function skillsRefRejects(r: LintResult): boolean {
  return r.findings.some(
    (f) =>
      (PARITY_ERRORS.has(f.code) && f.severity === "error") ||
      f.code === "SC301",
  );
}

interface RepoScan {
  repo: string;
  sha: string;
  skillDirs: string[];
  dir: string;
}

const scans: RepoScan[] = [];
for (const { repo, sha } of corpus.repos) {
  process.stdout.write(`fetch ${repo}@${sha.slice(0, 7)} ... `);
  const dir = checkout(repo, sha);
  const matches = await glob("**/{SKILL,skill}.md", {
    cwd: dir,
    ignore: corpus.ignore,
    absolute: true,
    dot: true, // same discovery as `skillcheck lint`
  });
  const skillDirs = [...new Set(matches.map((m) => dirname(m)))].sort();
  console.log(`${skillDirs.length} skills`);
  scans.push({ repo, sha, skillDirs, dir });
}

const strict = new Map<string, LintResult[]>();
const lenient = new Map<string, LintResult[]>();
for (const scan of scans) {
  strict.set(scan.repo, await lintRepo(scan.skillDirs, "strict"));
  lenient.set(scan.repo, await lintRepo(scan.skillDirs, "lenient"));
}

// Benchmark: wall time for the strict pass over the whole corpus, files warm
// in the OS cache from the passes above. Median of RUNS.
const times: number[] = [];
for (let i = 0; i < RUNS; i++) {
  const t0 = performance.now();
  for (const scan of scans) await lintRepo(scan.skillDirs, "strict");
  times.push(performance.now() - t0);
}
times.sort((a, b) => a - b);
const medianMs = times[Math.floor(times.length / 2)] ?? 0;
const minMs = times[0] ?? 0;
const maxMs = times[times.length - 1] ?? 0;

const allStrict = [...strict.values()].flat();
const allLenient = [...lenient.values()].flat();
const total = allStrict.length;
const count = (rs: LintResult[], pred: (r: LintResult) => boolean) =>
  rs.filter(pred).length;
const pct = (n: number, of = total) =>
  of === 0 ? "0.0%" : `${((100 * n) / of).toFixed(1)}%`;

const headline = {
  skills: total,
  repos: scans.length,
  clean: count(allStrict, (r) => r.errorCount === 0 && r.warningCount === 0),
  errorsStrict: count(allStrict, (r) => r.errorCount > 0),
  errorsLenient: count(allLenient, (r) => r.errorCount > 0),
  skillsRefRejects: count(allStrict, skillsRefRejects),
  withWarnings: count(allStrict, (r) => r.warningCount > 0),
  reposWithErrors: [...strict.values()].filter((rs) =>
    rs.some((r) => r.errorCount > 0),
  ).length,
};

// One large repository can dominate the totals, so the same two rates are
// also reported without it.
const [largestRepo = "", largestResults = []] =
  [...strict].sort((a, b) => b[1].length - a[1].length)[0] ?? [];
const rest = [...strict]
  .filter(([repo]) => repo !== largestRepo)
  .flatMap(([, rs]) => rs);
const withoutLargest = {
  repo: largestRepo,
  repoSkills: largestResults.length,
  skills: rest.length,
  errorsStrict: count(rest, (r) => r.errorCount > 0),
  skillsRefRejects: count(rest, skillsRefRejects),
};

const byRule = new Map<string, { skills: number; findings: number }>();
for (const r of allStrict) {
  const seen = new Set<string>();
  for (const f of r.findings) {
    const row = byRule.get(f.code) ?? { skills: 0, findings: 0 };
    row.findings++;
    if (!seen.has(f.code)) {
      row.skills++;
      seen.add(f.code);
    }
    byRule.set(f.code, row);
  }
}
const ruleRows = [...byRule]
  .map(([code, row]) => {
    const meta = RULES.find((r) => r.code === code);
    return {
      code,
      alias: meta?.alias ?? "",
      severity: meta?.severity ?? "",
      ...row,
    };
  })
  .sort((a, b) => b.skills - a.skills || a.code.localeCompare(b.code));

const repoRows = scans.map((scan) => {
  const rs = strict.get(scan.repo) ?? [];
  return {
    repo: scan.repo,
    sha: scan.sha,
    skills: rs.length,
    withErrors: count(rs, (r) => r.errorCount > 0),
    withWarnings: count(rs, (r) => r.warningCount > 0),
    clean: count(rs, (r) => r.errorCount === 0 && r.warningCount === 0),
  };
});

const skills = scans.flatMap((scan) =>
  (strict.get(scan.repo) ?? []).map((r) => ({
    repo: scan.repo,
    path: relative(scan.dir, r.skillDir).replace(/\\/g, "/"),
    errors: r.errorCount,
    warnings: r.warningCount,
    codes: [...new Set(r.findings.map((f) => f.code))].sort(),
  })),
);

const cpu = cpus()[0]?.model.trim() ?? "unknown cpu";
const machine = `${cpu}, ${platform()} ${release()}, Node ${process.version}`;
const generated = new Date().toISOString().slice(0, 10);

writeFileSync(
  join(root, "docs", "corpus.json"),
  `${JSON.stringify(
    {
      generated,
      skillcheckVersion: version,
      ignore: corpus.ignore,
      headline,
      withoutLargest,
      benchmark: {
        runs: RUNS,
        medianMs: Math.round(medianMs),
        minMs: Math.round(minMs),
        maxMs: Math.round(maxMs),
        machine,
      },
      rules: ruleRows,
      repos: repoRows,
      skills,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

const md: string[] = [
  "# Corpus scan",
  "",
  `<!-- Generated by \`pnpm corpus\` (scripts/corpus-scan.ts). Do not edit by hand. -->`,
  "",
  `skillcheck ${version} run over **${total} skills** in **${scans.length} public repositories** on ${generated}. Every repository is pinned to a commit in [scripts/corpus.json](../scripts/corpus.json), so \`pnpm corpus\` reproduces these numbers. Raw per-skill results: [corpus.json](corpus.json).`,
  "",
  "## Headline",
  "",
  "| Metric | Skills | Share |",
  "| --- | ---: | ---: |",
  `| Clean: no errors and no warnings (strict profile, the default) | ${headline.clean} | ${pct(headline.clean)} |`,
  `| At least one error, strict profile | ${headline.errorsStrict} | ${pct(headline.errorsStrict)} |`,
  `| At least one error, lenient profile | ${headline.errorsLenient} | ${pct(headline.errorsLenient)} |`,
  `| Rejected by skills-ref strict validation (a frontmatter error or a client extension field) | ${headline.skillsRefRejects} | ${pct(headline.skillsRefRejects)} |`,
  `| At least one warning | ${headline.withWarnings} | ${pct(headline.withWarnings)} |`,
  `| At least one error, strict, without ${withoutLargest.repo} (the largest repository, ${withoutLargest.repoSkills} skills) | ${withoutLargest.errorsStrict} of ${withoutLargest.skills} | ${pct(withoutLargest.errorsStrict, withoutLargest.skills)} |`,
  `| Rejected by skills-ref, without ${withoutLargest.repo} | ${withoutLargest.skillsRefRejects} of ${withoutLargest.skills} | ${pct(withoutLargest.skillsRefRejects, withoutLargest.skills)} |`,
  "",
  `${headline.reposWithErrors} of ${scans.length} repositories ship at least one skill with an error under the default strict profile.`,
  "",
  "## Most common findings",
  "",
  "Strict profile. A skill counts once per rule, however many times the rule fires in it.",
  "",
  "| Rule | Severity | Skills | Share | Findings |",
  "| --- | --- | ---: | ---: | ---: |",
  ...ruleRows.map(
    (r) =>
      `| [${r.code}](rules.md#${r.code.toLowerCase()}) ${r.alias} | ${r.severity} | ${r.skills} | ${pct(r.skills)} | ${r.findings} |`,
  ),
  "",
  "## Per repository",
  "",
  "| Repository | Commit | Skills | With errors | With warnings | Clean |",
  "| --- | --- | ---: | ---: | ---: | ---: |",
  ...repoRows.map(
    (r) =>
      `| [${r.repo}](https://github.com/${r.repo}/tree/${r.sha}) | \`${r.sha.slice(0, 7)}\` | ${r.skills} | ${r.withErrors} | ${r.withWarnings} | ${r.clean} |`,
  ),
  "",
  "## Lint speed",
  "",
  `Wall time for the full strict pass (lint, evals check, cross-skill check) over all ${total} skills, files warm in the OS cache, median of ${RUNS} runs.`,
  "",
  "| Skills | Median total | Fastest | Slowest | Per skill (median) | Machine |",
  "| ---: | ---: | ---: | ---: | ---: | --- |",
  `| ${total} | ${Math.round(medianMs)} ms | ${Math.round(minMs)} ms | ${Math.round(maxMs)} ms | ${(medianMs / Math.max(total, 1)).toFixed(2)} ms | ${machine} |`,
  "",
  "## Method",
  "",
  `- Discovery matches \`**/SKILL.md\` and \`**/skill.md\` in each checkout, skipping ${corpus.ignore.map((g) => `\`${g}\``).join(", ")}, so test fixtures that are broken on purpose are not counted.`,
  "- Each repository is linted as one `skillcheck lint <repo>` run would lint it: per-skill rules, `evals/evals.json` validation and cross-skill duplicate-name checks within that repository. No config file, no overrides.",
  "- The skills-ref row counts skills with any error-tier SC0xx finding or any SC301 extension field. skills-ref rejects unknown frontmatter fields outright; skillcheck reports known client extensions as warnings because the runtimes that define them load the skill anyway.",
  "",
];
writeFileSync(join(root, "docs", "corpus.md"), md.join("\n"), "utf8");

console.log(
  `\n${total} skills in ${scans.length} repos: ${headline.clean} clean, ${headline.errorsStrict} with errors (strict), ${headline.skillsRefRejects} rejected by skills-ref; median ${Math.round(medianMs)} ms over ${RUNS} runs`,
);
console.log("wrote docs/corpus.md and docs/corpus.json");
