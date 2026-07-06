import {
  KNOWN_EXTENSIONS,
  SPEC_FIELDS,
  validateExtensionValue,
} from "../extensions.js";
import type { Finding, ParsedSkill, Profile, Severity } from "../types.js";
import { getRule } from "./registry.js";

const NAME_MAX = 64;
const DESCRIPTION_MAX = 1024;
const COMPATIBILITY_MAX = 500;
const BODY_LINE_LIMIT = 500;
/** Rough chars-per-token heuristic for the 5000-token body recommendation. */
const BODY_TOKEN_LIMIT = 5000;
const CHARS_PER_TOKEN = 4;

/** JS equivalent of Python str.isalnum() per char: Unicode letters + numbers.
 * NOT [a-z0-9] -- i18n names (Chinese, lowercase Cyrillic) are valid. */
const NAME_CHARS_RE = /^[\p{L}\p{N}-]*$/u;

/** Zero-width + bidi control characters (Trojan-Source class). */
const HIDDEN_UNICODE_RE = /[​-‍⁠‪-‮⁦-⁩]/;

export interface RuleContext {
  parsed: ParsedSkill;
  dirName: string;
  profile: Profile;
  /** Files bundled in the skill dir (relative posix paths), for SC101/SC104. */
  bundledFiles?: string[];
}

function make(
  code: string,
  message: string,
  line?: number,
  suggestion?: string,
): Finding {
  const meta = getRule(code);
  if (!meta) throw new Error(`unknown rule code ${code}`);
  return {
    code: meta.code,
    alias: meta.alias,
    severity: meta.severity,
    message,
    file: "SKILL.md",
    ...(line !== undefined ? { line } : {}),
    ...(suggestion !== undefined ? { suggestion } : {}),
  };
}

/** Apply profile downgrades (client-guide lenient tier). */
function applyProfile(findings: Finding[], profile: Profile): Finding[] {
  if (profile !== "lenient") return findings;
  return findings.map((f) => {
    const meta = getRule(f.code);
    if (meta?.lenientSeverity && meta.lenientSeverity !== f.severity) {
      return { ...f, severity: meta.lenientSeverity as Severity };
    }
    return f;
  });
}

