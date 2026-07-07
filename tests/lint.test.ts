import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crossSkillFindings, lintSkillDir } from "../src/lint/index.js";
import { parseSkillMd } from "../src/lint/parse.js";

const fixtures = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  "fixtures",
);
const tmp = join(fixtures, ".tmp");

async function makeSkill(
  name: string,
  skillMd: string,
  extraFiles: Record<string, string> = {},
) {
  const dir = join(tmp, name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "SKILL.md"), skillMd, "utf8");
  for (const [rel, content] of Object.entries(extraFiles)) {
    const full = join(dir, rel);
    await mkdir(join(full, ".."), { recursive: true });
    await writeFile(full, content, "utf8");
  }
  return dir;
}

beforeAll(async () => {
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("parseSkillMd (skills-ref parity)", () => {
  it("splits frontmatter and body", () => {
    const parsed = parseSkillMd(
      "---\nname: a\ndescription: b\n---\nbody here\n",
    );
    expect(parsed.parseError).toBeNull();
    expect(parsed.frontmatter).toMatchObject({ name: "a", description: "b" });
    expect(parsed.body).toBe("body here\n");
  });

  it("exact message: missing frontmatter", () => {
    const parsed = parseSkillMd("# just markdown\n");
    expect(parsed.parseError).toBe(
      "SKILL.md must start with YAML frontmatter (---)",
    );
  });

  it("exact message: unclosed frontmatter", () => {
    const parsed = parseSkillMd("---\nname: a\n");
    expect(parsed.parseError).toBe(
      "SKILL.md frontmatter not properly closed with ---",
    );
  });

  it("exact message: non-mapping frontmatter", () => {
    const parsed = parseSkillMd("---\n- just\n- a list\n---\nbody\n");
    expect(parsed.parseError).toBe(
      "SKILL.md frontmatter must be a YAML mapping",
    );
  });

  it("strictyaml parity: flow collections rejected", () => {
    const parsed = parseSkillMd("---\nname: a\nmetadata: {k: v}\n---\nbody\n");
    expect(parsed.parseError).toContain("Invalid YAML in frontmatter");
    expect(parsed.parseError).toContain("flow-style");
  });

  it("strictyaml parity: duplicate keys rejected", () => {
    const parsed = parseSkillMd(
      "---\nname: a\nname: b\ndescription: c\n---\nbody\n",
    );
    expect(parsed.parseError).toContain("duplicate key");
  });

  it("split-based parity: literal --- inside YAML terminates early", () => {
    // skills-ref uses content.split("---", 2) -- replicated deliberately.
    const parsed = parseSkillMd(
      '---\nname: a\ndescription: "x --- y"\n---\nbody\n',
    );
    expect(parsed.parseError).not.toBeNull();
  });
});

describe("name rules (i18n parity with skills-ref)", () => {
  const cases: [string, string, boolean][] = [
    // [name, dir, expectNameErrors]
    ["valid-skill", "valid-skill", false],
    ["技能", "技能", false], // Chinese: valid per unicode isalnum
    ["навык", "навык", false], // lowercase Russian: valid
    ["мой-навык", "мой-навык", false], // Russian with hyphen: valid
    ["skill_name", "skill_name", true], // underscore: invalid chars
    ["-leading", "-leading", true],
    ["trailing-", "trailing-", true],
    ["double--hyphen", "double--hyphen", true],
  ];

  it.each(cases)("name %s -> errors: %s", async (name, dir, expectErr) => {
    const skillDir = await makeSkill(
      dir,
      `---\nname: ${name}\ndescription: test skill\n---\nbody\n`,
    );
    const result = await lintSkillDir(skillDir);
    const nameErrors = result.findings.filter(
      (f) => f.code.startsWith("SC0") && f.code >= "SC008" && f.code <= "SC013",
    );
    if (expectErr) {
      expect(nameErrors.length).toBeGreaterThan(0);
    } else {
      expect(nameErrors).toEqual([]);
    }
  });

  it("uppercase Cyrillic fails lowercase check", async () => {
    const dir = await makeSkill(
      "cyrillic-upper",
      "---\nname: НАВЫК\ndescription: d\n---\nbody\n",
    );
    const result = await lintSkillDir(dir);
    expect(result.findings.map((f) => f.code)).toContain("SC010");
  });

  it("exact message: invalid chars (verified against skills-ref)", async () => {
    const dir = await makeSkill(
      "bad_chars",
      "---\nname: bad_chars\ndescription: d\n---\nbody\n",
    );
    const result = await lintSkillDir(dir);
    const f = result.findings.find((x) => x.code === "SC013");
    expect(f?.message).toBe(
      "Skill name 'bad_chars' contains invalid characters. Only letters, digits, and hyphens are allowed.",
    );
  });

  it("exact message: unknown fields (period before Only, 'are allowed.')", async () => {
    const dir = await makeSkill(
      "unknown-fields",
      "---\nname: unknown-fields\ndescription: d\nzzz: 1\naaa: 2\n---\nbody\n",
    );
    const result = await lintSkillDir(dir);
    const f = result.findings.find((x) => x.code === "SC018");
    expect(f?.message).toBe(
      "Unexpected fields in frontmatter: aaa, zzz. Only allowed-tools, compatibility, description, license, metadata, name are allowed.",
    );
  });

  it("NFKC: composed vs decomposed dir names match", async () => {
    const composed = "café-skill"; // é composed
    const decomposed = "café-skill"; // e + combining acute
    const dir = await makeSkill(
      composed,
      `---\nname: ${decomposed}\ndescription: d\n---\nbody\n`,
    );
    const result = await lintSkillDir(dir);
    expect(result.findings.map((f) => f.code)).not.toContain("SC014");
  });
});

describe("profiles", () => {
  it("lenient downgrades dir-mismatch and name-too-long to warnings", async () => {
    const longName = "a".repeat(70);
    const dir = await makeSkill(
      "mismatch-dir",
      `---\nname: ${longName}\ndescription: d\n---\nbody\n`,
    );
    const strict = await lintSkillDir(dir, { profile: "strict" });
    const lenient = await lintSkillDir(dir, { profile: "lenient" });
    expect(strict.findings.find((f) => f.code === "SC009")?.severity).toBe(
      "error",
    );
    expect(lenient.findings.find((f) => f.code === "SC009")?.severity).toBe(
      "warning",
    );
    expect(lenient.findings.find((f) => f.code === "SC014")?.severity).toBe(
      "warning",
    );
  });
});

describe("extension fields", () => {
  it("known Claude Code extensions warn (SC301), never error by default", async () => {
    const dir = await makeSkill(
      "with-extensions",
      "---\nname: with-extensions\ndescription: d\nmodel: haiku\neffort: high\nuser-invocable: true\n---\nbody\n",
    );
    const result = await lintSkillDir(dir);
    const ext = result.findings.filter((f) => f.code === "SC301");
    expect(ext.length).toBe(3);
    expect(result.errorCount).toBe(0);
  });

  it("invalid extension values flag SC302", async () => {
    const dir = await makeSkill(
      "bad-effort",
      "---\nname: bad-effort\ndescription: d\neffort: extreme\nuser-invocable: yes please\n---\nbody\n",
    );
    const result = await lintSkillDir(dir);
    const bad = result.findings.filter((f) => f.code === "SC302");
    expect(bad.length).toBe(2);
  });
});

describe("structure rules", () => {
  it("SC101: broken relative reference", async () => {
    const dir = await makeSkill(
      "broken-ref",
      "---\nname: broken-ref\ndescription: d\n---\nSee [guide](references/guide.md) and `scripts/run.sh`.\n",
      { "references/other.md": "content" },
    );
    const result = await lintSkillDir(dir);
    const codes = result.findings.filter((f) => f.code === "SC101");
    expect(codes.length).toBe(2); // guide.md and run.sh both missing
  });

  it("SC102: absolute path reference", async () => {
    const dir = await makeSkill(
      "abs-path",
      "---\nname: abs-path\ndescription: d\n---\nRead [notes](/Users/me/notes.md).\n",
    );
    const result = await lintSkillDir(dir);
    expect(result.findings.map((f) => f.code)).toContain("SC102");
  });

  it("SC103: deep reference chain flagged (info)", async () => {
    const dir = await makeSkill(
      "deep-chain",
      "---\nname: deep-chain\ndescription: d\n---\nSee [guide](references/guide.md).\n",
      {
        "references/guide.md": "More detail in [extra](./extra.md).",
        "references/extra.md": "leaf content",
      },
    );
    const result = await lintSkillDir(dir);
    const f = result.findings.find((x) => x.code === "SC103");
    expect(f?.severity).toBe("info");
    expect(f?.message).toContain("one level deep");
  });

  it("SC103: one-level references do not fire", async () => {
    const dir = await makeSkill(
      "flat-refs",
      "---\nname: flat-refs\ndescription: d\n---\nSee [guide](references/guide.md).\n",
      { "references/guide.md": "leaf content, no further refs" },
    );
    const result = await lintSkillDir(dir);
    expect(result.findings.map((f) => f.code)).not.toContain("SC103");
  });

  it("SC104: unreferenced bundled file (info)", async () => {
    const dir = await makeSkill(
      "unref-file",
      "---\nname: unref-file\ndescription: d\n---\nJust a body.\n",
      { "references/lonely.md": "never mentioned" },
    );
    const result = await lintSkillDir(dir);
    const f = result.findings.find((x) => x.code === "SC104");
    expect(f?.severity).toBe("info");
  });

  it("URLs and placeholders are not flagged", async () => {
    const dir = await makeSkill(
      "urls-ok",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal ${} placeholder is the test subject
      "---\nname: urls-ok\ndescription: d\n---\nSee [docs](https://example.com/x) and `${CLAUDE_PLUGIN_ROOT}/x`.\n",
    );
    const result = await lintSkillDir(dir);
    expect(
      result.findings.filter((f) => f.code === "SC101" || f.code === "SC102"),
    ).toEqual([]);
  });

  it("SC107: hidden unicode", async () => {
    const dir = await makeSkill(
      "hidden-uni",
      `---\nname: hidden-uni\ndescription: d\n---\nzero​width here\n`,
    );
    const result = await lintSkillDir(dir);
    expect(result.findings.map((f) => f.code)).toContain("SC107");
  });

  it("SC105: duplicate skill names across a tree", async () => {
    const a = await makeSkill(
      "dup-a",
      "---\nname: same-name\ndescription: d\n---\nbody\n",
    );
    const b = await makeSkill(
      "dup-b",
      "---\nname: same-name\ndescription: d\n---\nbody\n",
    );
    const results = [await lintSkillDir(a), await lintSkillDir(b)];
    crossSkillFindings(results);
    for (const r of results) {
      expect(r.findings.map((f) => f.code)).toContain("SC105");
    }
  });

  it("SC021: unquoted colon in description", async () => {
    const dir = await makeSkill(
      "colon-desc",
      "---\nname: colon-desc\ndescription: Use this skill when: doing things\n---\nbody\n",
    );
    const result = await lintSkillDir(dir);
    const f = result.findings.find((x) => x.code === "SC021");
    expect(f).toBeDefined();
    expect(f?.suggestion).toContain("quote the value");
  });

  it("SC020: lowercase skill.md accepted with a warning", async () => {
    const dir = join(tmp, "lowercase-file");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "skill.md"),
      "---\nname: lowercase-file\ndescription: d\n---\nbody\n",
      "utf8",
    );
    const result = await lintSkillDir(dir);
    expect(result.findings.map((f) => f.code)).toContain("SC020");
    expect(result.errorCount).toBe(0);
  });
});

