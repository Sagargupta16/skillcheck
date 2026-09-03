# CLAUDE.md

> This file stacks on top of the workspace root at `C:\Code\GitHub\`:
> - Root [`CLAUDE.md`](../../CLAUDE.md) -- voice, rules, routing map, references, skills, slash commands, conventions.
> - Root [`MEMORY.md`](../../MEMORY.md) -- live facts across repos.
> - Root [`STATUS.md`](../../STATUS.md) -- live PR/CI/security dashboard.
> - [`.claude/resources/`](../../.claude/resources/README.md) -- deep reference for collaboration, workflow, git, OSS, debugging, voice.
>
> Read those first. The guidance below only adds **repo-specific context** -- it does not override anything in the root.

## Project

Conformance suite for Agent Skills (SKILL.md): lints skills against the agentskills.io spec today; roadmap is headless cross-runtime execution tests + a public caniuse-style compatibility matrix. Public OSS, npm package `@sagargupta1610/skillcheck`.

## Stack

- **Language**: TypeScript 7 (strict, ESM, NodeNext)
- **Framework**: none -- CLI via commander, JS bundled by tsup, `.d.ts` emitted by `tsc`
- **Database**: none
- **Package manager**: pnpm
- **Deploy target**: npm registry (CLI); matrix site later (Vercel)

## Run

```
pnpm install
pnpm dev          # tsup --watch (JS only, no .d.ts)
pnpm build        # tsup -> dist/*.js, then tsc --emitDeclarationOnly -> dist/*.d.ts
node dist/cli.js lint fixtures/valid-skill
```

## Test

```
pnpm test         # vitest
pnpm lint         # biome
pnpm typecheck
```

## Entry points

- `src/cli.ts` -- commander CLI (`skillcheck lint`)
- `src/index.ts` -- library exports (lintSkillDir, parseSkillMd, types)

## Key files

- `src/lint/rules.ts` -- the "brain": all lint rule implementations and limits
- `src/extensions.ts` -- SPEC_FIELDS + KNOWN_EXTENSIONS typed registry (spec fields, client extension fields)
- `src/lint/parse.ts` -- SKILL.md frontmatter/body splitter (never throws)
- `fixtures/` -- valid-skill and broken-skill lint fixtures used by tests and CI smoke test

## Gotchas

- The Agent Skills spec is UNVERSIONED -- when rules change upstream, pin claims to a spec-repo git SHA in the finding message/docs.
- Severity model is three-tier by design: error = skills-ref strict parity, warning = beyond-parity checks + client-guide downgrades, info = advisory (never gates CI). `--profile strict` is the default; `--profile lenient` downgrades `name-too-long`, `name-dir-mismatch`, `unknown-frontmatter-field` to warnings (`--strict` is a deprecated alias for the default). Don't collapse the tiers.
- `KNOWN_EXTENSIONS` in `src/extensions.ts` tracks client extension fields (Claude Code, Cursor, Copilot, OpenCode); update it when runtimes ship new frontmatter keys.
- Name collision landscape: getskillcheck.com is an unrelated paid static-analysis product; npm unscoped `skillcheck`/`skill-check` are taken. This package is scoped `@sagargupta1610/skillcheck` on purpose.
- **Never set `dts: true` in `tsup.config.ts`.** tsup bundles `rollup-plugin-dts@6.1.1` into its own `dist/rollup.js` rather than installing it, and that vendored copy calls a TS compiler internal the native TypeScript 7 port removed -- the build dies on `Cannot read properties of undefined (reading 'useCaseSensitiveFileNames')`. No dependency bump reaches a bundled module, and tsup 8.5.1 is already latest. Declarations come from `tsc --emitDeclarationOnly` in the `build` script instead, which tracks whatever TS version is installed. Revisit only if tsup ships a release that re-vendors rollup-plugin-dts >= 6.5.x (that version declares `typescript: ^4.5 || ^5 || ^6 || ^7`).

## Repo-specific rules

- v0.2+ runtime execution work must NEVER run agent CLIs outside Docker containers, and user API keys are supplied by env var only -- never stored.
