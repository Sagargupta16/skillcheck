import type { LintResult } from "../types.js";

/** shields.io endpoint badge schema:
 * https://shields.io/badges/endpoint-badge */
export interface EndpointBadge {
  schemaVersion: 1;
  label: string;
  message: string;
  color: string;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** A status badge for a set of results: red with the error count, yellow with
 * the warning count, green "passing" otherwise. Info findings never change it,
 * matching the CI gate. Counts are taken after config overrides, so the badge
 * agrees with the exit code. */
export function toBadge(results: LintResult[]): EndpointBadge {
  const errors = results.reduce((s, r) => s + r.errorCount, 0);
  const warnings = results.reduce((s, r) => s + r.warningCount, 0);
  const base = { schemaVersion: 1 as const, label: "skillcheck" };
  if (errors > 0)
    return { ...base, message: plural(errors, "error"), color: "red" };
  if (warnings > 0)
    return { ...base, message: plural(warnings, "warning"), color: "yellow" };
  return {
    ...base,
    message: `${plural(results.length, "skill")} passing`,
    color: "brightgreen",
  };
}
