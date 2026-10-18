/** Markdown reference extraction, shared by SC101/SC102/SC104 in rules.ts and
 * the SC103 chain walk in index.ts. Both used to carry their own copy of these
 * regexes and drifted into the same false positives. */

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

/** Inline links `[text](dest)` as {raw destination, offset of dest}. Same
 * matches as /\[[^\]]*\]\(([^)]+)\)/g, scanned in linear time: the regex
 * backtracks quadratically on input like "[[[[" or "[](([]((", and the
 * playground feeds it whatever is pasted. */
function* inlineLinks(text: string): Generator<{ raw: string; at: number }> {
  let from = 0;
  for (;;) {
    const open = text.indexOf("[", from);
    if (open === -1) return;
    const close = text.indexOf("]", open + 1);
    if (close === -1) return;
    // Every "[" before `close` shares this "]", so they all fail or match here.
    if (text[close + 1] === "(" && text[close + 2] !== ")") {
      const end = text.indexOf(")", close + 2);
      if (end === -1) return;
      yield { raw: text.slice(close + 2, end), at: close + 2 };
      from = end + 1;
      continue;
    }
    from = close + 1;
  }
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
  for (const { raw, at } of inlineLinks(body)) {
    const target = parseLinkTarget(raw);
    // Link text may wrap; anchor to the line holding the destination.
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
