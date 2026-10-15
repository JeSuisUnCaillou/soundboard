# Harness — pass of 2026-10-15, review loop

A pass on a request: Caillou asked in the project chat on 2026-10-15 for "a
review-loop that triggers automatically after an implementation is over", like
numerique-gouv/oots-france `.claude/skills/review-loop`. Issue #39.
Previous: [2026-10-15-harness.md](2026-10-15-harness.md).

Evidence read in this pass: the six PRs merged on 2026-10-15 and the two open
ones (`list_pull_requests`), the reviews and comments of #26 and #27
(`pull_request_read`), the open issues, the oots-france skill (`SKILL.md` and
its five siblings, read as reference) and its `.claude/settings.json`.

## Impact of earlier passes

None due: the `Check:` issues #28 to #34 of the previous pass are dated
2026-10-22.

| Issue | Measure | Baseline | Result | Held / not held / not measurable |
| --- | --- | --- | --- | --- |

## Measures

| | This window | Previous |
| --- | --- | --- |
| PRs merged with a review on record | 1 of 6 (#27, review posted 5 seconds before the merge) | first |
| PRs keeping what a review found or rejected | 0 of 6 | first |
| harness shape (`shape.py`): files over a threshold, description characters, duplicates | 0, 393, 0 before; see Controls | 0, 393, 0 |
| open `harness` issues at window end | 9 (#28 to #36) | 0 |

## How it is done today, and what that costs

A review happens when a session thinks of it: the project instructions let
Claude merge a small fix "once the PR has been reviewed at least once (e.g. a
/review sub-agent)". On 2026-10-15, #27 got one review comment, written by the
session that merged it five seconds later; #26, #3, #4, #9 and #11 were merged
with none. Nothing records what a review rejected, so the next one cannot
learn it, and nothing makes the review happen.

oots-france runs its loop from another skill (`ship-plan`) at a fixed step, on
a local machine, with reviewer agents from the `pr-review-toolkit` plugin. None
of the three exists here: work starts from the mobile app as a free-form
request, there is no plugin in the cloud container, and the project's thread
sessions get no slash command. The trigger therefore has to be something the
harness runs itself.

## Findings

### 1. No skill says how to review a branch until it is clean

**Pillar**: context
**Evidence**: the request; `.claude/skills/` holds only `harness-engineer`;
the reviews and comments of #26 (none) and #27 (one, unrecorded).
**Remedy**: write — `.claude/skills/review-loop/`, adapted from oots-france
and made lighter at the user's request ("a fast and efficient review-loop",
2026-10-15 13:20): two fresh Sonnet reviewers (bugs, and an architect standing in for
`layered-rails`, briefed on `docs/architecture.md`) on the whole diff
each pass, fixes by the author, another pass only after a blocking fix, three
passes at most, a review file per branch that carries the rejected findings to
the next pass. Dropped from the model: the plugin agents, the reviewer set
chosen per pass, the separate non-convergence guide, the history rewrite (PRs
here are squash-merged), the notification mute and the background CI skill.
**Expected impact**: PRs merged after this one whose branch carries a
`.claude/reviews/<branch>.md` with at least one pass — baseline 0 of 6,
2026-10-15 — expected every PR opened from a cloud session — check on
2026-10-22 — if not: read the sessions of the PRs without one and find whether
the trigger (finding 2) fired.
**Applied**: yes, commit "Add a review-loop skill that reviews a branch until a pass finds nothing blocking".

### 2. Nothing starts a review when an implementation is done

**Pillar**: constraints
**Evidence**: 5 of 6 PRs merged on 2026-10-15 without a review, although the
project instructions name one as the condition for Claude to merge. A sentence
already exists; it does not make the review happen.
**Remedy**: control — a `Stop` hook in `.claude/settings.json`
(`.claude/hooks/review-gate.sh`). When a session is about to end its turn on a
branch whose work is committed and pushed, differs from `main`, and has no
review pass recorded for its current head, the hook refuses the stop and tells
the session to run `Skill(skill: "review-loop")`. It lets the turn end when the
hook has already refused once in that turn, so it can never loop. Project
settings are read by every session on a clone, threads included.
**Expected impact**: same measure as finding 1, plus sessions where the hook
refused a stop and no pass followed — baseline: no hook, 2026-10-15 — expected
0 — check on 2026-10-22 — if not: if the hook did not run in thread sessions,
move the trigger to the project instructions and say so to the user; if it ran
and was ignored, put the skill call in the hook's reason as the only sentence.
**Applied**: yes, commit "Start the review loop by itself once a branch's work is pushed". The skill's own rules list `.claude/settings.json` as proposed, not written; it is written here because the user asked for the trigger itself, and the merge is theirs.

### 3. `CLAUDE.md` hands a PR over without a word about reviewing it

**Pillar**: context
**Evidence**: `CLAUDE.md` § "Open a pull request for every branch" and §
"Hand over a link to try it" end the work at the push and the link.
**Remedy**: write — one sentence in § "Open a pull request for every branch"
pointing to the skill, so a session runs the loop before its reply rather than
after the hook stops it. The rules stay in the skill, loaded on invocation.
**Expected impact**: thread replies announcing a PR as ready before its review
file exists, in sessions after the merge — baseline not measured (no loop
existed) — expected 0 — check on 2026-10-22 — if not: rely on the hook alone
and take the sentence out.
**Applied**: yes, commit "CLAUDE.md: review a branch before handing it over".

## Memories brought home

| Memory | To | Empty after merge |
| --- | --- | --- |

None.

## Proposed outside the repository

The project instructions say a small fix may be merged "once the PR has been
reviewed at least once (e.g. a /review sub-agent)". Once this is merged, that
example could read "(the review loop has converged on it)". The user edits it
in the project's settings.

## What I could not check

- Whether the hook runs in a thread session that starts from a clone already
  holding it. It did run in this pass's own thread session, which picked the
  new `.claude/settings.json` up mid-session and refused two stops on this
  branch before its review was recorded.
- The cost of a pass. oots-france measured its own in its audits; ours will be
  read from `external_metadata.usage.cost_usd` at the next pass.
