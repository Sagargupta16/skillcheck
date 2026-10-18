/** Browser playground: the real lint rules, bundled for the browser by
 * tsup.site.config.ts. Nothing is sent anywhere; the text never leaves the
 * page except in the share link the user copies. */

import { lintSkillSource } from "../src/lint/source.js";
import type { Finding, Profile, Severity } from "../src/types.js";

declare const __SKILLCHECK_VERSION__: string;

const RULES_URL =
  "https://github.com/Sagargupta16/skillcheck/blob/main/docs/rules.md";

const EXAMPLES: Record<
  string,
  { label: string; source: string; files: string }
> = {
  broken: {
    label: "Broken skill (several rules fire)",
    source: [
      "---",
      "name: Commit_Helper",
      "description: Writes commit messages. Use when the user asks for one.",
      "model: haiku",
      "effort: extreme",
      "custom-field: something",
      "---",
      "# Commit helper",
      "",
      "1. Read the staged diff with `scripts/diff.sh`.",
      "2. Follow the house style in [the guide](references/style.md).",
      "3. Never paste secrets from {baseDir}/notes.txt.",
      "",
    ].join("\n"),
    files: "scripts/diff.sh\nreferences/conventions.md",
  },
  valid: {
    label: "Valid skill (clean)",
    source: [
      "---",
      "name: commit-helper",
      "description: Writes conventional commit messages from the staged diff. Use when the user asks for a commit message or to commit their changes.",
      "license: MIT",
      "---",
      "# Commit helper",
      "",
      "1. Read the staged diff with `scripts/diff.sh`.",
      "2. Follow the house style in [the guide](references/style.md).",
      "3. Write a subject under 72 characters, then a short body.",
      "",
    ].join("\n"),
    files: "scripts/diff.sh\nreferences/style.md",
  },
  colon: {
    label: "Unquoted colon (breaks the YAML)",
    source: [
      "---",
      "name: release-notes",
      "description: Use when: the user asks for release notes",
      "---",
      "# Release notes",
      "",
      "Summarize merged pull requests since the last tag.",
      "",
    ].join("\n"),
    files: "",
  },
  claude: {
    label: "Claude Code extension fields",
    source: [
      "---",
      "name: deploy-preview",
      "description: Deploys the current branch to a preview environment. Use when the user asks to preview or stage a change.",
      "allowed-tools: Bash(git:*) Read",
      "disable-model-invocation: true",
      'argument-hint: "<branch>"',
      "context: fork",
      "---",
      "# Deploy preview",
      "",
      "Run the deploy script and report the preview URL.",
      "",
    ].join("\n"),
    files: "",
  },
};

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

const editor = $<HTMLTextAreaElement>("editor");
const gutter = $<HTMLDivElement>("gutter");
const dirInput = $<HTMLInputElement>("dir-name");
const filesInput = $<HTMLTextAreaElement>("bundled-files");
const exampleSelect = $<HTMLSelectElement>("example");
const findingsList = $<HTMLOListElement>("findings");
const summary = $<HTMLDivElement>("summary");
const verdict = $<HTMLParagraphElement>("verdict");
const shareButton = $<HTMLButtonElement>("share");
const profileButtons = [
  ...document.querySelectorAll<HTMLButtonElement>("[data-profile]"),
];

let profile: Profile = "strict";

for (const [key, ex] of Object.entries(EXAMPLES)) {
  const option = document.createElement("option");
  option.value = key;
  option.textContent = ex.label;
  exampleSelect.append(option);
}

$("version").textContent = `v${__SKILLCHECK_VERSION__}`;

interface State {
  source: string;
  profile: Profile;
  dirName: string;
  files: string;
}

