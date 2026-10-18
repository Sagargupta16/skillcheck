import type { Finding, ParsedSkill, Profile } from "../types.js";
import { parseSkillMd } from "./parse.js";
import { runRules } from "./rules.js";

export interface SourceLintOptions {
  /** Name of the directory the SKILL.md sits in; SC014 compares it with
   * `name`. Defaults to the skill's own name, so pasted text is not flagged
   * for a directory it does not have. */
  dirName?: string;
  /** Lint profile. Default "strict" (skills-ref parity). */
  profile?: Profile;
  /** Skill-relative posix paths of the files bundled next to SKILL.md.
   * SC101 and SC104 only run when this is non-empty. */
  bundledFiles?: string[];
}

export interface SourceLintResult {
  parsed: ParsedSkill;
  /** NFKC-normalized `name`, or null when it is missing or not a string. */
  skillName: string | null;
  findings: Finding[];
}

/** Lint SKILL.md text without touching a filesystem: every per-file rule
 * (SC0xx, SC101/SC102/SC104 against `bundledFiles`, SC107/SC108, SC2xx,
 * SC3xx). Pure, so the same code runs in Node and in the browser playground.
 * lintSkillDir wraps it with the checks that need the disk: SC001, SC020,
 * SC103 and SC106. */
export function lintSkillSource(
  source: string,
  options: SourceLintOptions = {},
): SourceLintResult {
  const parsed = parseSkillMd(source.replace(/^﻿/, ""));
  const skillName =
    parsed.frontmatter && typeof parsed.frontmatter.name === "string"
      ? parsed.frontmatter.name.trim().normalize("NFKC")
      : null;
  const findings = runRules({
    parsed,
    dirName: options.dirName ?? skillName ?? "",
    profile: options.profile ?? "strict",
    bundledFiles: options.bundledFiles ?? [],
  });
  return { parsed, skillName, findings };
}
