import {
  KNOWN_EXTENSIONS,
  SPEC_FIELDS,
  validateExtensionValue,
} from "../extensions.js";
import type { Finding, ParsedSkill, Profile, Severity } from "../types.js";
import { extractBodyReferencesWithLines } from "./links.js";
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

/** Render a string list the way Python's f-string renders `sorted(set)`.
 * skills-ref's unknown-field message is `f"Only {sorted(ALLOWED_FIELDS)} are
 * allowed."`, so the literal output carries the brackets and single quotes.
 * Reproduced verbatim -- the error tier claims byte parity. */
function pythonListRepr(items: string[]): string {
  return `[${items.map((i) => `'${i}'`).join(", ")}]`;
}

/** Source line of a top-level frontmatter key, or undefined when the key is
 * not written as `key:` at column 0. The raw frontmatter begins right after the
 * opening `---`, so its first (usually empty) line is line 1 of the file. */
function keyLine(parsed: ParsedSkill, key: string): number | undefined {
  const i = parsed.rawFrontmatter
    .split(/\r?\n/)
    .findIndex((l) => l.startsWith(`${key}:`));
  return i === -1 ? undefined : i + 1;
}

/** Smallest defined line, or undefined. */
function firstLine(lines: (number | undefined)[]): number | undefined {
  const defined = lines.filter((l): l is number => l !== undefined);
  return defined.length > 0 ? Math.min(...defined) : undefined;
}

