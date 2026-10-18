/** Markdown reference extraction, shared by SC101/SC102/SC104 in rules.ts and
 * the SC103 chain walk in index.ts. Both used to carry their own copy of these
 * regexes and drifted into the same false positives. */

const MARKDOWN_LINK_RE = /\[[^\]]*\]\(([^)]+)\)/g;
const CONVENTIONAL_DIR_CODE_RE = /`((?:scripts|references|assets)\/[^\s`]+)`/g;

/** Resolve a CommonMark inline-link destination to a bare path.
 *
 * CommonMark allows an optional title after the destination and an optional
 * angle-bracket wrapper around it, so `[t](references/a.md "Reference guide")`
 * and `[t](<references/a b.md>)` both point at a real file. Taking the raw
 * capture verbatim made titled links -- idiomatic markdown -- report SC101.
 *
 * A bare (unwrapped) destination cannot contain whitespace, so everything from
 * the first space onward is the title, not the path. Any `#fragment` or
 * `?query` suffix is dropped. Returns "" when there is no usable destination. */
export function parseLinkTarget(raw: string): string {
  const inner = raw.trim();
  let dest: string;
  if (inner.startsWith("<")) {
    const end = inner.indexOf(">");
    dest = end === -1 ? inner.slice(1) : inner.slice(1, end);
  } else {
    dest = inner.split(/\s/)[0] ?? "";
  }
  return (dest.split(/[#?]/)[0] ?? "").trim();
}

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/** Blank out fenced code blocks, per CommonMark: a run of 3+ backticks or
 * tildes opens one, a bare run of the same character at least as long (or the
 * end of the document) closes it. Markdown inside a fence is sample text, not
 * a link, so `[guide](references/your-guide.md)` in a ```markdown example must
 * not raise SC101. Line count is preserved. */
export function stripFencedCode(body: string): string {
  let fence = "";
  return body
    .split(/\r?\n/)
    .map((line) => {
      const m = FENCE_RE.exec(line);
      const run = m?.[1] ?? "";
      const rest = m?.[2] ?? "";
      if (!fence) {
        // A backtick fence's info string cannot itself contain a backtick.
        if (!run || (run[0] === "`" && rest.includes("`"))) return line;
        fence = run;
        return "";
      }
      if (run[0] === fence[0] && run.length >= fence.length && !rest.trim()) {
        fence = "";
      }
      return "";
    })
    .join("\n");
}

export interface BodyReference {
  target: string;
  /** 1-based line of the first occurrence, relative to the markdown passed in. */
  line: number;
}

/** 1-based line number of a character offset. */
function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/** Every relative-file reference in a markdown body, with the line it first
 * appears on: link destinations plus inline-code tokens pointing into the
 * conventional bundled directories. Fenced code blocks are skipped (line count
 * preserved, so the lines stay true). Unfiltered otherwise -- callers decide
 * what counts as a URL, anchor or placeholder. */
export function extractBodyReferencesWithLines(
  markdown: string,
): BodyReference[] {
  const body = stripFencedCode(markdown);
  const refs = new Map<string, number>();
  for (const m of body.matchAll(MARKDOWN_LINK_RE)) {
    const raw = m[1] ?? "";
    const target = parseLinkTarget(raw);
    // Link text may wrap; anchor to the line holding the destination.
    const at = m.index + m[0].length - raw.length - 1;
    if (target && !refs.has(target)) refs.set(target, lineAt(body, at));
  }
  for (const m of body.matchAll(CONVENTIONAL_DIR_CODE_RE)) {
    const target = (m[1] ?? "").trim();
    if (target && !refs.has(target)) refs.set(target, lineAt(body, m.index));
  }
  return [...refs].map(([target, line]) => ({ target, line }));
}

/** {@link extractBodyReferencesWithLines} without the line numbers. */
export function extractBodyReferences(markdown: string): string[] {
  return extractBodyReferencesWithLines(markdown).map((r) => r.target);
}
