import { parse as parseYaml } from "yaml";
import type { ParsedSkill, SkillFrontmatter } from "../types.js";

/** Split a SKILL.md source into frontmatter + body, replicating skills-ref
 * parser.py semantics exactly (split-based, error strings verbatim). */
export function parseSkillMd(source: string): ParsedSkill {
  // skills-ref: content must START with --- (no leading whitespace/BOM).
  if (!source.startsWith("---")) {
    return {
      frontmatter: null,
      parseError: "SKILL.md must start with YAML frontmatter (---)",
      rawFrontmatter: "",
      body: source,
      bodyStartLine: 1,
    };
  }

  // skills-ref: content.split("---", 2) -- deliberately split-based, so a
  // literal --- inside the YAML terminates it early. Replicated for parity.
  const parts = splitN(source, "---", 2);
  if (parts.length < 3) {
    return {
      frontmatter: null,
      parseError: "SKILL.md frontmatter not properly closed with ---",
      rawFrontmatter: "",
      body: source,
      bodyStartLine: 1,
    };
  }

  const rawFrontmatter = parts[1] ?? "";
  const body = (parts[2] ?? "").replace(/^\r?\n/, "");
  const bodyStartLine = 3 + (rawFrontmatter.match(/\r?\n/g)?.length ?? 0);

  // strictyaml semantics on top of the JS parser: flow collections, tags,
  // and duplicate keys are rejected (skills-ref uses strictyaml).
  const strictErr = strictYamlViolation(rawFrontmatter);
  if (strictErr) {
    return {
      frontmatter: null,
      parseError: `Invalid YAML in frontmatter: ${strictErr}`,
      rawFrontmatter,
      body,
      bodyStartLine,
    };
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(rawFrontmatter);
  } catch (err) {
    return {
      frontmatter: null,
      parseError: `Invalid YAML in frontmatter: ${err instanceof Error ? err.message : String(err)}`,
      rawFrontmatter,
      body,
      bodyStartLine,
    };
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      frontmatter: null,
      parseError: "SKILL.md frontmatter must be a YAML mapping",
      rawFrontmatter,
      body,
      bodyStartLine,
    };
  }

  return {
    frontmatter: parsed as SkillFrontmatter,
    parseError: null,
    rawFrontmatter,
    body,
    bodyStartLine,
  };
}

/** Python-style str.split(sep, maxsplit): at most maxsplit splits, remainder
 * kept whole in the last element. */
function splitN(s: string, sep: string, maxsplit: number): string[] {
  const out: string[] = [];
  let rest = s;
  for (let i = 0; i < maxsplit; i++) {
    const idx = rest.indexOf(sep);
    if (idx === -1) break;
    out.push(rest.slice(0, idx));
    rest = rest.slice(idx + sep.length);
  }
  out.push(rest);
  return out;
}

/** Detect constructs strictyaml rejects that the JS yaml parser accepts:
 * flow-style collections, YAML tags, and duplicate top-level keys. Scans the
 * raw text conservatively (top-level value positions only). */
function strictYamlViolation(raw: string): string | null {
  const seenKeys = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const keyMatch = /^([A-Za-z0-9_-]+):(.*)$/.exec(line);
    if (!keyMatch) continue;
    const key = keyMatch[1] ?? "";
    const value = (keyMatch[2] ?? "").trim();
    if (seenKeys.has(key)) {
      return `duplicate key "${key}" (strictyaml rejects duplicate keys)`;
    }
    seenKeys.add(key);
    if (value.startsWith("{") || value.startsWith("[")) {
      return `flow-style collection in "${key}" (strictyaml requires block style)`;
    }
    if (value.startsWith("!")) {
      return `YAML tag in "${key}" (strictyaml rejects tags)`;
    }
  }
  return null;
}
