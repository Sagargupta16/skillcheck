import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { lintSkillDir } from "../src/lint/index.js";
import { lintSkillSource } from "../src/lint/source.js";

const broken = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  "fixtures",
  "broken-skill",
);

describe("lintSkillSource (playground engine)", () => {
  it("matches lintSkillDir on the same text, directory and files", async () => {
    const text = await readFile(join(broken, "SKILL.md"), "utf8");
    const fromDisk = await lintSkillDir(broken);
    const fromText = lintSkillSource(text, {
      dirName: "broken-skill",
      bundledFiles: ["SKILL.md"],
    });
    expect(fromText.findings).toEqual(fromDisk.findings);
    expect(fromText.skillName).toBe(fromDisk.skillName);
  });

  it("defaults the directory to the skill name, so pasted text has no SC014", () => {
    const { findings } = lintSkillSource(
      "---\nname: pasted-skill\ndescription: d\n---\nbody\n",
    );
    expect(findings).toEqual([]);
  });
});
