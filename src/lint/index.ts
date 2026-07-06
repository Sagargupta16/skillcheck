import { readdir, readFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import type { Finding, LintOptions, LintResult, Severity } from "../types.js";
import { parseSkillMd } from "./parse.js";
import { getRule } from "./registry.js";
import { runRules } from "./rules.js";

/** Lint a single skill directory containing a SKILL.md (or skill.md). */
export async function lintSkillDir(
  dir: string,
  options: LintOptions = {},
): Promise<LintResult> {
  const skillDir = resolve(dir);
  const dirName = basename(skillDir);

  // skills-ref find_skill_md: SKILL.md preferred, skill.md accepted.
  // Check the real directory entries (not readFile) -- Windows/macOS
  // filesystems are case-insensitive, so readFile("SKILL.md") would
  // silently succeed on a file named skill.md.
  let entries: string[] = [];
  try {
    entries = (await readdir(skillDir)).map(String);
  } catch {
    // fall through to missing-file finding
  }
  let source: Buffer | null = null;
  let usedLowercase = false;
  for (const candidate of ["SKILL.md", "skill.md"]) {
    if (!entries.includes(candidate)) continue;
    try {
      source = await readFile(join(skillDir, candidate));
      usedLowercase = candidate === "skill.md";
      break;
    } catch {
      // try next
    }
  }
  if (source === null) {
    return summarize(skillDir, null, [
      {
        code: "SC001",
        alias: "skill-md-missing",
        severity: "error",
        message: "Missing required file: SKILL.md",
        file: "SKILL.md",
      },
    ]);
  }

  const findings: Finding[] = [];

  // SC106: explicit UTF-8 read (skills-ref platform-default read is a known
  // Windows bug upstream; we read UTF-8 and flag invalid sequences).
  const text = source.toString("utf8");
  if (text.includes("�")) {
    findings.push({
      code: "SC106",
      alias: "non-utf8-encoding",
      severity: "warning",
      message:
        "SKILL.md is not valid UTF-8 (replacement characters found on decode)",
      file: "SKILL.md",
    });
  }
  if (usedLowercase) {
    findings.push({
      code: "SC020",
      alias: "skill-md-lowercase-filename",
      severity: "warning",
      message: "found skill.md; the canonical filename is SKILL.md (uppercase)",
      file: "skill.md",
    });
  }

  const parsed = parseSkillMd(text.replace(/^﻿/, ""));
  const bundledFiles = await listBundledFiles(skillDir);

  findings.push(
    ...runRules({
      parsed,
      dirName,
      profile: options.profile ?? "strict",
      bundledFiles,
    }),
  );

  const skillName =
    parsed.frontmatter && typeof parsed.frontmatter.name === "string"
      ? parsed.frontmatter.name.trim().normalize("NFKC")
      : null;

  return summarize(skillDir, skillName, applyOverrides(findings, options));
}

/** Cross-skill checks over a set of results (SC105 duplicate names). */
export function crossSkillFindings(results: LintResult[]): void {
  const byName = new Map<string, LintResult[]>();
  for (const r of results) {
    if (!r.skillName) continue;
    const list = byName.get(r.skillName) ?? [];
    list.push(r);
    byName.set(r.skillName, list);
  }
  for (const [name, list] of byName) {
    if (list.length < 2) continue;
    for (const r of list) {
      r.findings.push({
        code: "SC105",
        alias: "duplicate-skill-name",
        severity: "warning",
        message: `skill name '${name}' is used by ${list.length} skills in this tree (client-guide: collisions warn; project scope wins)`,
        file: "SKILL.md",
      });
      recount(r);
    }
  }
}

function applyOverrides(findings: Finding[], options: LintOptions): Finding[] {
  const overrides = options.ruleOverrides;
  if (!overrides) return findings;
  const resolved = new Map<string, "off" | Severity>();
  for (const [key, value] of Object.entries(overrides)) {
    const meta = getRule(key);
    if (!meta) continue;
    resolved.set(meta.code, value === "warn" ? "warning" : value);
  }
  const out: Finding[] = [];
  for (const f of findings) {
    const o = resolved.get(f.code);
    if (o === "off") continue;
    out.push(o ? { ...f, severity: o } : f);
  }
  return out;
}

async function listBundledFiles(skillDir: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 4) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, depth + 1);
      } else {
        files.push(relative(skillDir, full).replace(/\\/g, "/"));
      }
    }
  }
  await walk(skillDir, 0);
  return files;
}

function summarize(
  skillDir: string,
  skillName: string | null,
  findings: Finding[],
): LintResult {
  const result: LintResult = {
    skillDir,
    skillName,
    findings,
    errorCount: 0,
    warningCount: 0,
    infoCount: 0,
  };
  recount(result);
  return result;
}

function recount(r: LintResult): void {
  r.errorCount = r.findings.filter((f) => f.severity === "error").length;
  r.warningCount = r.findings.filter((f) => f.severity === "warning").length;
  r.infoCount = r.findings.filter((f) => f.severity === "info").length;
}
