# Harness — pass of 2026-10-15, periodic review

A pass on a request: Caillou asked in the project chat on 2026-10-15 13:55,
"once every 20 PRs, I think we can run a harness-engineer audit, and a full
codebase review for architecture". Issue #54.
Previous: [2026-10-15-harness-review-loop.md](2026-10-15-harness-review-loop.md).

Evidence read in this pass: the 14 PRs merged into `main` up to #50
(`list_pull_requests`), the open `harness` issues, `CLAUDE.md`, both skills,
`.claude/settings.json`, the workflows and `docs/deployment.md`.

## Impact of earlier passes

None due: the `Check:` issues of the earlier passes are dated 2026-10-22.

| Issue | Measure | Baseline | Result | Held / not held / not measurable |
| --- | --- | --- | --- | --- |

## Measures

| | This window | Previous |
| --- | --- | --- |
| PRs merged into `main`, all time | 14 (#1 to #50) | — |
| harness passes run without being asked | 0 of 2 | first |
| whole-codebase reviews in the repository | 0 (the one of 2026-10-15 lives outside it, in the project's files) | first |
| harness shape (`shape.py`): files over a threshold, description characters, duplicates | 0, 957 (was 675), 0 after | 0, 675, 0 |

## How it is done today, and what that costs

Both reviews happen when the owner thinks of asking. The two harness passes of
2026-10-15 were each asked for in the project chat; the whole-codebase review
of the same day was a one-off whose findings became #12 to #24. The
review-loop's architect reviewer sees one branch's diff, so drift spread over
several PRs (a module growing, a doc slowly wrong) is seen by no one.

Nothing in the repository can start a cloud session; a scheduled task in the
Claude project can, and the repository tells it what to do.

## Findings

### 1. Nothing notices that 20 PRs have been merged

**Pillar**: constraints
**Evidence**: the request; the two passes of 2026-10-15 both started from a
message.
**Remedy**: control — a weekly scheduled task in the Claude project, chosen
by the owner over a GitHub workflow (2026-10-15 14:05: "i don't want a github
workflow, i want a scheduled task"). Its prompt only points to `CLAUDE.md` §
Periodic review, which holds the count: PRs merged since the newest
`periodic-review` issue, or after #50 for the first. Counting from the last
issue rather than a modulo of the total means a week with more than 20 merges
is caught all the same; the review runs up to a week after the 20th merge.
**Expected impact**: `periodic-review` issues opened, against PRs merged —
baseline none, 2026-10-15 — expected one within a week of each 20th merge —
check when the 20th PR after #50 is merged — if not: read the scheduled
task's last runs for the count they found.
**Applied**: yes, the scheduled task "Periodic soundboard review" (Mondays
07:47 UTC) and commit "Count the merges from a scheduled task, not a workflow".

### 2. No skill reviews the whole codebase for architecture

**Pillar**: context
**Evidence**: the request; `.claude/skills/review-loop/reviewers.md` § architect
reviews `git diff origin/main...HEAD` only.
**Remedy**: write — `.claude/skills/architecture-review/`: two Sonnet
reviewers over `origin/main` (modules against `docs/architecture.md`; docs
and tests against the code), settled by the session, each confirmed finding
filed as an issue labelled `architecture`, the rejected ones kept in a comment
on the `periodic-review` issue so the next review does not raise them again.
It changes no code: the fixes are ordinary issues the owner orders. A new
skill costs its description on every turn (+282 characters, `shape.py`); it is paid for
by the request.
**Expected impact**: `architecture` issues filed by a review that were already
open or rejected before — baseline none, 2026-10-15 — expected 0 — check at
the second periodic review — if not: move the rejected lines into a file under
`.claude/reviews/`, read at step 2.
**Applied**: yes, commit "Add an architecture-review skill for the whole codebase".

### 3. A session that meets the issue has no rule for it

**Pillar**: context
**Evidence**: `CLAUDE.md` names neither review.
**Remedy**: write — `CLAUDE.md` § Periodic review: the count, the issue, the
two skills in order, how it closes. `CLAUDE.md` goes from 142 to 158 lines,
far under the 300 of `how-we-write.md`.
**Expected impact**: `periodic-review` issues closed with a harness PR and an
architecture comment linked — baseline none — expected every one — check at
the first periodic review — if not: write the steps into the scheduled task's
prompt itself.
**Applied**: yes, commit "CLAUDE.md: what to do with a periodic-review issue".

## Memories and project instructions brought home

| Source | To | Empty after merge |
| --- | --- | --- |

None: the request came from the chat and goes straight into the repository.

## Done outside the repository

The scheduled task "Periodic soundboard review", created on the owner's word
in the project thread: weekly, Mondays 07:47 UTC, a fresh session each time,
push notification on completion. It stores no connectors; the project's own
GitHub access is what its sessions use.

## What I could not check

- A real run of the scheduled task: the first is on 2026-10-19, and it should
  stop at the count (under 20 merges after #50).
