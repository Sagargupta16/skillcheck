# Evals (trigger tests)

`evals/evals.json` records what a skill should do and, more importantly, *when it should fire*. skillcheck validates the file whenever it is present next to a `SKILL.md`, and scaffolds one with `skillcheck eval init`.

The format is a strict superset of Anthropic skill-creator's `evals/evals.json`: anything skill-creator writes validates unchanged, and skillcheck adds a `triggers` array. Unknown keys are allowed and preserved everywhere, so a harness of your own can carry extra fields through.

v0.2 validates the file. Running the trigger tests against real runtimes lands in v0.3.

## Location

```
my-skill/
  SKILL.md
  evals/
    evals.json
    files/          # optional inputs referenced by evals[].files
```

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `skill_name` | string | yes | Must equal the skill's resolved name (the NFKC-normalized, trimmed `name` from frontmatter). A mismatch is SC401. |
| `settings.runs_per_prompt` | integer >= 1 | no | How many times a harness should replay each prompt. Trigger decisions are probabilistic, so one run proves nothing. |
| `settings.trigger_threshold` | number 0..1 | no | Fraction of runs that must agree with `should_trigger` for the case to pass. |
| `evals[]` | array | no | End-to-end behavior cases. |
| `triggers[]` | array | no | Invocation cases: does the skill fire on this prompt at all. |

### `evals[]` (skill-creator compatible)

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | integer | yes | Unique within the file. Duplicates are SC401. |
| `prompt` | string | yes | A realistic user request the skill should handle end to end. |
| `expected_output` | string | no | Prose description of a correct result. |
| `files` | string[] | no | Input paths relative to the **skill root**. Each must exist on disk; a missing one is SC401. |
| `expectations` | string[] | yes, >= 1 | Checkable statements about the output. One assertion each, not a paragraph. |

### `triggers[]` (skillcheck addition)

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string | yes | Stable label, e.g. `explicit-1`. |
| `type` | enum | yes | `explicit` \| `implicit` \| `contextual` \| `negative`. |
| `prompt` | string | yes | The user message to test. |
| `should_trigger` | boolean | no | Defaults to `true` for every type except `negative`, which defaults to `false`. |

The four classes and what each one is for:

| Type | The prompt... | Default polarity |
| --- | --- | --- |
| `explicit` | names the skill, or invokes it as `/skill-name` | should trigger |
| `implicit` | describes the task without naming the skill | should trigger |
| `contextual` | arrives mid-conversation, where the surrounding context is what makes the skill relevant | should trigger |
| `negative` | is a near-miss in the same domain, or an adjacent task | should NOT trigger |

Negatives are the ones that matter. A skill with a greedy description passes every positive case and hijacks unrelated work; only same-domain near-misses catch that. `type: negative` with `should_trigger: true` is a contradiction and is reported as SC401.

## Example

```json
{
  "skill_name": "commit-helper",
  "settings": {
    "runs_per_prompt": 3,
    "trigger_threshold": 0.8
  },
  "evals": [
    {
      "id": 1,
      "prompt": "Write a commit message for what I have staged",
      "expected_output": "A conventional-commit subject plus a body explaining why",
      "files": ["evals/files/staged.diff"],
      "expectations": [
        "the subject uses a conventional-commit type prefix",
        "the subject is imperative and under 72 characters",
        "the body explains why, not what the diff already shows"
      ]
    }
  ],
  "triggers": [
    {
      "id": "explicit-1",
      "type": "explicit",
      "prompt": "use commit-helper on my staged changes",
      "should_trigger": true
    },
    {
      "id": "implicit-1",
      "type": "implicit",
      "prompt": "what should I call this commit?",
      "should_trigger": true
    },
    {
      "id": "contextual-1",
      "type": "contextual",
      "prompt": "ok that looks right, ship it",
      "should_trigger": true
    },
    {
      "id": "negative-1",
      "type": "negative",
      "prompt": "rewrite the last three commit messages with an interactive rebase",
      "should_trigger": false
    },
    {
      "id": "negative-2",
      "type": "negative",
      "prompt": "write release notes for v2.0",
      "should_trigger": false
    }
  ]
}
```

## What skillcheck checks

`skillcheck lint` runs these automatically when `evals/evals.json` exists; `skillcheck eval check <skill-dir>` runs them alone.

[SC401](rules.md#sc401) `evals-invalid` (error):

- the file is not valid JSON, or fails the schema (missing `skill_name`, an `expectations` array that is empty, a `trigger_threshold` outside 0..1, ...)
- `skill_name` does not match the skill's resolved name
- two `evals[]` entries share an `id`
- an `evals[].files` path does not exist relative to the skill root
- a `negative` trigger resolves to `should_trigger: true`

[SC402](rules.md#sc402) `evals-advisory` (warning):

- fewer than 2 negative triggers, when any triggers are defined at all

An absent `evals/evals.json` is not a finding. Evals are optional.

## Scaffolding

```bash
skillcheck eval init ./my-skill
```

Writes `evals/evals.json` with `runs_per_prompt: 3`, `trigger_threshold: 0.8`, one eval case and 13 trigger placeholders (3 explicit, 3 implicit, 3 contextual, 4 negative). Every value is marked `REPLACE`. The scaffold validates clean as written, so `eval init` followed by `lint` will not fail -- the placeholders are structurally valid, just useless until you fill them in.
