import type { LintResult, Severity } from "../types.js";
import { repoRelative } from "./paths.js";

const LEVEL: Record<Severity, string> = {
  error: "error",
  warning: "warning",
  info: "notice",
};

/** Escape a workflow-command message payload.
 *
 * Finding messages echo attacker-controlled SKILL.md content (a skill name, a
 * broken reference, a multi-line YAML parse error with its caret diagram). Left
 * raw, a newline lets untrusted input open its own `::error ...::` command on
 * the Actions command channel. Escapes per the workflow-command reference:
 * https://docs.github.com/actions/reference/workflow-commands-for-github-actions */
export function escapeData(value: string): string {
  return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

/** Escape a workflow-command property value (`file`, `line`, `title`, ...).
 * Property values additionally cannot carry a raw `:` or `,` -- both are
 * command syntax. Windows drive letters and rule titles hit this. */
export function escapeProperty(value: string): string {
  return escapeData(value).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

/** One `::level file=...,line=...,title=...::message` line per finding.
 * Exactly one line per finding, always -- see escapeData. */
export function toWorkflowCommands(
  results: LintResult[],
  cwd = process.cwd(),
): string[] {
  const lines: string[] = [];
  for (const r of results) {
    for (const f of r.findings) {
      const file = escapeProperty(repoRelative(r.skillDir, f.file, cwd));
      const title = escapeProperty(`${f.code} ${f.alias}`);
      lines.push(
        `::${LEVEL[f.severity]} file=${file},line=${f.line ?? 1},title=${title}::${escapeData(f.message)}`,
      );
    }
  }
  return lines;
}