describe("rule overrides", () => {
  it("config can turn a rule off or change severity", async () => {
    const dir = await makeSkill(
      "override-me",
      "---\nname: override-me\ndescription: d\nmodel: opus\n---\nbody\n",
    );
    const off = await lintSkillDir(dir, { ruleOverrides: { SC301: "off" } });
    expect(off.findings.filter((f) => f.code === "SC301")).toEqual([]);
    const escalated = await lintSkillDir(dir, {
      ruleOverrides: { "extension-field": "error" },
    });
    expect(escalated.findings.find((f) => f.code === "SC301")?.severity).toBe(
      "error",
    );
  });
});

describe("fixtures", () => {
  it("valid fixture is clean", async () => {
    const result = await lintSkillDir(join(fixtures, "valid-skill"));
    expect(result.errorCount).toBe(0);
    expect(result.warningCount).toBe(0);
  });

  it("broken fixture flags expected rules", async () => {
    const result = await lintSkillDir(join(fixtures, "broken-skill"));
    const codes = result.findings.map((f) => f.code);
    expect(codes).toContain("SC013"); // spaces in name -> invalid chars
    expect(codes).toContain("SC010"); // uppercase
    expect(codes).toContain("SC014"); // dir mismatch
    expect(codes).toContain("SC007"); // description missing
    expect(codes).toContain("SC018"); // custom-field unknown
    expect(codes).toContain("SC301"); // model extension
    expect(codes).toContain("SC201"); // empty body
    expect(result.errorCount).toBeGreaterThan(0);
  });
});