/** Source line of the first body line matching `test`, or undefined. */
function bodyLine(
  parsed: ParsedSkill,
  test: (line: string) => boolean,
): number | undefined {
  const i = parsed.body.split(/\r?\n/).findIndex(test);
  return i === -1 ? undefined : parsed.bodyStartLine + i;
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

  // --- unknown / extension fields ---
  // Order matters for parity: skills-ref validate_metadata() calls
  // _validate_metadata_fields() FIRST, so the unknown-fields error precedes the
  // name and description errors.
  const extras: string[] = [];
  for (const key of Object.keys(fm)) {
    if (SPEC_FIELDS.has(key)) continue;
    if (key in KNOWN_EXTENSIONS) {
      const ext = KNOWN_EXTENSIONS[key];
      findings.push(
        make(
          "SC301",
          `\`${key}\` is a client extension (${ext?.runtimes.join(", ")}), not in the Agent Skills spec -- fails strict skills-ref validation${ext?.deprecated ? `; ${ext.deprecated}` : ""}`,
          keyLine(parsed, key),
        ),
      );
      const valueErr = validateExtensionValue(key, fm[key]);
      if (valueErr)
        findings.push(make("SC302", valueErr, keyLine(parsed, key)));
    } else {
      extras.push(key);
    }
  }
  if (extras.length > 0) {
    findings.push(
      make(
        "SC018",
        `Unexpected fields in frontmatter: ${extras.sort().join(", ")}. Only ${pythonListRepr([...SPEC_FIELDS].sort())} are allowed.`,
        firstLine(extras.map((k) => keyLine(parsed, k))),
      ),
    );
  }

  // --- name (skills-ref _validate_name, in order, with early return) ---
  if (!("name" in fm)) {
    findings.push(make("SC006", "Missing required field in frontmatter: name"));
  } else if (typeof fm.name !== "string" || fm.name.trim().length === 0) {
    findings.push(
      make(
        "SC008",
        "Field 'name' must be a non-empty string",
        keyLine(parsed, "name"),
      ),
    );
  } else {
    const name = fm.name.trim().normalize("NFKC");
    const at = keyLine(parsed, "name");
    if (name.length > NAME_MAX) {
      findings.push(
        make(
          "SC009",
          `Skill name '${name}' exceeds ${NAME_MAX} character limit (${name.length} chars)`,
          at,
        ),
      );
    }
    if (name !== name.toLowerCase()) {
      findings.push(
        make(
          "SC010",
          `Skill name '${name}' must be lowercase`,
          at,
          `rename to '${name.toLowerCase()}'`,
        ),
      );
    }
    if (name.startsWith("-") || name.endsWith("-")) {
      findings.push(
        make("SC011", "Skill name cannot start or end with a hyphen", at),
      );
    }
    if (name.includes("--")) {
      findings.push(
        make("SC012", "Skill name cannot contain consecutive hyphens", at),
      );
    }
    if (!NAME_CHARS_RE.test(name)) {
      findings.push(
        make(
          "SC013",
          `Skill name '${name}' contains invalid characters. Only letters, digits, and hyphens are allowed.`,
          at,
        ),
      );
    }
    // Parity: skills-ref compares the NFKC-normalized directory name but
    // interpolates the RAW `skill_dir.name` into the message.
    if (name !== dirName.normalize("NFKC")) {
      findings.push(
        make(
          "SC014",
          `Directory name '${dirName}' must match skill name '${name}'`,
          at,
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
      make(
        "SC015",
        "Field 'description' must be a non-empty string",
        keyLine(parsed, "description"),
      ),
    );
  } else if (fm.description.length > DESCRIPTION_MAX) {
    findings.push(
      make(
        "SC016",
        `Description exceeds ${DESCRIPTION_MAX} character limit (${fm.description.length} chars)`,
        keyLine(parsed, "description"),
      ),
    );
  }

  // --- compatibility ---
  if (fm.compatibility !== undefined) {
    if (typeof fm.compatibility !== "string") {
      findings.push(
        make(
          "SC017",
          "Field 'compatibility' must be a string",
          keyLine(parsed, "compatibility"),
        ),
      );
    } else if (fm.compatibility.length > COMPATIBILITY_MAX) {
      findings.push(
        make(
          "SC017",
          `Compatibility exceeds ${COMPATIBILITY_MAX} character limit (${fm.compatibility.length} chars)`,
          keyLine(parsed, "compatibility"),
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
          keyLine(parsed, "metadata"),
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
          keyLine(parsed, "allowed-tools"),
        ),
      );
    } else {
      findings.push(
        make(
          "SC302",
          "`allowed-tools` must be a space-separated string",
          keyLine(parsed, "allowed-tools"),
        ),
      );
    }
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
          parsed.bodyStartLine + BODY_LINE_LIMIT,
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
    const fmIndex = parsed.rawFrontmatter
      .split(/\r?\n/)
      .findIndex((l) => HIDDEN_UNICODE_RE.test(l));
    findings.push(
      make(
        "SC107",
        "SKILL.md contains zero-width or bidi control characters (Trojan-Source risk)",
        fmIndex === -1
          ? bodyLine(parsed, (l) => HIDDEN_UNICODE_RE.test(l))
          : fmIndex + 1,
      ),
    );
  }
  if (body.includes("{baseDir}")) {
    findings.push(
      make(
        "SC108",
        "deprecated `{baseDir}` placeholder found",
        bodyLine(parsed, (l) => l.includes("{baseDir}")),
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
  for (const [i, line] of parsed.rawFrontmatter.split(/\r?\n/).entries()) {
    const m = /^(name|description):\s+(?!['"|>])(.*: .*)$/.exec(line);
    if (m) {
      findings.push(
        make(
          "SC021",
          `unquoted ': ' inside \`${m[1]}\` value -- lenient YAML parsers in some clients truncate here`,
          i + 1,
          `quote the value: ${m[1]}: "${(m[2] ?? "").trim()}"`,
        ),
      );
    }
  }
}

/** Example paths, not references: globs (`scripts/*.sh`), angle-bracket or
 * ellipsis placeholders (`references/<name>.md`, `assets/...`), and bare words
 * with no slash or extension (`[Title](URL)`). Found by the corpus scan
 * (docs/corpus.md), where they were a large share of the SC101 false positives. */
function isPlaceholderPath(target: string): boolean {
  if (/[*<>|]|\.\.\./.test(target)) return true;
  return !target.includes("/") && !target.includes(".");
}

/** Dotfiles are never in the bundled-file list (listBundledFiles skips them),
 * so a reference to one cannot be checked. */
function hasHiddenSegment(path: string): boolean {
  return path
    .split("/")
    .some((seg) => seg.startsWith(".") && seg !== "." && seg !== "..");
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
  // Directories holding at least one bundled file: `references/workers/` names
  // a directory, not a missing file.
  const bundledDirs = new Set<string>();
  for (const f of bundled) {
    const parts = f.split("/");
    for (let i = 1; i < parts.length; i++) {
      bundledDirs.add(parts.slice(0, i).join("/"));
    }
  }

  // markdown link destinations + conventional-dir inline code (see links.ts)
  const refs = extractBodyReferencesWithLines(body);
  const referenced = new Set(refs.map((r) => r.target));

  for (const { target, line } of refs) {
    const at = parsed.bodyStartLine + line - 1;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target) || target.startsWith("mailto:"))
      continue; // URL
    if (target.startsWith("#")) continue; // anchor
    if (target.includes("${") || target.includes("{{")) continue; // template placeholder
    if (/^(\/|[A-Za-z]:[\\/]|~\/)/.test(target)) {
      findings.push(
        make(
          "SC102",
          `absolute path reference \`${target}\` -- skills must use paths relative to the skill root`,
          at,
        ),
      );
      continue;
    }
    if (isPlaceholderPath(target)) continue;
    const normalized = target
      .replace(/^\{baseDir\}\//, "") // legacy placeholder, SC108 reports it
      .replace(/^\.\//, "")
      .replace(/\\/g, "/")
      .replace(/\/+$/, "");
    if (
      bundled.size > 0 &&
      !bundled.has(normalized) &&
      !bundledDirs.has(normalized) &&
      !hasHiddenSegment(normalized)
    ) {
      findings.push(
        make(
          "SC101",
          `referenced file \`${target}\` does not exist in the skill directory`,
          at,
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
