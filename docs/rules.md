# Rules

Rule codes are stable: never renumbered, never recycled. Codes and kebab-case aliases are interchangeable in config and CLI flags.

Severity tiers: **error** = skills-ref 0.1.0 strict parity, **warning** = beyond-parity + client-guide lenient tier, **info** = advisory, never gates CI.

| Code | Alias | Severity | Lenient | Fixable | Summary |
| --- | --- | --- | --- | --- | --- |
| <a id="sc001"></a>SC001 | `skill-md-missing` | error | error | - | Skill directory must contain SKILL.md |
| <a id="sc002"></a>SC002 | `frontmatter-missing` | error | error | - | SKILL.md must start with YAML frontmatter |
| <a id="sc003"></a>SC003 | `frontmatter-unclosed` | error | error | - | Frontmatter must be closed with --- |
| <a id="sc004"></a>SC004 | `frontmatter-invalid-yaml` | error | error | - | Frontmatter must be valid strict YAML |
| <a id="sc005"></a>SC005 | `frontmatter-not-mapping` | error | error | - | Frontmatter must be a YAML mapping |
| <a id="sc006"></a>SC006 | `name-missing` | error | error | - | name is required |
| <a id="sc007"></a>SC007 | `description-missing` | error | error | - | description is required |
| <a id="sc008"></a>SC008 | `name-empty` | error | error | - | name must be a non-empty string |
| <a id="sc009"></a>SC009 | `name-too-long` | error | warning | - | name must be at most 64 characters |
| <a id="sc010"></a>SC010 | `name-not-lowercase` | error | error | safe | name must be lowercase |
| <a id="sc011"></a>SC011 | `name-edge-hyphen` | error | error | safe | name cannot start or end with a hyphen |
| <a id="sc012"></a>SC012 | `name-consecutive-hyphens` | error | error | safe | name cannot contain consecutive hyphens |
| <a id="sc013"></a>SC013 | `name-invalid-chars` | error | error | - | name may only contain letters, digits, and hyphens |
| <a id="sc014"></a>SC014 | `name-dir-mismatch` | error | warning | - | directory name must match skill name |
| <a id="sc015"></a>SC015 | `description-empty` | error | error | - | description must be a non-empty string |
| <a id="sc016"></a>SC016 | `description-too-long` | error | error | - | description must be at most 1024 characters |
| <a id="sc017"></a>SC017 | `compatibility-invalid` | error | error | - | compatibility must be a string of at most 500 characters |
| <a id="sc018"></a>SC018 | `unknown-frontmatter-field` | error | warning | - | frontmatter field is not in the spec or a known extension |
| <a id="sc019"></a>SC019 | `metadata-not-string-map` | warning | warning | - | metadata should be a string-to-string map |
| <a id="sc020"></a>SC020 | `skill-md-lowercase-filename` | warning | warning | safe | skill.md found; canonical filename is SKILL.md |
| <a id="sc021"></a>SC021 | `unquoted-colon-description` | warning | warning | safe | unquoted colon in name/description value breaks lenient parsers |
| <a id="sc101"></a>SC101 | `broken-relative-reference` | warning | warning | - | referenced bundled file does not exist |
| <a id="sc102"></a>SC102 | `absolute-path-reference` | warning | warning | - | body references an absolute path |
| <a id="sc103"></a>SC103 | `deep-reference-chain` | info | info | - | bundled reference chains deeper than one level |
| <a id="sc104"></a>SC104 | `unreferenced-bundled-file` | info | info | - | bundled file never referenced from SKILL.md |
| <a id="sc105"></a>SC105 | `duplicate-skill-name` | warning | warning | - | two skills resolve to the same name |
| <a id="sc106"></a>SC106 | `non-utf8-encoding` | warning | warning | - | SKILL.md is not valid UTF-8 |
| <a id="sc107"></a>SC107 | `hidden-unicode` | warning | warning | unsafe | zero-width or bidi control characters present |
| <a id="sc108"></a>SC108 | `legacy-basedir-placeholder` | warning | warning | safe | deprecated {baseDir} placeholder |
| <a id="sc201"></a>SC201 | `body-empty` | warning | warning | - | SKILL.md body is empty |
| <a id="sc202"></a>SC202 | `body-too-many-lines` | warning | warning | - | body exceeds 500 lines |
| <a id="sc203"></a>SC203 | `body-too-many-tokens` | warning | warning | - | body exceeds ~5000 tokens |
| <a id="sc301"></a>SC301 | `extension-field` | warning | warning | - | client extension field (fails strict skills-ref validation) |
| <a id="sc302"></a>SC302 | `extension-invalid-value` | warning | warning | - | extension field has an invalid value |
| <a id="sc401"></a>SC401 | `evals-invalid` | error | error | - | evals/evals.json fails schema or semantic validation |
| <a id="sc402"></a>SC402 | `evals-advisory` | warning | warning | - | evals/evals.json advisory (coverage gaps) |

## Profiles

- `--profile strict` (default): full skills-ref parity. SC009 (name-too-long), SC014 (name-dir-mismatch), and SC018 (unknown-frontmatter-field) are errors.
- `--profile lenient`: client-implementation-guide behavior -- those three downgrade to warnings (clients warn and load anyway). Missing description and broken YAML stay fatal in both profiles.

## Suppressions

Override any rule in `skillcheck.config.json`:

```json
{
  "rules": {
    "SC104": "off",
    "extension-field": "error"
  }
}
```
