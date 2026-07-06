import type { RuleMeta } from "../types.js";

/** Rule registry: codes are stable, never renumbered or recycled.
 * SC0xx frontmatter, SC1xx structure/references, SC2xx body, SC3xx extensions. */
export const RULES: RuleMeta[] = [
  // --- Frontmatter (skills-ref parity = error) ---
  {
    code: "SC001",
    alias: "skill-md-missing",
    severity: "error",
    fixable: null,
    summary: "Skill directory must contain SKILL.md",
  },
  {
    code: "SC002",
    alias: "frontmatter-missing",
    severity: "error",
    fixable: null,
    summary: "SKILL.md must start with YAML frontmatter",
  },
  {
    code: "SC003",
    alias: "frontmatter-unclosed",
    severity: "error",
    fixable: null,
    summary: "Frontmatter must be closed with ---",
  },
  {
    code: "SC004",
    alias: "frontmatter-invalid-yaml",
    severity: "error",
    fixable: null,
    summary: "Frontmatter must be valid strict YAML",
  },
  {
    code: "SC005",
    alias: "frontmatter-not-mapping",
    severity: "error",
    fixable: null,
    summary: "Frontmatter must be a YAML mapping",
  },
  {
    code: "SC006",
    alias: "name-missing",
    severity: "error",
    fixable: null,
    summary: "name is required",
  },
  {
    code: "SC007",
    alias: "description-missing",
    severity: "error",
    fixable: null,
    summary: "description is required",
  },
  {
    code: "SC008",
    alias: "name-empty",
    severity: "error",
    fixable: null,
    summary: "name must be a non-empty string",
  },
  {
    code: "SC009",
    alias: "name-too-long",
    severity: "error",
    lenientSeverity: "warning",
    fixable: null,
    summary: "name must be at most 64 characters",
  },
  {
    code: "SC010",
    alias: "name-not-lowercase",
    severity: "error",
    fixable: "safe",
    summary: "name must be lowercase",
  },
  {
    code: "SC011",
    alias: "name-edge-hyphen",
    severity: "error",
    fixable: "safe",
    summary: "name cannot start or end with a hyphen",
  },
  {
    code: "SC012",
    alias: "name-consecutive-hyphens",
    severity: "error",
    fixable: "safe",
    summary: "name cannot contain consecutive hyphens",
  },
  {
    code: "SC013",
    alias: "name-invalid-chars",
    severity: "error",
    fixable: null,
    summary: "name may only contain letters, digits, and hyphens",
  },
  {
    code: "SC014",
    alias: "name-dir-mismatch",
    severity: "error",
    lenientSeverity: "warning",
    fixable: null,
    summary: "directory name must match skill name",
  },
  {
    code: "SC015",
    alias: "description-empty",
    severity: "error",
    fixable: null,
    summary: "description must be a non-empty string",
  },
  {
    code: "SC016",
    alias: "description-too-long",
    severity: "error",
    fixable: null,
    summary: "description must be at most 1024 characters",
  },
  {
    code: "SC017",
    alias: "compatibility-invalid",
    severity: "error",
    fixable: null,
    summary: "compatibility must be a string of at most 500 characters",
  },
  {
    code: "SC018",
    alias: "unknown-frontmatter-field",
    severity: "error",
    lenientSeverity: "warning",
    fixable: null,
    summary: "frontmatter field is not in the spec or a known extension",
  },
  {
    code: "SC019",
    alias: "metadata-not-string-map",
    severity: "warning",
    fixable: null,
    summary: "metadata should be a string-to-string map",
  },
  {
    code: "SC020",
    alias: "skill-md-lowercase-filename",
    severity: "warning",
    fixable: "safe",
    summary: "skill.md found; canonical filename is SKILL.md",
  },
  {
    code: "SC021",
    alias: "unquoted-colon-description",
    severity: "warning",
    fixable: "safe",
    summary: "unquoted colon in name/description value breaks lenient parsers",
  },
  // --- Structure + references (beyond skills-ref: warning/info only) ---
  {
    code: "SC101",
    alias: "broken-relative-reference",
    severity: "warning",
    fixable: null,
    summary: "referenced bundled file does not exist",
  },
  {
    code: "SC102",
    alias: "absolute-path-reference",
    severity: "warning",
    fixable: null,
    summary: "body references an absolute path",
  },
  {
    code: "SC103",
    alias: "deep-reference-chain",
    severity: "info",
    fixable: null,
    summary: "bundled reference chains deeper than one level",
  },
  {
    code: "SC104",
    alias: "unreferenced-bundled-file",
    severity: "info",
    fixable: null,
    summary: "bundled file never referenced from SKILL.md",
  },
  {
    code: "SC105",
    alias: "duplicate-skill-name",
    severity: "warning",
    fixable: null,
    summary: "two skills resolve to the same name",
  },
  {
    code: "SC106",
    alias: "non-utf8-encoding",
    severity: "warning",
    fixable: null,
    summary: "SKILL.md is not valid UTF-8",
  },
  {
    code: "SC107",
    alias: "hidden-unicode",
    severity: "warning",
    fixable: "unsafe",
    summary: "zero-width or bidi control characters present",
  },
  {
    code: "SC108",
    alias: "legacy-basedir-placeholder",
    severity: "warning",
    fixable: "safe",
    summary: "deprecated {baseDir} placeholder",
  },
  // --- Body (SC2xx) ---
  {
    code: "SC201",
    alias: "body-empty",
    severity: "warning",
    fixable: null,
    summary: "SKILL.md body is empty",
  },
  {
    code: "SC202",
    alias: "body-too-many-lines",
    severity: "warning",
    fixable: null,
    summary: "body exceeds 500 lines",
  },
  {
    code: "SC203",
    alias: "body-too-many-tokens",
    severity: "warning",
    fixable: null,
    summary: "body exceeds ~5000 tokens",
  },
  // --- Extensions / portability (SC3xx) ---
  {
    code: "SC301",
    alias: "extension-field",
    severity: "warning",
    fixable: null,
    summary: "client extension field (fails strict skills-ref validation)",
  },
  {
    code: "SC302",
    alias: "extension-invalid-value",
    severity: "warning",
    fixable: null,
    summary: "extension field has an invalid value",
  },
  // --- Evals (SC4xx) ---
  {
    code: "SC401",
    alias: "evals-invalid",
    severity: "error",
    fixable: null,
    summary: "evals/evals.json fails schema or semantic validation",
  },
  {
    code: "SC402",
    alias: "evals-advisory",
    severity: "warning",
    fixable: null,
    summary: "evals/evals.json advisory (coverage gaps)",
  },
];

const byCode = new Map(RULES.map((r) => [r.code, r]));
const byAlias = new Map(RULES.map((r) => [r.alias, r]));

export function getRule(codeOrAlias: string): RuleMeta | undefined {
  return (
    byCode.get(codeOrAlias.toUpperCase()) ??
    byAlias.get(codeOrAlias.toLowerCase())
  );
}
