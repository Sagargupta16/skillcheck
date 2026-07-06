/** Severity tiers mirror the ecosystem split: `error` = skills-ref strict
 * parity, `warning` = client-implementation-guide lenient parity. */
export type Severity = "error" | "warning";

export interface Finding {
  rule: string;
  severity: Severity;
  message: string;
  /** Path of the file the finding is anchored to, relative to the skill dir. */
  file: string;
  line?: number;
}

export interface LintResult {
  skillDir: string;
  skillName: string | null;
  findings: Finding[];
  errorCount: number;
  warningCount: number;
}

export interface LintOptions {
  /** Treat spec-unknown frontmatter fields as errors (skills-ref parity).
   * Default false: known client extensions and unknown fields warn. */
  strict?: boolean;
}

/** Parsed SKILL.md frontmatter. Unknown fields are preserved for rule checks. */
export interface SkillFrontmatter {
  name?: unknown;
  description?: unknown;
  license?: unknown;
  compatibility?: unknown;
  metadata?: unknown;
  "allowed-tools"?: unknown;
  [key: string]: unknown;
}

export interface ParsedSkill {
  frontmatter: SkillFrontmatter | null;
  /** Raw YAML parse error, if frontmatter could not be parsed. */
  parseError: string | null;
  /** Markdown body (everything after the closing frontmatter fence). */
  body: string;
  /** 1-based line number where the body starts. */
  bodyStartLine: number;
}
