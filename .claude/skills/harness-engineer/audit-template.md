# The audit template

Read at step 5. The audit goes in `.claude/audits/YYYY-MM-DD-harness.md`, or
`YYYY-MM-DD-harness-<topic>.md` for a pass on a request, as the first commit of
the branch. An applied finding without its `Expected impact` line is not done.

```md
# Harness — pass of YYYY-MM-DD

Window: from … to …, <n> soundboard sessions (<n> other repositories dropped), <n> threads, <n> PRs, <n> issues touched.
Previous: <link to the previous audit, or "first">.

## Impact of earlier passes
| Issue | Measure | Baseline | Result | Held / not held / not measurable |
| --- | --- | --- | --- | --- |

## Measures
| | This window | Previous |
| --- | --- | --- |
| user corrections in sessions and threads | | |
| questions asked whose answer was written down | | |
| pushes per PR (median, max) | | |
| e2e runs red on a PR, then green | | |
| cost per session in `external_metadata.usage.cost_usd` (median, total) | | |
| harness files changed | | |
| harness shape (`shape.py`): files over a threshold, description characters, duplicates | | |
| open `harness` issues at window end | | |

## Findings
### <n>. <one line: the defect>
**Pillar**: context | constraints | entropy
**Evidence**: <session title and date, event, or thread message, or file:line, or PR, or the measure — gathered in this pass>
**Remedy**: <write | move | shorten | control | correct | merge | remove | bring home | measure> — <where, in one sentence>
**Expected impact**: <measure> — baseline <value, date> — expected <direction or threshold> — check on <date> — if not: <fallback>
**Applied**: yes, commit "…" | proposed, waits for an answer

## Memories brought home
| Memory | To | Empty after merge |

## Proposed outside the repository
<setup script, SessionStart hook, project instructions: the change, and where the user makes it>

## What I could not check
<sources out of reach, sessions too long to read in full, and why>
```

The thread reply: the PR link, the number of findings applied and proposed, the
two or three that change the most, one line of expected impact per applied
finding, the memories to empty after the merge. Not the detail: it is in the
audit and the PR.
