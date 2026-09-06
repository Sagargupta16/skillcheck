import { join, relative } from "node:path";

/** Repo-relative, forward-slash path for a finding.
 *
 * GitHub matches BOTH workflow-command annotations and SARIF locations to the
 * pull-request diff by repo-relative path. An absolute path (or a backslash
 * path on Windows runners) silently degrades an inline review comment into a
 * detached log annotation, so both formatters must go through here. */
export function repoRelative(
  skillDir: string,
  file: string,
  cwd = process.cwd(),
): string {
  return relative(cwd, join(skillDir, file)).replace(/\\/g, "/");
}
