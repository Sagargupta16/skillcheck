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

/** Every relative-file reference in a markdown body: link destinations plus
 * inline-code tokens pointing into the conventional bundled directories.
 * Unfiltered -- callers decide what counts as a URL, anchor or placeholder. */
export function extractBodyReferences(body: string): string[] {
  const refs = new Set<string>();
  for (const m of body.matchAll(MARKDOWN_LINK_RE)) {
    const target = parseLinkTarget(m[1] ?? "");
    if (target) refs.add(target);
  }
  for (const m of body.matchAll(CONVENTIONAL_DIR_CODE_RE)) {
    const target = (m[1] ?? "").trim();
    if (target) refs.add(target);
  }
  return [...refs];
}
