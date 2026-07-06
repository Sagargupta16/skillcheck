import { readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type { LintOptions, LintResult } from "../types.js";
import { parseSkillMd } from "./parse.js";
import { runRules } from "./rules.js";

/** Lint a single skill directory containing a SKILL.md. */
export async function lintSkillDir(
  dir: string,
  options: LintOptions = {},
): Promise<LintResult> {
  const skillDir = resolve(dir);
  const dirName = basename(skillDir);
  const source = await readFile(join(skillDir, "SKILL.md"), "utf8");
  const parsed = parseSkillMd(source);

  const findings = runRules({
    parsed,
    dirName,
    strict: options.strict ?? false,
  });
  const skillName =
    parsed.frontmatter && typeof parsed.frontmatter.name === "string"
      ? parsed.frontmatter.name
      : null;

  return {
    skillDir,
    skillName,
    findings,
    errorCount: findings.filter((f) => f.severity === "error").length,
    warningCount: findings.filter((f) => f.severity === "warning").length,
  };
}
