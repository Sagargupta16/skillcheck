# skillcheck

Conformance suite for [Agent Skills](https://agentskills.io) (`SKILL.md`).

Linters check syntax. skillcheck checks reality: lint a skill against the spec today, run it against real agent runtimes in containers tomorrow, and publish a live compatibility matrix -- caniuse for Agent Skills.

## Why

The Agent Skills standard is adopted by 40+ runtimes (Claude Code, Codex, Gemini CLI, Copilot, Cursor, OpenCode, ...) but there is no automated way to know whether a given skill actually loads and triggers on any of them. The only compatibility table in the ecosystem is hand-maintained. skillcheck automates it.

The official reference validator (`skills-ref`) is strict: unknown frontmatter fields fail. Real clients are lenient: they warn and load anyway. Claude Code alone ships 13+ extension fields that fail strict validation. skillcheck reports both tiers so you know exactly where your skill sits.

## Install

```bash
pnpm add -D @sagargupta16/skillcheck
# or run directly
pnpm dlx @sagargupta16/skillcheck lint ./skills
```

## Usage

```bash
# lint one skill
skillcheck lint ./my-skill

# lint every SKILL.md under a directory
skillcheck lint ./skills

# skills-ref parity: extension/unknown fields become errors
skillcheck lint ./skills --strict

# machine-readable output
skillcheck lint ./skills --format json

# GitHub Actions inline annotations
skillcheck lint ./skills --format github
```

Exit codes: `0` clean (warnings allowed), `1` errors found, `2` usage/IO error.

## What it checks (v0.1)

| Rule | Severity | Source |
| --- | --- | --- |
| `frontmatter-parse` | error | client guide: unparseable YAML means the skill is skipped |
| `name-required`, `name-format`, `name-length` | error | spec: 1-64 chars, `^[a-z0-9]+(-[a-z0-9]+)*$` |
| `name-dir-match` | warning (error with `--strict`) | spec MUST vs client-guide warn-and-load |
| `description-required`, `description-length` | error | spec: non-empty, max 1024 chars |
| `license-type`, `compatibility-type`, `compatibility-length` | error | spec field types |
| `metadata-type` | error | spec: string-to-string map |
| `allowed-tools-type` | error | spec: space-separated string (experimental) |
| `extension-field` | warning (error with `--strict`) | known client extensions (`model`, `hooks`, `context`, ...) |
| `unknown-field` | warning (error with `--strict`) | not spec, not a known extension |
| `body-lines`, `body-tokens`, `body-empty` | warning | spec recommendations (<500 lines, <5000 tokens) |

## Roadmap

- [x] **v0.1 -- lint**: static conformance against the spec, two severity tiers, JSON/GitHub output
- [ ] **v0.2 -- run**: execute a skill against real runtimes headlessly in Docker (Claude Code, OpenCode, Codex first), detect invocation from transcripts
- [ ] **v0.3 -- trigger tests**: explicit/implicit/contextual/negative prompt classes, N-trial hit rates, LLM-judge output assertions
- [ ] **v0.4 -- GitHub Action**: lint + run on PRs touching `**/SKILL.md`, PR comment table
- [ ] **v1.0 -- matrix**: public caniuse-style compatibility matrix site + README badges

## Development

```bash
pnpm install
pnpm test        # vitest
pnpm build       # tsup -> dist/
pnpm lint        # biome
node dist/cli.js lint fixtures/valid-skill
```

## License

[MIT](LICENSE)
