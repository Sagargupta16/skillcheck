/** Generate docs/rules.md from the rule registry.
 *
 * CONTRIBUTING.md step 4 has always told contributors to regenerate this file;
 * this is the script it points at. CI regenerates and runs
 * `git diff --exit-code docs/rules.md`, so a new rule cannot land with a stale
 * table.
 *
 * Run with `pnpm docs:rules`. Node strips the types natively (>= 22.18), and
 * registry.ts imports only types, so nothing needs compiling first. */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { RULES } from "../src/lint/registry.ts";

const HEADER = `# Rules

Rule codes are stable: never renumbered, never recycled. Codes and kebab-case aliases are interchangeable in config and CLI flags.

Severity tiers: **error** = skills-ref 0.1.0 strict parity, **warning** = beyond-parity + client-guide lenient tier, **info** = advisory, never gates CI.

| Code | Alias | Severity | Lenient | Fixable | Summary |
| --- | --- | --- | --- | --- | --- |
`;

const FOOTER = `
## Profiles

- \`--profile strict\` (default): full skills-ref parity. SC009 (name-too-long), SC014 (name-dir-mismatch), and SC018 (unknown-frontmatter-field) are errors.
- \`--profile lenient\`: client-implementation-guide behavior -- those three downgrade to warnings (clients warn and load anyway). Missing description and broken YAML stay fatal in both profiles.

## Suppressions

Override any rule in \`skillcheck.config.json\`:

\`\`\`json
{
  "rules": {
    "SC104": "off",
    "extension-field": "error"
  }
}
\`\`\`
`;

const rows = RULES.map((r) => {
  const anchor = `<a id="${r.code.toLowerCase()}"></a>${r.code}`;
  const lenient = r.lenientSeverity ?? r.severity;
  const fixable = r.fixable ?? "-";
  return `| ${anchor} | \`${r.alias}\` | ${r.severity} | ${lenient} | ${fixable} | ${r.summary} |`;
}).join("\n");

const out = fileURLToPath(new URL("../docs/rules.md", import.meta.url));
// LF regardless of platform: the file is committed and diffed in CI.
writeFileSync(out, `${HEADER}${rows}\n${FOOTER}`, "utf8");
console.log(`wrote ${RULES.length} rules to docs/rules.md`);
