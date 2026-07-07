# Changelog

All notable changes to this project will be documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [SemVer](https://semver.org/).

## [0.2.1] - 2026-07-07

### Changed

- Docs: README with badges and terminal demo, CONTRIBUTING.md, SECURITY.md
- CI: auto-publish to npm on GitHub release via OIDC trusted publishing (no stored tokens)

## [0.2.0] - 2026-07-06

### Added

- Stable rule codes (SC0xx frontmatter, SC1xx structure, SC2xx body, SC3xx extensions, SC4xx evals) with kebab-case aliases, interchangeable everywhere
- Exact skills-ref parity: error messages verified verbatim against the reference validator source (including the corrected "are allowed." / period-before-Only messages), check order, and early returns
- Unicode-correct name validation: `\p{L}\p{N}` charset matching Python `str.isalnum()` -- i18n names (Chinese, lowercase Cyrillic) pass, `skill_name` fails; NFKC normalization on names and directory comparison
- Strict-YAML semantics on top of the JS parser: flow collections, tags, and duplicate keys rejected (skills-ref uses strictyaml); split-based frontmatter parsing replicated including the literal-`---` edge case
- 18-field typed extension registry (`src/extensions.ts`) with per-runtime support info; SC302 validates extension values (`effort` enum, boolean fields, etc.)
- Structure rules: SC101 broken-relative-reference, SC102 absolute-path-reference, SC104 unreferenced-bundled-file, SC105 duplicate-skill-name (cross-skill), SC106 non-utf8, SC107 hidden-unicode (Trojan-Source), SC108 legacy {baseDir}
- SC020 lowercase skill.md acceptance (parity with find_skill_md) + warning; SC021 unquoted-colon detection with fix-it suggestion, fires even when parsing failed
- Profiles: `--profile strict` (default, skills-ref parity) / `--profile lenient` (client-guide downgrades for SC009/SC014/SC018)
- SARIF 2.1.0 output (`--format sarif` / `--sarif <path>` sidecar), GitHub-code-scanning-ready (repo-relative forward-slash paths, all rules in tool.driver.rules)
- `skillcheck eval init` / `eval check`: evals/evals.json scaffold + validation -- strict superset of Anthropic skill-creator's format with a 4-class trigger taxonomy (explicit/implicit/contextual/negative)
- Composite GitHub Action (action.yml) with inputs (path, fail-on, profile, sarif-file, version), outputs (error-count, warning-count), env-based injection safety
- `--fail-on error|warning|never`, `--max-warnings N`, `--format concise`, `GITHUB_OUTPUT` counts + `GITHUB_STEP_SUMMARY` report table
- `skillcheck.config.json` rule overrides (off/warn/error/info) by code or alias
- docs/rules.md generated rule reference; fixable metadata tagged per rule (fixes themselves land in v0.3)

### Changed

- Severity model gains `info` tier (advisory, never gates CI)
- Test suite grown to 40 tests: skills-ref message parity, i18n fixtures, NFKC cases, profile downgrades, SARIF shape, evals semantics

## [0.1.0] - 2026-07-06

### Added

- `skillcheck lint` command: static conformance checks for `SKILL.md` against the Agent Skills spec
- Two severity tiers: errors (skills-ref strict parity) and warnings (client-guide lenient parity), with `--strict` to escalate
- 16 rules covering frontmatter parsing, name/description constraints, field types, client extension fields, unknown fields, and body-size recommendations
- Output formats: `pretty`, `json`, `github` (Actions inline annotations)
- Recursive `**/SKILL.md` discovery under a parent directory
- Test suite (vitest) with valid/broken fixtures
