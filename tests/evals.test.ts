import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkEvals, initEvals } from "../src/evals/index.js";
import { lintSkillDir } from "../src/lint/index.js";
import { toSarif } from "../src/output/sarif.js";

const tmp = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  "fixtures",
  ".tmp-evals",
);

async function makeSkill(name: string, evalsJson?: unknown) {
  const dir = join(tmp, name);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: d\n---\nbody\n`,
    "utf8",
  );
  if (evalsJson !== undefined) {
    await mkdir(join(dir, "evals"), { recursive: true });
    await writeFile(
      join(dir, "evals", "evals.json"),
      JSON.stringify(evalsJson),
      "utf8",
    );
  }
  return dir;
}

beforeAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("checkEvals", () => {
  it("absent evals.json is fine", async () => {
    const dir = await makeSkill("no-evals");
    expect(await checkEvals(dir, "no-evals")).toEqual([]);
  });

  it("valid skill-creator-style file passes", async () => {
    const dir = await makeSkill("good-evals", {
      skill_name: "good-evals",
      evals: [{ id: 1, prompt: "do it", expectations: ["it is done"] }],
      triggers: [
        {
          id: "e1",
          type: "explicit",
          prompt: "use good-evals",
          should_trigger: true,
        },
        {
          id: "n1",
          type: "negative",
          prompt: "unrelated",
          should_trigger: false,
        },
        {
          id: "n2",
          type: "negative",
          prompt: "near miss",
          should_trigger: false,
        },
      ],
    });
    expect(await checkEvals(dir, "good-evals")).toEqual([]);
  });

  it("skill_name mismatch errors", async () => {
    const dir = await makeSkill("name-mismatch", {
      skill_name: "other",
      evals: [],
    });
    const findings = await checkEvals(dir, "name-mismatch");
    expect(
      findings.some(
        (f) => f.severity === "error" && f.message.includes("does not match"),
      ),
    ).toBe(true);
  });

  it("negative trigger with should_trigger true errors", async () => {
    const dir = await makeSkill("bad-negative", {
      skill_name: "bad-negative",
      triggers: [
        { id: "n1", type: "negative", prompt: "x", should_trigger: true },
      ],
    });
    const findings = await checkEvals(dir, "bad-negative");
    expect(
      findings.some((f) =>
        f.message.includes("requires should_trigger: false"),
      ),
    ).toBe(true);
  });

  it("missing eval files error; <2 negatives warns", async () => {
    const dir = await makeSkill("file-missing", {
      skill_name: "file-missing",
      evals: [
        {
          id: 1,
          prompt: "p",
          files: ["evals/files/nope.pdf"],
          expectations: ["e"],
        },
      ],
      triggers: [
        { id: "e1", type: "explicit", prompt: "x", should_trigger: true },
      ],
    });
    const findings = await checkEvals(dir, "file-missing");
    expect(findings.some((f) => f.message.includes("does not exist"))).toBe(
      true,
    );
    expect(
      findings.some(
        (f) => f.severity === "warning" && f.message.includes("negative"),
      ),
    ).toBe(true);
  });

  it("initEvals scaffolds a file that validates", async () => {
    const dir = await makeSkill("scaffold-me");
    const path = await initEvals(dir);
    const raw = JSON.parse(await readFile(path, "utf8"));
    expect(raw.skill_name).toBe("scaffold-me");
    expect(
      raw.triggers.filter((t: { type: string }) => t.type === "negative")
        .length,
    ).toBe(4);
    // Scaffold validates clean (placeholders are structurally valid)
    expect(
      (await checkEvals(dir, "scaffold-me")).filter(
        (f) => f.severity === "error",
      ),
    ).toEqual([]);
  });
});

describe("toSarif", () => {
  it("emits valid SARIF 2.1.0 with matching ruleIds", async () => {
    const dir = await makeSkill("sarif-skill");
    await writeFile(
      join(dir, "SKILL.md"),
      "---\nname: WRONG NAME\n---\n",
      "utf8",
    );
    const result = await lintSkillDir(dir);
    const sarif = JSON.parse(toSarif([result], "0.2.0", tmp));
    expect(sarif.version).toBe("2.1.0");
    const run = sarif.runs[0];
    const ruleIds = new Set(
      run.tool.driver.rules.map((r: { id: string }) => r.id),
    );
    for (const res of run.results) {
      expect(ruleIds.has(res.ruleId)).toBe(true);
      expect(["error", "warning", "note"]).toContain(res.level);
      const uri = res.locations[0].physicalLocation.artifactLocation.uri;
      expect(uri).not.toContain("\\");
    }
    expect(run.results.length).toBeGreaterThan(0);
  });
});
