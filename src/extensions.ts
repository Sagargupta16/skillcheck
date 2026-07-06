/** Typed registry of known client extension fields (beyond the agentskills.io
 * spec). Drives SC301 (known extension, warning) and SC302 (invalid extension
 * value). Sources: code.claude.com/docs skills pages, Cursor/Copilot/OpenCode
 * docs, verified 2026-07-06. */

export interface ExtensionField {
  /** Expected JS type(s) after YAML parse. */
  type: "string" | "boolean" | "string-or-array" | "object" | "enum";
  /** For enum type: allowed values. */
  values?: string[];
  /** Runtimes that read this field. */
  runtimes: string[];
  deprecated?: string;
}

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
  "display-name": { type: "string", runtimes: ["claude-code"] },
  "default-enabled": { type: "boolean", runtimes: ["claude-code"] },
  fallback: { type: "string", runtimes: ["claude-code"] },
  version: { type: "string", runtimes: ["claude-code"] },
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
      return typeof value === "boolean" ? null : `\`${key}\` must be a boolean`;
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