export function runRules(ctx: RuleContext): Finding[] {
  const { parsed, dirName } = ctx;
  const findings: Finding[] = [];

  // Raw-text scan runs even on parse failure -- an unquoted ': ' in the
  // description is often WHY the parse failed (SC021 is the fix hint).
  scanUnquotedColons(parsed, findings);

  if (parsed.parseError !== null || parsed.frontmatter === null) {
    // Map the parity parse errors to their codes.
    const msg = parsed.parseError ?? "SKILL.md frontmatter unparseable";
    let code = "SC004";
    if (msg.startsWith("SKILL.md must start with")) code = "SC002";
    else if (msg.includes("not properly closed")) code = "SC003";
    else if (msg.includes("must be a YAML mapping")) code = "SC005";
    findings.push(make(code, msg, 1));
    return applyProfile(findings, ctx.profile);
  }

  const fm = parsed.frontmatter;

  // --- name (skills-ref _validate_name, in order, with early return) ---
  if (!("name" in fm)) {
    findings.push(make("SC006", "Missing required field in frontmatter: name"));
  } else if (typeof fm.name !== "string" || fm.name.trim().length === 0) {
    findings.push(make("SC008", "Field 'name' must be a non-empty string"));
  } else {
    const name = fm.name.trim().normalize("NFKC");
    if (name.length > NAME_MAX) {
      findings.push(
        make(
          "SC009",
          `Skill name '${name}' exceeds ${NAME_MAX} character limit (${name.length} chars)`,
        ),
      );
    }
    if (name !== name.toLowerCase()) {
      findings.push(
        make(
          "SC010",
          `Skill name '${name}' must be lowercase`,
          undefined,
          `rename to '${name.toLowerCase()}'`,
        ),
      );
    }
    if (name.startsWith("-") || name.endsWith("-")) {
      findings.push(
        make("SC011", "Skill name cannot start or end with a hyphen"),
      );
    }
    if (name.includes("--")) {
      findings.push(
        make("SC012", "Skill name cannot contain consecutive hyphens"),
      );
    }
    if (!NAME_CHARS_RE.test(name)) {
      findings.push(
        make(
          "SC013",
          `Skill name '${name}' contains invalid characters. Only letters, digits, and hyphens are allowed.`,
        ),
      );
    }
    const normalizedDir = dirName.normalize("NFKC");
    if (name !== normalizedDir) {
      findings.push(
        make(
          "SC014",
          `Directory name '${normalizedDir}' must match skill name '${name}'`,
        ),
      );
    }
  }

  // --- description ---
  if (!("description" in fm)) {
    findings.push(
      make("SC007", "Missing required field in frontmatter: description"),
    );
  } else if (
    typeof fm.description !== "string" ||
    fm.description.trim().length === 0
  ) {
    findings.push(
      make("SC015", "Field 'description' must be a non-empty string"),
    );
  } else if (fm.description.length > DESCRIPTION_MAX) {
    findings.push(
      make(
        "SC016",
        `Description exceeds ${DESCRIPTION_MAX} character limit (${fm.description.length} chars)`,
      ),
    );
  }

  // --- compatibility ---
  if (fm.compatibility !== undefined) {
    if (typeof fm.compatibility !== "string") {
      findings.push(make("SC017", "Field 'compatibility' must be a string"));
    } else if (fm.compatibility.length > COMPATIBILITY_MAX) {
      findings.push(
        make(
          "SC017",
          `Compatibility exceeds ${COMPATIBILITY_MAX} character limit (${fm.compatibility.length} chars)`,
        ),
      );
    }
  }

  // --- metadata ---
  if (fm.metadata !== undefined) {
    const md = fm.metadata;
    const isStringMap =
      md !== null &&
      typeof md === "object" &&
      !Array.isArray(md) &&
      Object.values(md).every(
        (v) =>
          typeof v === "string" ||
          typeof v === "number" ||
          typeof v === "boolean",
      );
    if (!isStringMap) {
      findings.push(
        make(
          "SC019",
          "`metadata` should be a map of string keys to string values",
        ),
      );
    }
  }

  // --- allowed-tools (spec: string; some clients accept arrays -- warn) ---
  if (
    fm["allowed-tools"] !== undefined &&
    typeof fm["allowed-tools"] !== "string"
  ) {
    if (
      Array.isArray(fm["allowed-tools"]) &&
      fm["allowed-tools"].every((v) => typeof v === "string")
    ) {
      findings.push(
        make(
          "SC302",
          "`allowed-tools` is an array; the spec defines it as a space-separated string (arrays are a client extension)",
        ),
      );
    } else {
      findings.push(
        make("SC302", "`allowed-tools` must be a space-separated string"),
      );
    }
  }

  // --- unknown / extension fields ---
  const extras: string[] = [];
  for (const key of Object.keys(fm)) {
    if (SPEC_FIELDS.has(key)) continue;
    if (key in KNOWN_EXTENSIONS) {
      const ext = KNOWN_EXTENSIONS[key];
      findings.push(
        make(
          "SC301",
          `\`${key}\` is a client extension (${ext?.runtimes.join(", ")}), not in the Agent Skills spec -- fails strict skills-ref validation${ext?.deprecated ? `; ${ext.deprecated}` : ""}`,
        ),
      );
      const valueErr = validateExtensionValue(key, fm[key]);
      if (valueErr) findings.push(make("SC302", valueErr));
    } else {
      extras.push(key);
    }
  }
  if (extras.length > 0) {
    const allowed = [...SPEC_FIELDS].sort().join(", ");
    findings.push(
      // skills-ref verbatim: period before "Only", "are allowed."
      make(
        "SC018",
        `Unexpected fields in frontmatter: ${extras.sort().join(", ")}. Only ${allowed} are allowed.`,
      ),
    );
  }

  // --- body checks (SC2xx) ---
  const body = parsed.body;
  if (body.trim().length === 0) {
    findings.push(
      make(
        "SC201",
        "SKILL.md body is empty; the skill provides no instructions",
      ),
    );
  } else {
    const bodyLines = body.split(/\r?\n/).length;
    if (bodyLines > BODY_LINE_LIMIT) {
      findings.push(
        make(
          "SC202",
          `body is ${bodyLines} lines; spec recommends under ${BODY_LINE_LIMIT}`,
        ),
      );
    }
    const approxTokens = Math.round(body.length / CHARS_PER_TOKEN);
    if (approxTokens > BODY_TOKEN_LIMIT) {
      findings.push(
        make(
          "SC203",
          `body is ~${approxTokens} tokens; spec recommends under ${BODY_TOKEN_LIMIT} (move detail to references/)`,
        ),
      );
    }
  }

  // --- structure/reference checks (SC1xx) ---
  findings.push(...referenceChecks(parsed, ctx.bundledFiles ?? []));

  if (
    HIDDEN_UNICODE_RE.test(body) ||
    HIDDEN_UNICODE_RE.test(parsed.rawFrontmatter)
  ) {
    findings.push(
      make(
        "SC107",
        "SKILL.md contains zero-width or bidi control characters (Trojan-Source risk)",
      ),
    );
  }
  if (body.includes("{baseDir}")) {
    findings.push(
      make(
        "SC108",
        "deprecated `{baseDir}` placeholder found",
        undefined,
        "use relative paths from the skill root instead",
      ),
    );
  }

  return applyProfile(findings, ctx.profile);
}

