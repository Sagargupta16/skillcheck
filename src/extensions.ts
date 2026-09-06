/** Typed registry of known client extension fields (beyond the agentskills.io
 * spec). Drives SC301 (known extension, warning) and SC302 (invalid extension
 * value). Sources: code.claude.com/docs skills pages, Cursor/Copilot/OpenCode
 * docs.
 *
 * Verified 2026-07-06, re-verified 2026-09-06 against
 * https://code.claude.com/docs/en/skills. Re-check on every release: a field
 * missing from this registry becomes a hard SC018 error on a skill that its
 * runtime accepts, which is the exact failure SC301 exists to prevent. */

export interface ExtensionField {
  /** Expected JS type(s) after YAML parse. */
  type: "string" | "boolean" | "string-or-array" | "object" | "enum";
  /** For enum type: allowed values. */
  values?: string[];
  /** Runtimes that read this field. */
  runtimes: string[];
  /** Appended to the SC301 message: a legacy spelling, or a note that the
   * field is absent from the runtime's published frontmatter reference. */
  deprecated?: string;
}

/** Fields kept in the registry (so they stay SC301 warnings rather than SC018
 * errors) but absent from the runtime's current frontmatter reference. */
const UNDOCUMENTED =
  "not in the Claude Code frontmatter reference as of 2026-09-06";

export const KNOWN_EXTENSIONS: Record<string, ExtensionField> = {
  when_to_use: { type: "string", runtimes: ["claude-code"] },
  "argument-hint": { type: "string", runtimes: ["claude-code", "copilot"] },
  arguments: { type: "string-or-array", runtimes: ["claude-code"] },
  "disable-model-invocation": {
    type: "boolean",
    runtimes: ["claude-code", "cursor", "copilot"],
  },
  "user-invocable": { type: "boolean", runtimes: ["claude-code", "copilot"] },
  "disallowed-tools": { type: "string-or-array", runtimes: ["claude-code"] },
  model: { type: "string", runtimes: ["claude-code"] },
  effort: {
    type: "enum",
    values: ["low", "medium", "high", "xhigh", "max"],
    runtimes: ["claude-code"],
  },
  context: {
    type: "enum",
    values: ["fork"],
    runtimes: ["claude-code", "copilot"],
  },
  agent: { type: "string", runtimes: ["claude-code"] },
  // Claude Code v2.1.218+; only meaningful alongside `context: fork`.
  background: { type: "boolean", runtimes: ["claude-code"] },
  hooks: { type: "object", runtimes: ["claude-code"] },
  paths: { type: "string-or-array", runtimes: ["claude-code", "cursor"] },
  globs: {
    type: "string-or-array",
    runtimes: ["cursor"],
    deprecated: "Cursor legacy; use `paths`",
  },
  shell: {
    type: "enum",
    values: ["bash", "powershell"],
    runtimes: ["claude-code"],
  },
  "display-name": {
    type: "string",
    runtimes: ["claude-code"],
    deprecated: UNDOCUMENTED,
  },
  "default-enabled": {
    type: "boolean",
    runtimes: ["claude-code"],
    deprecated: UNDOCUMENTED,
  },
  fallback: {
    type: "string",
    runtimes: ["claude-code"],
    deprecated: UNDOCUMENTED,
  },
  version: {
    type: "string",
    runtimes: ["claude-code"],
    deprecated: UNDOCUMENTED,
  },
};

/** Spec-official frontmatter fields (ALLOWED_FIELDS in skills-ref). */
export const SPEC_FIELDS = new Set([
  "name",
  "description",
  "license",
  "allowed-tools",
  "metadata",
  "compatibility",
]);

/** YAML 1.1 boolean spellings. Claude Code accepts these (any case) for its
 * boolean frontmatter fields as of v2.1.218, on top of `true`/`false`; the
 * YAML 1.2 core schema this parser follows leaves them as plain strings, and
 * `1`/`0` as numbers. Extension fields only -- spec fields keep strict
 * skills-ref parity. */
const BOOLEAN_WORDS = new Set(["true", "false", "yes", "no", "on", "off"]);

function isExtensionBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return true;
  if (typeof value === "number") return value === 0 || value === 1;
  if (typeof value === "string") return BOOLEAN_WORDS.has(value.toLowerCase());
  return false;
}

/** Validate an extension field's value against its registry entry.
 * Returns an error string, or null if valid. */
export function validateExtensionValue(
  key: string,
  value: unknown,
): string | null {
  const spec = KNOWN_EXTENSIONS[key];
  if (!spec) return null;
  switch (spec.type) {
    case "string":
      return typeof value === "string" ? null : `\`${key}\` must be a string`;
    case "boolean":
      return isExtensionBoolean(value)
        ? null
        : `\`${key}\` must be a boolean (true/false, or yes/no/on/off/1/0)`;
    case "string-or-array":
      if (typeof value === "string") return null;
      if (Array.isArray(value) && value.every((v) => typeof v === "string"))
        return null;
      return `\`${key}\` must be a string or an array of strings`;
    case "object":
      return value !== null &&
        typeof value === "object" &&
        !Array.isArray(value)
        ? null
        : `\`${key}\` must be a mapping`;
    case "enum":
      return typeof value === "string" && spec.values?.includes(value)
        ? null
        : `\`${key}\` must be one of: ${spec.values?.join(", ")}`;
  }
}
