import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lintSkillDir } from "../src/lint/index.js";
import {
  escapeData,
  escapeProperty,
  toWorkflowCommands,
} from "../src/output/github.js";
import { repoRelative } from "../src/output/paths.js";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const tmp = join(root, "fixtures", ".tmp-github");

async function makeSkill(name: string, skillMd: string) {
  const dir = join(tmp, name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "SKILL.md"), skillMd, "utf8");
  return dir;
}

beforeAll(async () => {
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("repoRelative", () => {
  it("is repo-relative and forward-slashed", () => {
    const out = repoRelative(
      join(root, "fixtures", "valid-skill"),
      "SKILL.md",
      root,
    );
    expect(out).toBe("fixtures/valid-skill/SKILL.md");
  });
});

describe("workflow-command escaping", () => {
  it("escapes message data per the workflow-command spec", () => {
    expect(escapeData("100% done\r\nnext")).toBe("100%25 done%0D%0Anext");
  });

  it("escapes : and , in property values as well", () => {
    expect(escapeProperty("C:/a,b")).toBe("C%3A/a%2Cb");
  });
});

describe("toWorkflowCommands", () => {
  it("emits a repo-relative path so annotations attach to the PR diff", async () => {
    const dir = await makeSkill(
      "wrong-name",
      "---\nname: other\ndescription: d\n---\nbody\n",
    );
    const result = await lintSkillDir(dir);
    const lines = toWorkflowCommands([result], root);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const file = /file=([^,]*)/.exec(line)?.[1];
      expect(file).toBe("fixtures/.tmp-github/wrong-name/SKILL.md");
    }
  });

  it("never lets an untrusted message open a second workflow command", async () => {
    // A crafted SKILL.md whose YAML error context IS a workflow command. Left
    // unescaped, the newline in the parser's caret diagram published
    // `::error title=PWNED::...` on the Actions command channel.
    const dir = await makeSkill(
      "inject",
      "---\nname: inject\n::error title=PWNED::injected\ndescription: d\n---\nbody\n",
    );
    const result = await lintSkillDir(dir);
    const lines = toWorkflowCommands([result], root);
    // One emitted line per finding, and no embedded newline anywhere: a
    // workflow command is only recognized at the start of a line, so this is
    // the property that closes the injection.
    expect(lines).toHaveLength(result.findings.length);
    const stdout = lines.join("\n");
    expect(stdout.split("\n").filter((l) => l.startsWith("::"))).toHaveLength(
      result.findings.length,
    );
    for (const line of lines) {
      expect(line).not.toContain("\n");
      expect(line).not.toContain("\r");
      expect(line.startsWith("::")).toBe(true);
    }
    // The payload survives, encoded -- only the command channel is protected.
    expect(stdout).toContain("%0A::error title=PWNED::injected%0A");
  });
});
