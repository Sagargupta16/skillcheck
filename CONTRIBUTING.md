# Contributing

Thanks for considering a contribution.

## Setup

```bash
git clone https://github.com/Sagargupta16/skillcheck
cd skillcheck
pnpm install
pnpm test
```

## Ground rules

- **Rule codes are permanent.** Never renumber or recycle an SC code. New rules get the next free number in their range (SC0xx frontmatter, SC1xx structure, SC2xx body, SC3xx extensions, SC4xx evals).
- **Parity rules cite their source.** Anything in the error tier must match [skills-ref](https://github.com/agentskills/agentskills/tree/main/skills-ref) behavior exactly -- message text included. Link the validator source line in your PR.
- **Beyond-parity rules are never errors.** Warning or info only.
- **Every rule ships with tests**, including at least one case that must NOT fire (false-positive guard).
- Conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`), lowercase, imperative.
- `pnpm lint && pnpm typecheck && pnpm test` must pass before a PR.

## Adding a rule

1. Register it in `src/lint/registry.ts` (code, alias, severity, fixable, summary).
2. Implement the check in `src/lint/rules.ts` (or `src/lint/index.ts` for filesystem-level checks).
3. Add tests in `tests/lint.test.ts`.
4. Regenerate the rule reference with `pnpm docs:rules`. CI regenerates it too and fails on any diff, so a hand-edited `docs/rules.md` will not pass.

## Reporting bugs

Open a [bug report](https://github.com/Sagargupta16/skillcheck/issues/new?template=bug_report.yml) with the SKILL.md content that misbehaves (redact anything private) and the expected vs actual findings. For a linter the input file is the whole repro -- four lines of frontmatter is usually enough.
