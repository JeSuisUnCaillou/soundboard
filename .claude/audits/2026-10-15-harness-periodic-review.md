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
| harness shape (`shape.py`): files over a threshold, description characters, duplicates | 0, 675, 0 before; see the PR | 0, 675, 0 |

## How it is done today, and what that costs

Both reviews happen when the owner thinks of asking. The two harness passes of
2026-10-15 were each asked for in the project chat; the whole-codebase review
of the same day was a one-off whose findings became #12 to #24. The
review-loop's architect reviewer sees one branch's diff, so drift spread over
several PRs (a module growing, a doc slowly wrong) is seen by no one.

Nothing in the repository can start a cloud session. What it can do is notice
the 20th merge and leave a notice where sessions and the owner look: an issue.

## Findings

### 1. Nothing notices that 20 PRs have been merged

**Pillar**: constraints
**Evidence**: the request; `.github/workflows/` holds only `e2e.yml` and
`pages.yml`; the two passes of 2026-10-15 both started from a message.
**Remedy**: control — `.github/workflows/periodic-review.yml`, on every merge
into `main`: counts the PRs merged since the newest `periodic-review` issue
was opened (or since 2026-10-15 14:00 UTC, after #50, for the first), and at
20, with none open, opens one assigned to the owner. Counting from the last
issue rather than a modulo of the total means a missed run is caught by the
next merge.
**Expected impact**: `periodic-review` issues opened, against PRs merged —
baseline none, 2026-10-15 — expected one per 20 merges — check when the 20th
PR after #50 is merged — if not: read the workflow's runs (`actions_list`,
`periodic-review.yml`) for the count it printed.
**Applied**: yes, commit "Open a periodic-review issue every 20 merged pull requests".

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
skill costs its description on every turn (+~300 characters); it is paid for
by the request.
**Expected impact**: `architecture` issues filed by a review that were already
open or rejected before — baseline none, 2026-10-15 — expected 0 — check at
the second periodic review — if not: move the rejected lines into a file under
`.claude/reviews/`, read at step 2.
**Applied**: yes, commit "Add an architecture-review skill for the whole codebase".

### 3. A session that meets the issue has no rule for it

**Pillar**: context
**Evidence**: `CLAUDE.md` names neither review.
**Remedy**: write — `CLAUDE.md` § Periodic review: what opens the issue, the
two skills to run in order, how it closes. Eight lines; `CLAUDE.md` goes from
142 to about 155, far under the 300 of `how-we-write.md`.
**Expected impact**: `periodic-review` issues closed with a harness PR and an
architecture comment linked — baseline none — expected every one — check at
the first periodic review — if not: put the two steps in the issue body itself,
which the workflow writes.
**Applied**: yes, commit "CLAUDE.md: what to do with a periodic-review issue".

## Memories and project instructions brought home

| Source | To | Empty after merge |
| --- | --- | --- |

None: the request came from the chat and goes straight into the repository.

## Proposed outside the repository

A scheduled routine that checks once a week for an open `periodic-review`
issue and, when there is one, starts a session that runs it. Without it, the
issue waits for the owner (notified by the assignment) to ask a session to take
it up. Created only on the owner's word.

## What I could not check

- The workflow on GitHub itself: it runs on merges into `main`, so its first
  real run is after this PR is merged. Its commands were run here against the
  live repository with the REST API, both ways (count under 20, count forced
  over with an earlier start).
