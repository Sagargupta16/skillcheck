import type { Finding, ParsedSkill, Severity } from "../types.js";

/** Spec fields per agentskills.io specification (6 total). */
const SPEC_FIELDS = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
]);

/** Known client extension fields (Claude Code and friends). These fail the
 * strict skills-ref validator but are loaded fine by lenient clients, so they
 * warn by default and only error under --strict. */
const KNOWN_EXTENSIONS = new Set([
  "when_to_use",
  "disable-model-invocation",
  "user-invocable",
  "disallowed-tools",
  "model",
  "effort",
  "context",
  "agent",
  "hooks",
  "paths",
  "argument-hint",
  "arguments",
  "shell",
  "version",
]);

/** Spec: 1-64 chars, lowercase alphanumeric + single hyphens. */
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const NAME_MAX = 64;
const DESCRIPTION_MAX = 1024;
const COMPATIBILITY_MAX = 500;
const BODY_LINE_LIMIT = 500;
/** Rough chars-per-token heuristic for the 5000-token body recommendation. */
const BODY_TOKEN_LIMIT = 5000;
const CHARS_PER_TOKEN = 4;

interface RuleContext {
  parsed: ParsedSkill;
  dirName: string;
  strict: boolean;
}

function finding(
  rule: string,
  severity: Severity,
  message: string,
  line?: number,
): Finding {
  return {
    rule,
    severity,
    message,
    file: "SKILL.md",
    ...(line !== undefined ? { line } : {}),
  };
}

export function runRules(ctx: RuleContext): Finding[] {
  const findings: Finding[] = [];
  const { parsed, dirName, strict } = ctx;

  if (parsed.parseError !== null || parsed.frontmatter === null) {
    findings.push(
      finding(
        "frontmatter-parse",
        "error",
        `frontmatter unparseable (client-guide behavior: skill is skipped): ${parsed.parseError ?? "missing"}`,
        1,
      ),
    );
    return findings;
  }

  const fm = parsed.frontmatter;

  // name: required, format, dir match
  if (typeof fm.name !== "string" || fm.name.length === 0) {
    findings.push(
      finding(
        "name-required",
        "error",
        "frontmatter `name` is required and must be a non-empty string",
      ),
    );
  } else {
    const name = fm.name.normalize("NFKC");
    if (name.length > NAME_MAX) {
      findings.push(
        finding(
          "name-length",
          "error",
          `\`name\` exceeds ${NAME_MAX} characters (${name.length})`,
        ),
      );
    }
    if (!NAME_RE.test(name)) {
      findings.push(
        finding(
          "name-format",
          "error",
          `\`name\` must match ${NAME_RE} (lowercase alphanumeric, single hyphens, no leading/trailing hyphen): got "${fm.name}"`,
        ),
      );
    }
    if (name !== dirName) {
      // Spec says MUST match; client guide says warn and load anyway.
      findings.push(
        finding(
          "name-dir-match",
          strict ? "error" : "warning",
          `\`name\` ("${name}") does not match parent directory ("${dirName}")`,
        ),
      );
    }
  }

  // description: required, bounds
  if (
    typeof fm.description !== "string" ||
    fm.description.trim().length === 0
  ) {
    findings.push(
      finding(
        "description-required",
        "error",
        "frontmatter `description` is required and must be non-empty (clients skip skills without it)",
      ),
    );
  } else if (fm.description.length > DESCRIPTION_MAX) {
    findings.push(
      finding(
        "description-length",
        "error",
        `\`description\` exceeds ${DESCRIPTION_MAX} characters (${fm.description.length})`,
      ),
    );
  }

  // optional field types
  if (fm.license !== undefined && typeof fm.license !== "string") {
    findings.push(
      finding("license-type", "error", "`license` must be a string"),
    );
  }
  if (fm.compatibility !== undefined) {
    if (typeof fm.compatibility !== "string") {
      findings.push(
        finding(
          "compatibility-type",
          "error",
          "`compatibility` must be a string",
        ),
      );
    } else if (fm.compatibility.length > COMPATIBILITY_MAX) {
      findings.push(
        finding(
          "compatibility-length",
          "error",
          `\`compatibility\` exceeds ${COMPATIBILITY_MAX} characters (${fm.compatibility.length})`,
        ),
      );
    }
  }
  if (fm.metadata !== undefined) {
    const md = fm.metadata;
    const isStringMap =
      md !== null &&
      typeof md === "object" &&
      !Array.isArray(md) &&
      Object.values(md).every((v) => typeof v === "string");
    if (!isStringMap) {
      findings.push(
        finding(
          "metadata-type",
          "error",
          "`metadata` must be a map of string keys to string values",
        ),
      );
    }
  }
  if (
    fm["allowed-tools"] !== undefined &&
    typeof fm["allowed-tools"] !== "string"
  ) {
    findings.push(
      finding(
        "allowed-tools-type",
        "error",
        "`allowed-tools` must be a space-separated string (spec: experimental)",
      ),
    );
  }

  // unknown / extension fields
  for (const key of Object.keys(fm)) {
    if (SPEC_FIELDS.has(key)) continue;
    if (KNOWN_EXTENSIONS.has(key)) {
      findings.push(
        finding(
          "extension-field",
          strict ? "error" : "warning",
          `\`${key}\` is a client extension, not in the Agent Skills spec (fails strict skills-ref validation)`,
        ),
      );
    } else {
      findings.push(
        finding(
          "unknown-field",
          strict ? "error" : "warning",
          `\`${key}\` is not a spec field or known client extension`,
        ),
      );
    }
  }

  // body recommendations (SHOULD-level)
  const bodyLines = parsed.body.split(/\r?\n/).length;
  if (bodyLines > BODY_LINE_LIMIT) {
    findings.push(
      finding(
        "body-lines",
        "warning",
        `body is ${bodyLines} lines; spec recommends under ${BODY_LINE_LIMIT}`,
      ),
    );
  }
  const approxTokens = Math.round(parsed.body.length / CHARS_PER_TOKEN);
  if (approxTokens > BODY_TOKEN_LIMIT) {
    findings.push(
      finding(
        "body-tokens",
        "warning",
        `body is ~${approxTokens} tokens; spec recommends under ${BODY_TOKEN_LIMIT} (move detail to references/)`,
      ),
    );
  }
  if (parsed.body.trim().length === 0) {
    findings.push(
      finding(
        "body-empty",
        "warning",
        "SKILL.md body is empty; the skill provides no instructions",
      ),
    );
  }

  return findings;
}
