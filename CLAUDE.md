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

- **Language**: TypeScript 5 (strict, ESM, NodeNext)
- **Framework**: none -- CLI via commander, build via tsup
- **Database**: none
- **Package manager**: pnpm
- **Deploy target**: npm registry (CLI); matrix site later (Vercel)

## Run

```
pnpm install
pnpm dev          # tsup --watch
pnpm build        # dist/
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

- `src/lint/rules.ts` -- the "brain": all lint rules, spec fields, known client extensions, limits
- `src/lint/parse.ts` -- SKILL.md frontmatter/body splitter (never throws)
- `fixtures/` -- valid-skill and broken-skill lint fixtures used by tests and CI smoke test

## Gotchas

- The Agent Skills spec is UNVERSIONED -- when rules change upstream, pin claims to a spec-repo git SHA in the finding message/docs.
- Severity model is two-tier by design: error = skills-ref strict parity, warning = client-guide lenient parity. `--strict` escalates warnings for `name-dir-match`, `extension-field`, `unknown-field`. Don't collapse the tiers.
- `KNOWN_EXTENSIONS` in `src/lint/rules.ts` tracks Claude Code extension fields; update it when Claude Code ships new frontmatter keys.
- Name collision landscape: getskillcheck.com is an unrelated paid static-analysis product; npm unscoped `skillcheck`/`skill-check` are taken. This package is scoped `@sagargupta1610/skillcheck` on purpose.

## Repo-specific rules

- v0.2+ runtime execution work must NEVER run agent CLIs outside Docker containers, and user API keys are supplied by env var only -- never stored.
