# Changelog

All notable changes to this project will be documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [SemVer](https://semver.org/).

## [0.1.0] - 2026-07-06

### Added

- `skillcheck lint` command: static conformance checks for `SKILL.md` against the Agent Skills spec
- Two severity tiers: errors (skills-ref strict parity) and warnings (client-guide lenient parity), with `--strict` to escalate
- 16 rules covering frontmatter parsing, name/description constraints, field types, client extension fields, unknown fields, and body-size recommendations
- Output formats: `pretty`, `json`, `github` (Actions inline annotations)
- Recursive `**/SKILL.md` discovery under a parent directory
- Test suite (vitest) with valid/broken fixtures
