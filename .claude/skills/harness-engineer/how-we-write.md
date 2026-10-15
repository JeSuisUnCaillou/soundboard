# How we write in the harness

Read at step 2 for its thresholds, and at step 6 before writing a line in a
skill or in `CLAUDE.md`. These files are read by people and by agents that do
not have the context they were written in.

## Contents

- The shape of a skill
- The thresholds, and what they protect
- What the repository already fixes
- Writing for a phone
- `CLAUDE.md`

## The shape of a skill

What [`writing-for-agents`](https://github.com/mattpocock/skills/blob/main/skills/productivity/writing-for-agents/SKILL.md)
and [Anthropic's guide](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
name, applied here:

- **`SKILL.md` carries what every run reads, and nothing else**: the role in a
  few lines, the steps in order, each ending on what says it is done, at most
  five guardrails.
- **Reference goes in a sibling file, read at the step that needs it**, named at
  that step by its relative path, in `.claude/skills/<name>/`. **One level
  only**: a sibling does not link another sibling, since a second-level link
  tends to be read partially. A sibling over 100 lines opens on `## Contents`.
- **A move two skills make is a skill both call**, with `Skill(skill: "…")`
  written at the step: naming the tool gets the call, a `/name` in prose does
  not ([invocation.md](https://github.com/mattpocock/skills/blob/main/.agents/invocation.md)).
  A new skill is paid for by a description loaded on every turn: create one
  only with two callers on record.
- **The description is a pointer, not a summary**: what the skill does in a
  sentence, then its triggers. The contract is in the body, loaded on
  invocation only.
- **Keep model invocation on.** In this project the user asks the project chat
  for work and a thread session does it; a skill marked
  `disable-model-invocation: true` can only be started by a `/name` typed in
  the session itself, which a thread session never receives. Keep the
  description short instead.
- **One anecdote per rule, the most telling, dated, with what it cost**:
  "seen on 2026-10-15 in PR #3" beats an adverb. The audits keep the rest. An
  anecdote whose defect has since been fixed comes out.
- **A figure lives in the audit that measured it.** A skill that needs an order
  of magnitude points to the audit; a copied figure becomes a wrong rule. No
  threshold in percent: a threshold reads on the value the tool returns.
- **No no-ops**, a rule the model already follows by default pays its line for
  nothing; **no negation of a positive already written**, "do not do X" makes
  X more present. A guardrail parries a move the model makes readily and that
  no positive rule covers.

## The thresholds, and what they protect

`scripts/shape.py` applies them; a `!` is a finding.

| Threshold | Value | What it protects |
| --- | --- | --- |
| lines of a `SKILL.md` | 150 (never more than 200) | that a rule at step 9 weighs as much as at step 1 |
| characters of a description | 400 (the documented limit is 1,024) | every turn of every session, where all of them are loaded |
| guardrails | 5 | that they stay read |
| contents of a sibling | from 100 lines | that a partial read sees all it holds |
| duplicated paragraphs (`--duplicates`) | 0 | that a fact has one place |

## What the repository already fixes

- **English only**, in every file, commit and PR, whatever the language of the
  conversation (`CLAUDE.md`).
- **Prose wrapped at 80 columns**, as in the README and `CLAUDE.md`.
- **Plain words.** Say the thing rather than its image: "a pad that is
  playing", not "an active node".
- **A heading says what must be true**, not what is forbidden; forbidden moves
  have their section, "Guardrails", and only that one.
- **An abstract rule lists its cases.** "Whenever a reader could do more" does
  not read; "the symmetric case of a rule, the rest of a section, the optional
  fields of a format" does.
- **Nothing personal or environmental in a versioned file**: no container path,
  no memory folder path, no session id, no token. What a skill expects of the
  environment it names or derives.
- **One piece of information, one place.** A fact two files must mention: one
  carries it, the other links to it in one line.

## Writing for a phone

The user reviews on the mobile app and on GitHub's mobile site.

- **A PR description stands on its own**: one line per finding with its
  evidence and its commit, so it can be judged without opening a file.
- **A thread reply fits on one screen.** The detail is in the audit; the reply
  links to the PR.
- **Tables stay narrow**: three columns at most in what the user reads (the
  audit's tables are for the next pass, not for the phone).
- **A choice for the user is one question with short options**, answerable
  with one tap or one word.

## `CLAUDE.md`

**`CLAUDE.md` is read in full on every turn.**
[HumanLayer](https://www.humanlayer.dev/blog/writing-a-good-claude-md) advises
under 300 lines, and ours is far below: keep it that way. Adding to it means
taking as much out, or pointing to a skill that loads only on invocation.
