import { parse as parseYaml } from "yaml";
import type { ParsedSkill, SkillFrontmatter } from "../types.js";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** Split a SKILL.md source into frontmatter + body without throwing. */
export function parseSkillMd(source: string): ParsedSkill {
  const match = FRONTMATTER_RE.exec(source);
  if (!match) {
    return {
      frontmatter: null,
      parseError: "no YAML frontmatter block found",
      body: source,
      bodyStartLine: 1,
    };
  }

  const fenceLines = match[0].split(/\r?\n/).length;
  const body = source.slice(match[0].length);

  try {
    const parsed = parseYaml(match[1] ?? "");
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return {
        frontmatter: null,
        parseError: "frontmatter is not a YAML mapping",
        body,
        bodyStartLine: fenceLines,
      };
    }
    return {
      frontmatter: parsed as SkillFrontmatter,
      parseError: null,
      body,
      bodyStartLine: fenceLines,
    };
  } catch (err) {
    return {
      frontmatter: null,
      parseError: err instanceof Error ? err.message : String(err),
      body,
      bodyStartLine: fenceLines,
    };
  }
}