/** Raw-text scan: unquoted colon in single-line name/description (SC021).
 * Fires even when the YAML parser recovered (or failed) -- the client-guide
 * break case is "description: Use this skill when: ..." */
function scanUnquotedColons(parsed: ParsedSkill, findings: Finding[]): void {
  for (const line of parsed.rawFrontmatter.split(/\r?\n/)) {
    const m = /^(name|description):\s+(?!['"|>])(.*: .*)$/.exec(line);
    if (m) {
      findings.push(
        make(
          "SC021",
          `unquoted ': ' inside \`${m[1]}\` value -- lenient YAML parsers in some clients truncate here`,
          undefined,
          `quote the value: ${m[1]}: "${(m[2] ?? "").trim()}"`,
        ),
      );
    }
  }
}

/** Extract relative file references from the body and check them against the
 * actual bundled files. */
function referenceChecks(
  parsed: ParsedSkill,
  bundledFiles: string[],
): Finding[] {
  const findings: Finding[] = [];
  const body = parsed.body;
  const bundled = new Set(bundledFiles.map((f) => f.replace(/\\/g, "/")));

  const referenced = new Set<string>();

  // markdown links: [text](target)
  for (const m of body.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = (m[1] ?? "").split(/[#?]/)[0]?.trim() ?? "";
    if (target) referenced.add(target);
  }
  // inline-code tokens pointing into conventional dirs
  for (const m of body.matchAll(
    /`((?:scripts|references|assets)\/[^\s`]+)`/g,
  )) {
    referenced.add((m[1] ?? "").trim());
  }

  for (const target of referenced) {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target) || target.startsWith("mailto:"))
      continue; // URL
    if (target.startsWith("#")) continue; // anchor
    if (target.includes("${") || target.includes("{{")) continue; // template placeholder
    if (/^(\/|[A-Za-z]:[\\/]|~\/)/.test(target)) {
      findings.push(
        make(
          "SC102",
          `absolute path reference \`${target}\` -- skills must use paths relative to the skill root`,
        ),
      );
      continue;
    }
    const normalized = target.replace(/^\.\//, "").replace(/\\/g, "/");
    if (bundled.size > 0 && !bundled.has(normalized)) {
      findings.push(
        make(
          "SC101",
          `referenced file \`${target}\` does not exist in the skill directory`,
        ),
      );
    }
  }

  // SC104: bundled conventional files never referenced
  for (const f of bundled) {
    if (!/^(scripts|references|assets)\//.test(f)) continue;
    const mentioned = body.includes(f) || referenced.has(f);
    if (!mentioned) {
      findings.push({
        code: "SC104",
        alias: "unreferenced-bundled-file",
        severity: "info",
        message: `bundled file \`${f}\` is never referenced from SKILL.md`,
        file: f,
      });
    }
  }

  return findings;
}