function encodeState(state: State): string {
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeState(encoded: string): State | null {
  try {
    const bin = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const raw = JSON.parse(new TextDecoder().decode(bytes)) as Partial<State>;
    if (typeof raw.source !== "string") return null;
    return {
      source: raw.source,
      profile: raw.profile === "lenient" ? "lenient" : "strict",
      dirName: typeof raw.dirName === "string" ? raw.dirName : "",
      files: typeof raw.files === "string" ? raw.files : "",
    };
  } catch {
    return null;
  }
}

function loadExample(key: string): void {
  const ex = EXAMPLES[key];
  if (!ex) return;
  editor.value = ex.source;
  filesInput.value = ex.files;
  dirInput.value = "";
  run();
}

function setProfile(next: Profile): void {
  profile = next;
  for (const b of profileButtons) {
    b.setAttribute("aria-pressed", String(b.dataset.profile === next));
  }
}

const SEVERITY_ORDER: Record<Severity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

function plural(n: number, word: string): string {
  // "info" is a mass noun in the CLI output too: "0 info".
  if (word === "info" || n === 1) return `${n} ${word}`;
  return `${n} ${word}s`;
}

function renderGutter(lineCount: number, marks: Map<number, Severity>): void {
  const frag = document.createDocumentFragment();
  for (let i = 1; i <= lineCount; i++) {
    const row = document.createElement("span");
    row.textContent = String(i);
    const sev = marks.get(i);
    if (sev) row.className = `mark-${sev}`;
    frag.append(row);
  }
  gutter.replaceChildren(frag);
  gutter.scrollTop = editor.scrollTop;
}

function jumpToLine(line: number): void {
  const lines = editor.value.split("\n");
  const start = lines.slice(0, line - 1).reduce((s, l) => s + l.length + 1, 0);
  const end = start + (lines[line - 1]?.length ?? 0);
  editor.focus();
  editor.setSelectionRange(start, end);
  const lineHeight = Number.parseFloat(getComputedStyle(editor).lineHeight);
  editor.scrollTop = Math.max(0, (line - 3) * lineHeight);
  editor.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function renderFinding(f: Finding, index: number): HTMLLIElement {
  const li = document.createElement("li");
  li.className = `finding sev-${f.severity}`;
  li.style.setProperty("--i", String(index));

  const head = document.createElement("div");
  head.className = "finding-head";
  const chip = document.createElement("span");
  chip.className = "chip";
  chip.textContent = f.severity;
  const code = document.createElement("a");
  code.className = "code";
  code.href = `${RULES_URL}#${f.code.toLowerCase()}`;
  code.target = "_blank";
  code.rel = "noopener";
  code.textContent = f.code;
  const alias = document.createElement("span");
  alias.className = "alias";
  alias.textContent = f.alias;
  head.append(chip, code, alias);
  if (f.line !== undefined && f.file === "SKILL.md") {
    const at = f.line;
    const jump = document.createElement("button");
    jump.type = "button";
    jump.className = "jump";
    jump.textContent = `line ${at}`;
    jump.addEventListener("click", () => jumpToLine(at));
    head.append(jump);
  }

  const message = document.createElement("p");
  message.className = "message";
  message.textContent = f.message;
  li.append(head, message);
  if (f.suggestion) {
    const fix = document.createElement("p");
    fix.className = "suggestion";
    fix.textContent = `fix: ${f.suggestion}`;
    li.append(fix);
  }
  return li;
}

function run(): void {
  const source = editor.value;
  const bundledFiles = filesInput.value
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^\.\//, ""))
    .filter(Boolean);
  const dirName = dirInput.value.trim();
  // SKILL.md itself is always bundled, like it is on disk.
  const files = bundledFiles.length > 0 ? ["SKILL.md", ...bundledFiles] : [];
  const { findings, skillName } = lintSkillSource(source, {
    profile,
    bundledFiles: files,
    ...(dirName ? { dirName } : {}),
  });
  dirInput.placeholder = skillName ?? "same as name";
  findings.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      (a.line ?? 1) - (b.line ?? 1),
  );

  const counts = { error: 0, warning: 0, info: 0 };
  const marks = new Map<number, Severity>();
  for (const f of findings) {
    counts[f.severity]++;
    if (f.line === undefined || f.file !== "SKILL.md") continue;
    const prev = marks.get(f.line);
    if (!prev || SEVERITY_ORDER[f.severity] < SEVERITY_ORDER[prev]) {
      marks.set(f.line, f.severity);
    }
  }
  renderGutter(source.split("\n").length, marks);

  summary.replaceChildren(
    ...(["error", "warning", "info"] as const).map((sev) => {
      const pill = document.createElement("span");
      pill.className = `count count-${sev}${counts[sev] > 0 ? " on" : ""}`;
      pill.textContent = plural(counts[sev], sev);
      return pill;
    }),
  );
  summary.classList.remove("bump");
  void summary.offsetWidth; // restart the animation
  summary.classList.add("bump");

  const status =
    counts.error > 0 ? "fail" : counts.warning > 0 ? "warn" : "pass";
  verdict.dataset.status = status;
  const [before, command, after] =
    status === "fail"
      ? [`Fails the ${profile} profile: `, "skillcheck lint", " exits 1."]
      : status === "warn"
        ? ["Passes the default gate. Warnings fail ", "--fail-on warning", "."]
        : ["Clean: ", "skillcheck lint --fail-on warning", " exits 0."];
  const code = document.createElement("code");
  code.textContent = command;
  verdict.replaceChildren(before, code, after);

  if (findings.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No findings. This skill matches the spec.";
    findingsList.replaceChildren(empty);
  } else {
    findingsList.replaceChildren(...findings.map(renderFinding));
  }

  const state: State = { source, profile, dirName, files: filesInput.value };
  history.replaceState(null, "", `#s=${encodeState(state)}`);
}

let timer: number | undefined;
function schedule(): void {
  window.clearTimeout(timer);
  timer = window.setTimeout(run, 120);
}

editor.addEventListener("input", schedule);
editor.addEventListener("scroll", () => {
  gutter.scrollTop = editor.scrollTop;
});
dirInput.addEventListener("input", schedule);
filesInput.addEventListener("input", schedule);
exampleSelect.addEventListener("change", () =>
  loadExample(exampleSelect.value),
);
for (const b of profileButtons) {
  b.addEventListener("click", () => {
    setProfile(b.dataset.profile === "lenient" ? "lenient" : "strict");
    run();
  });
}
editor.addEventListener("keydown", (e) => {
  if (e.key !== "Tab" || e.shiftKey) return;
  e.preventDefault();
  editor.setRangeText("  ", editor.selectionStart, editor.selectionEnd, "end");
  schedule();
});

shareButton.addEventListener("click", async () => {
  run();
  const label = shareButton.textContent;
  try {
    await navigator.clipboard.writeText(location.href);
    shareButton.textContent = "Link copied";
  } catch {
    shareButton.textContent = "Copy the address bar";
  }
  window.setTimeout(() => {
    shareButton.textContent = label;
  }, 1600);
});

for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-copy]",
)) {
  button.addEventListener("click", async () => {
    const target = document.getElementById(button.dataset.copy ?? "");
    if (!target) return;
    await navigator.clipboard.writeText(target.textContent ?? "");
    button.textContent = "Copied";
    window.setTimeout(() => {
      button.textContent = "Copy";
    }, 1400);
  });
}

const shared = location.hash.startsWith("#s=")
  ? decodeState(location.hash.slice(3))
  : null;
if (shared) {
  editor.value = shared.source;
  dirInput.value = shared.dirName;
  filesInput.value = shared.files;
  setProfile(shared.profile);
  run();
} else {
  setProfile("strict");
  loadExample("broken");
}
