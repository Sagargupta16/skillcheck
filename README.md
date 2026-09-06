# skillcheck

[![npm](https://img.shields.io/npm/v/%40sagargupta1610%2Fskillcheck?label=npm)](https://www.npmjs.com/package/@sagargupta1610/skillcheck)
[![CI](https://github.com/Sagargupta16/skillcheck/actions/workflows/ci.yml/badge.svg)](https://github.com/Sagargupta16/skillcheck/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node >= 22](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](package.json)

Conformance suite for [Agent Skills](https://agentskills.io) (`SKILL.md`).

Linters check syntax. skillcheck checks reality: 36 rules with exact [skills-ref](https://github.com/agentskills/agentskills/tree/main/skills-ref) parity (verified against the reference validator's source, message for message), a 19-field client-extension registry across 3 runtimes, structure and reference validation, trigger-test scaffolding, SARIF output, and a drop-in GitHub Action.

```
$ skillcheck lint ./skills

commit_helper  ./skills/commit-helper
  WARN [SC301 extension-field] `model` is a client extension (claude-code), not in the Agent Skills spec -- fails strict skills-ref validation
  ERR  [SC013 name-invalid-chars] Skill name 'commit_helper' contains invalid characters. Only letters, digits, and hyphens are allowed.
  ERR  [SC014 name-dir-mismatch] Directory name 'commit-helper' must match skill name 'commit_helper'
  WARN [SC101 broken-relative-reference] referenced file `references/style.md` does not exist in the skill directory

1 skill(s) checked: 2 error(s), 2 warning(s), 0 info
```

## Why

The Agent Skills standard is adopted by 40+ runtimes (Claude Code, Codex, Gemini CLI, Copilot, Cursor, OpenCode, ...) and its ecosystem has a built-in tension: the official reference validator (`skills-ref`) is **strict** -- unknown frontmatter fields fail -- while real clients are **lenient** -- they warn and load anyway. Claude Code alone ships 18 extension fields that fail strict validation.

skillcheck is the only linter that models both tiers:

| Tier | Meaning |
| --- | --- |
| **error** | skills-ref 0.1.0 strict parity: exact messages, exact check order, exact i18n semantics |
| **warning** | client-guide lenient tier + beyond-parity checks (broken references, hidden unicode, portability) |
| **info** | advisory; never gates CI |

## Quick start

```bash
# no install
npx -y @sagargupta1610/skillcheck lint ./skills

# or as a dev dependency
pnpm add -D @sagargupta1610/skillcheck
```

```bash
skillcheck lint ./my-skill                 # one skill
skillcheck lint ./my-skill/SKILL.md        # or point straight at the file
skillcheck lint ./skills                   # every SKILL.md under a tree
skillcheck lint . --profile lenient        # client-guide severities
skillcheck lint . --format concise         # one line per finding
skillcheck lint . --format json            # machine-readable
skillcheck lint . --format sarif           # SARIF 2.1.0 to stdout
skillcheck lint . --sarif report.sarif     # sidecar SARIF alongside any format
skillcheck lint . --fail-on warning        # stricter CI gate
skillcheck lint . --max-warnings 10
skillcheck lint . --ignore-pattern 'fixtures/**' 'vendor/**'

skillcheck eval init ./my-skill            # scaffold evals/evals.json
skillcheck eval check ./my-skill           # validate it
```

`--ignore-pattern` adds to the `ignore` array in `skillcheck.config.json` rather than replacing it.

Exit codes: `0` clean, `1` findings at or above `--fail-on`, `2` usage or internal error. An unrecognized `--profile`, `--format`, `--fail-on` or `--max-warnings` value is a usage error, not a silent fallback -- a typo in a workflow file fails loudly instead of quietly weakening the gate.

## GitHub Action

```yaml
jobs:
  skills:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: Sagargupta16/skillcheck@v0.2.2
        with:
          path: skills/
          fail-on: error
          sarif-file: skillcheck.sarif   # optional

      # optional: upload to code scanning (needs security-events: write)
      - uses: github/codeql-action/upload-sarif@v4
        with:
          sarif_file: skillcheck.sarif
          category: skillcheck
```

Inline PR annotations come free via workflow commands; a full report table lands in the job summary automatically. Action outputs: `error-count`, `warning-count`, `sarif-file`.

## Rules

36 rules with stable codes (never renumbered or recycled). Full reference: [docs/rules.md](docs/rules.md).

| Range | Category | Examples |
| --- | --- | --- |
| SC0xx | Frontmatter (skills-ref parity) | SC010 name-not-lowercase, SC013 name-invalid-chars, SC018 unknown-frontmatter-field, SC021 unquoted-colon-description |
| SC1xx | Structure + references | SC101 broken-relative-reference, SC105 duplicate-skill-name, SC107 hidden-unicode (Trojan-Source) |
| SC2xx | Body | SC202 body-too-many-lines, SC203 body-too-many-tokens |
| SC3xx | Extensions / portability | SC301 extension-field (per-runtime table), SC302 extension-invalid-value |
| SC4xx | Evals | SC401 evals-invalid, SC402 evals-advisory |

Parity details worth knowing:

- Name validation is Unicode-aware, matching skills-ref exactly: `技能` and `мой-навык` pass, `skill_name` and `НАВЫК` fail.
- NFKC normalization applies to names and directory comparison -- composed vs decomposed `café` never false-positives.
- The frontmatter splitter replicates skills-ref's `split("---", 2)` semantics, including its known edge case (a literal `---` inside YAML values).
- Strict-YAML semantics are enforced on top of the JS parser: flow collections, tags, and duplicate keys are rejected, like `strictyaml`.
- The 19-field extension registry knows which of the three modeled runtimes read each field -- `model` is Claude Code only, `paths` is Claude Code + Cursor, `globs` is Cursor legacy -- and validates values (`effort: extreme` flags SC302). Fields absent from a runtime's current published frontmatter reference stay registered, so they warn instead of erroring, and say so in the message.

## Configuration

Optional `skillcheck.config.json` in your project root:

```json
{
  "rules": {
    "SC104": "off",
    "extension-field": "error"
  },
  "ignore": ["fixtures/**", "**/vendor/**"]
}
```

Codes and kebab-case aliases are interchangeable. Zero-config works.

`ignore` takes globs applied during discovery, relative to each path you pass on the command line, so vendored or fixture skills never reach the rules. `node_modules` and `.git` are always excluded.

## Evals (trigger tests)

`skillcheck eval init` scaffolds `evals/evals.json` -- a strict superset of Anthropic skill-creator's format (anything skill-creator writes, skillcheck validates unchanged) plus a `triggers` array covering four trigger classes: explicit, implicit, contextual, and negative (the near-misses that catch over-triggering). `skillcheck lint` validates the file automatically when present. Runtime execution of these tests lands in v0.3.

## Roadmap

- [x] **v0.1** -- static lint, two-tier severity
- [x] **v0.2** -- skills-ref parity (verified message for message), rule codes, i18n names, structure/reference rules, extension registry with value validation, SARIF 2.1.0, evals scaffold + validation, GitHub Action, profiles, config
- [ ] **v0.3** -- runtime execution: run trigger tests against Claude Code / OpenCode / Codex headlessly in Docker; `--fix` for safe fixes
- [ ] **v1.0** -- public caniuse-style compatibility matrix + README badges

## Development

```bash
pnpm install
pnpm test        # vitest: skills-ref parity, i18n names, workflow-command escaping
pnpm build       # tsup -> dist/*.js, tsc --emitDeclarationOnly -> dist/*.d.ts
pnpm lint        # biome
pnpm docs:rules  # regenerate docs/rules.md from src/lint/registry.ts
node dist/cli.js lint fixtures/valid-skill
```

Contributions welcome -- see [CONTRIBUTING.md](CONTRIBUTING.md).

## More AI Developer Tools

| Repo | What it is |
| --- | --- |
| [claude-code-recipes](https://github.com/Sagargupta16/claude-code-recipes) | Copy-paste recipes for Claude Code: commands, subagents, hooks, skills, MCP integration, workflow patterns |
| [claude-skills](https://github.com/Sagargupta16/claude-skills) | Claude Code plugin marketplace with skills for FARM stack, open source contributions, repo maintenance and portfolio management |
| [agent-recipes](https://github.com/Sagargupta16/agent-recipes) | Copy-paste AI agent workflows for real dev tasks: code review, testing, security scanning, DevOps automation |
| [mcp-toolkit](https://github.com/Sagargupta16/mcp-toolkit) | TypeScript middleware toolkit for MCP servers: authentication, caching, rate limiting, CORS, logging (beta) |
| [claude-cost-optimizer](https://github.com/Sagargupta16/claude-cost-optimizer) | Strategies, benchmarks and copy-paste configs for cutting Claude Code spend |

## License

[MIT](LICENSE)
