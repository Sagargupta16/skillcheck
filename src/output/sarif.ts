import { relative } from "node:path";
import { RULES } from "../lint/registry.js";
import type { LintResult, Severity } from "../types.js";

const LEVEL: Record<Severity, string> = {
  error: "error",
  warning: "warning",
  info: "note",
};

/** Emit SARIF 2.1.0 (the only version GitHub code scanning accepts).
 * Paths are repo-relative with forward slashes -- path stability keeps
 * alerts from churning. */
export function toSarif(
  results: LintResult[],
  version: string,
  cwd = process.cwd(),
): string {
  const sarif = {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "skillcheck",
            informationUri: "https://github.com/Sagargupta16/skillcheck",
            version,
            rules: RULES.map((r) => ({
              id: r.code,
              name: r.alias,
              shortDescription: { text: r.summary.slice(0, 255) },
              helpUri: `https://github.com/Sagargupta16/skillcheck/blob/main/docs/rules.md#${r.code.toLowerCase()}`,
              defaultConfiguration: { level: LEVEL[r.severity] },
            })),
          },
        },
        results: results.flatMap((result) =>
          result.findings.map((f) => ({
            ruleId: f.code,
            level: LEVEL[f.severity],
            message: { text: f.message },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: {
                    uri: relative(cwd, `${result.skillDir}/${f.file}`).replace(
                      /\\/g,
                      "/",
                    ),
                  },
                  region: { startLine: f.line ?? 1, startColumn: 1 },
                },
              },
            ],
          })),
        ),
      },
    ],
  };
  return JSON.stringify(sarif, null, 2);
}
