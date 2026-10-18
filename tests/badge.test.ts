import { describe, expect, it } from "vitest";
import { toBadge } from "../src/output/badge.js";
import type { LintResult } from "../src/types.js";

function result(
  errorCount: number,
  warningCount: number,
  infoCount = 0,
): LintResult {
  return {
    skillDir: "/s",
    skillName: "s",
    findings: [],
    errorCount,
    warningCount,
    infoCount,
  };
}

describe("toBadge", () => {
  it("is green and counts skills when nothing gates", () => {
    expect(toBadge([result(0, 0, 3), result(0, 0)])).toEqual({
      schemaVersion: 1,
      label: "skillcheck",
      message: "2 skills passing",
      color: "brightgreen",
    });
  });

  it("warnings turn it yellow, errors red, with singular wording", () => {
    expect(toBadge([result(0, 1)])).toMatchObject({
      message: "1 warning",
      color: "yellow",
    });
    expect(toBadge([result(1, 4), result(2, 0)])).toMatchObject({
      message: "3 errors",
      color: "red",
    });
  });
});
