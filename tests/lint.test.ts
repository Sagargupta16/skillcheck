import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { lintSkillDir } from "../src/lint/index.js";
import { parseSkillMd } from "../src/lint/parse.js";

const fixtures = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  "fixtures",
);

describe("parseSkillMd", () => {
  it("splits frontmatter and body", () => {
    const parsed = parseSkillMd(
      "---\nname: a\ndescription: b\n---\nbody here\n",
    );
    expect(parsed.parseError).toBeNull();
    expect(parsed.frontmatter).toMatchObject({ name: "a", description: "b" });
    expect(parsed.body).toBe("body here\n");
  });

  it("reports missing frontmatter", () => {
    const parsed = parseSkillMd("# just markdown\n");
    expect(parsed.parseError).toContain("no YAML frontmatter");
  });

  it("reports invalid YAML", () => {
    const parsed = parseSkillMd("---\nname: [unclosed\n---\nbody\n");
    expect(parsed.frontmatter).toBeNull();
    expect(parsed.parseError).not.toBeNull();
  });

  it("rejects non-mapping frontmatter", () => {
    const parsed = parseSkillMd("---\n- just\n- a list\n---\nbody\n");
    expect(parsed.parseError).toBe("frontmatter is not a YAML mapping");
  });
});

describe("lintSkillDir", () => {
  it("passes a valid skill with no findings", async () => {
    const result = await lintSkillDir(join(fixtures, "valid-skill"));
    expect(result.errorCount).toBe(0);
    expect(result.warningCount).toBe(0);
    expect(result.skillName).toBe("valid-skill");
  });

  it("flags the broken fixture", async () => {
    const result = await lintSkillDir(join(fixtures, "broken-skill"));
    const rules = result.findings.map((f) => f.rule);
    expect(rules).toContain("name-format"); // uppercase + spaces
    expect(rules).toContain("name-dir-match"); // name != dir
    expect(rules).toContain("description-required");
    expect(rules).toContain("license-type"); // 42 is not a string
    expect(rules).toContain("unknown-field"); // custom-field
    expect(rules).toContain("extension-field"); // model
    expect(rules).toContain("body-empty");
    expect(result.errorCount).toBeGreaterThan(0);
  });

  it("escalates extensions and unknowns to errors under strict", async () => {
    const lenient = await lintSkillDir(join(fixtures, "broken-skill"));
    const strict = await lintSkillDir(join(fixtures, "broken-skill"), {
      strict: true,
    });
    expect(strict.errorCount).toBeGreaterThan(lenient.errorCount);
    const strictExt = strict.findings.find((f) => f.rule === "extension-field");
    expect(strictExt?.severity).toBe("error");
  });
});
