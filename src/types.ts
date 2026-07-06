/** Severity tiers: `error` = skills-ref 0.1.0 strict parity, `warning` =
 * beyond-parity checks + client-guide lenient downgrades, `info` = advisory
 * heuristics that never gate CI. */
export type Severity = "error" | "warning" | "info";

/** Lint profile: `strict` = skills-ref parity (default), `lenient` =
 * client-implementation-guide behavior (name-too-long and dir-mismatch
 * downgrade to warnings; extension fields stay warnings). */
export type Profile = "strict" | "lenient";

export interface RuleMeta {
  /** Stable code, e.g. "SC013". Never renumbered or recycled. */
  code: string;
  /** Kebab-case alias, interchangeable with the code everywhere. */
  alias: string;
  /** Default severity under the strict profile. */
  severity: Severity;
  /** Severity under the lenient profile (defaults to `severity`). */
  lenientSeverity?: Severity;
  /** Autofix classification; v0.2 tags but does not fix. */
  fixable: "safe" | "unsafe" | null;
  summary: string;
}

export interface Finding {
  code: string;
  alias: string;
  severity: Severity;
  message: string;
  /** Path of the file the finding is anchored to, relative to the skill dir. */
  file: string;
  line?: number;
  /** Optional fix-it suggestion printed in pretty output. */
  suggestion?: string;
}

export interface LintResult {
  skillDir: string;
  skillName: string | null;
  findings: Finding[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
}

export interface LintOptions {
  /** Lint profile. Default "strict" (skills-ref parity). */
  profile?: Profile;
  /** Per-rule severity overrides from config: code/alias -> off|warn|error. */
  ruleOverrides?: Record<string, "off" | "warn" | "error" | "info">;
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
  /** skills-ref-parity parse error message, if frontmatter is unusable. */
  parseError: string | null;
  /** Raw frontmatter text (for raw-text scans like SC021). */
  rawFrontmatter: string;
  /** Markdown body (everything after the closing frontmatter fence). */
  body: string;
  /** 1-based line number where the body starts. */
  bodyStartLine: number;
}
