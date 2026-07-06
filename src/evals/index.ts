import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { Finding } from "../types.js";
import { evalsFileSchema } from "./schema.js";

function finding(severity: Finding["severity"], message: string): Finding {
  return {
    code: severity === "error" ? "SC401" : "SC402",
    alias: severity === "error" ? "evals-invalid" : "evals-advisory",
    severity,
    message,
    file: "evals/evals.json",
  };
}

/** Validate evals/evals.json against the schema + semantic rules.
 * Returns findings (empty when the file is absent -- evals are optional). */
export async function checkEvals(
  skillDir: string,
  skillName: string | null,
): Promise<Finding[]> {
  const path = join(skillDir, "evals", "evals.json");
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return [];
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    return [
      finding(
        "error",
        `evals.json is not valid JSON: ${err instanceof Error ? err.message : err}`,
      ),
    ];
  }

  const parsed = evalsFileSchema.safeParse(data);
  if (!parsed.success) {
    return parsed.error.issues
      .slice(0, 10)
      .map((i) =>
        finding(
          "error",
          `evals.json ${i.path.join(".") || "(root)"}: ${i.message}`,
        ),
      );
  }

  const out: Finding[] = [];
  const evals = parsed.data;

  if (skillName && evals.skill_name !== skillName) {
    out.push(
      finding(
        "error",
        `skill_name "${evals.skill_name}" does not match the skill's resolved name "${skillName}"`,
      ),
    );
  }

  const ids = (evals.evals ?? []).map((e) => e.id);
  if (new Set(ids).size !== ids.length) {
    out.push(finding("error", "evals[].id values must be unique"));
  }

  for (const e of evals.evals ?? []) {
    for (const f of e.files ?? []) {
      try {
        await stat(join(skillDir, f));
      } catch {
        out.push(
          finding(
            "error",
            `evals[${e.id}].files: "${f}" does not exist relative to the skill root`,
          ),
        );
      }
    }
  }

  const triggers = evals.triggers ?? [];
  for (const t of triggers) {
    const effective = t.should_trigger ?? t.type !== "negative";
    if (t.type === "negative" && effective) {
      out.push(
        finding(
          "error",
          `triggers["${t.id}"]: type "negative" requires should_trigger: false`,
        ),
      );
    }
  }
  const negatives = triggers.filter((t) => t.type === "negative").length;
  if (triggers.length > 0 && negatives < 2) {
    out.push(
      finding(
        "warning",
        `only ${negatives} negative trigger(s) -- near-miss negatives are what catch over-triggering; aim for at least 2`,
      ),
    );
  }

  return out;
}

/** Scaffold evals/evals.json for a skill (skill-creator-compatible). */
export async function initEvals(
  skillDir: string,
  skillName?: string,
): Promise<string> {
  const name = skillName ?? basename(skillDir);
  const path = join(skillDir, "evals", "evals.json");
  try {
    await stat(path);
    throw new Error(`already exists: ${path}`);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("already exists"))
      throw err;
  }

  const scaffold = {
    skill_name: name,
    settings: { runs_per_prompt: 3, trigger_threshold: 0.8 },
    evals: [
      {
        id: 1,
        prompt:
          "REPLACE: a realistic user prompt this skill should handle end to end",
        expected_output: "REPLACE: what a correct result looks like",
        expectations: [
          "REPLACE: a checkable statement about the output",
          "REPLACE: another checkable statement",
        ],
      },
    ],
    triggers: [
      {
        id: "explicit-1",
        type: "explicit",
        prompt: `REPLACE: prompt naming ${name} directly`,
        should_trigger: true,
      },
      {
        id: "explicit-2",
        type: "explicit",
        prompt: `REPLACE: /${name} slash invocation phrasing`,
        should_trigger: true,
      },
      {
        id: "explicit-3",
        type: "explicit",
        prompt: "REPLACE: third explicit phrasing",
        should_trigger: true,
      },
      {
        id: "implicit-1",
        type: "implicit",
        prompt: "REPLACE: describes the task without naming the skill",
        should_trigger: true,
      },
      {
        id: "implicit-2",
        type: "implicit",
        prompt: "REPLACE: second implicit phrasing",
        should_trigger: true,
      },
      {
        id: "implicit-3",
        type: "implicit",
        prompt: "REPLACE: third implicit phrasing",
        should_trigger: true,
      },
      {
        id: "contextual-1",
        type: "contextual",
        prompt: "REPLACE: mid-conversation context where the skill should fire",
        should_trigger: true,
      },
      {
        id: "contextual-2",
        type: "contextual",
        prompt: "REPLACE: second contextual phrasing",
        should_trigger: true,
      },
      {
        id: "contextual-3",
        type: "contextual",
        prompt: "REPLACE: third contextual phrasing",
        should_trigger: true,
      },
      {
        id: "negative-1",
        type: "negative",
        prompt: "REPLACE: same-domain near-miss that should NOT trigger",
        should_trigger: false,
      },
      {
        id: "negative-2",
        type: "negative",
        prompt: "REPLACE: second same-domain near-miss",
        should_trigger: false,
      },
      {
        id: "negative-3",
        type: "negative",
        prompt: "REPLACE: adjacent task that should NOT trigger",
        should_trigger: false,
      },
      {
        id: "negative-4",
        type: "negative",
        prompt: "REPLACE: unrelated prompt that should NOT trigger",
        should_trigger: false,
      },
    ],
  };

  await mkdir(join(skillDir, "evals"), { recursive: true });
  await writeFile(path, `${JSON.stringify(scaffold, null, 2)}\n`, "utf8");
  return path;
}
