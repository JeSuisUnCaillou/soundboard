---
name: review-loop
description: Reviews a pushed branch with fresh reviewer agents, fixes what they confirm and goes round again until a pass finds nothing blocking, keeping a review file on the branch. Started by the Stop hook once a branch's work is pushed. Triggers on "review-loop", "review this branch until it is clean", "review and fix this PR".
---

# review-loop

`code → review → fix → review → fix…` on a branch whose implementation is
committed and pushed, until a pass confirms no blocking finding. The reviewers
are fresh agents, so they see the change without the reasons you had for it;
the fixes stay with you, since you hold the context.

## When it runs

The `Stop` hook (`.claude/hooks/review-gate.sh`) refuses to let a session end
its turn on a pushed branch that differs from `main` and has no pass recorded
for its current head, and names this skill. Run it before your reply announces
the work as ready, so the hook has nothing to stop. It also runs on request,
on the current branch or a PR's branch checked out.

## Input

The current branch. The diff under review is always
`git diff origin/main...HEAD`, after `git fetch -q origin main`: the whole
branch, never only the last pass's fixes.

The review file is `.claude/reviews/<branch>.md`, with every `/` of the branch
name turned into `-`. One file per branch; each pass appends to it.

## The loop

Repeat while the last pass confirmed at least one **blocking** finding. A pass:

1. **Compose the reviewers** from [`reviewers.md`](reviewers.md), on the
   evidence of `git diff --name-only origin/main...HEAD`, never from memory of
   what you just fixed. Launch them **in parallel**, each with the Agent tool,
   `subagent_type: "general-purpose"`, `model: "sonnet"`, and the prompt that
   file gives. Combine their answers into one list.

2. **Write the pass into the review file** as soon as the findings are in,
   before fixing anything, under `# Pass n`: the head reviewed, the reviewers
   launched and the condition that brought each in, then the findings. A pass
   with no finding still gets its section, saying so.

3. **Settle each finding yourself**, most severe first. Read the code it cites,
   confirm or reject it on what the code does, and classify it with
   [`blocking.md`](blocking.md).
   - Confirmed, blocking or not: fix it as `blocking.md` says, one commit per
     coherent group. Only a blocking one forces another pass.
   - False positive: leave the code; one line on why under `## Rejected` in
     this pass. The next pass's reviewers receive that list.
   - Ambiguous, or it takes a design choice the user owns (a rule of
     `docs/decisions.md`, a product behaviour the README does not settle): stop
     and ask, with `ask_decision` in a project thread.
   - Close to a finding of an earlier pass: read
     [`not-converging.md`](not-converging.md) before fixing it.

4. **Run the whole e2e suite** (`npm run test:e2e`) if a fix touched anything
   but text, and push. A CI result that has already arrived for the branch
   (a PR event) counts: red is a blocking finding of this pass. Do not wait for
   CI here; the session watching the PR handles what comes later.

5. **Decide.** A blocking finding confirmed in this pass: go back to step 1,
   unless [`not-converging.md`](not-converging.md) says to stop. None: go to
   step 6.

6. **Close the file.** Append, as the last line of the last pass:

   ```
   Reviewed head: <full sha of HEAD>
   ```

   where HEAD is the last commit carrying a fix, then commit the review file
   alone and push. The hook reads that line: a branch whose files have not
   changed since that commit, outside `.claude/reviews/`, needs no new pass.
   Check `git show HEAD --stat` lists only the review file before you push.

## What you return

In the reply that hands the work over: how many passes, what they changed in
a line each, what was rejected or left to the user, and a link to the review
file on the branch. The PR description gains one line pointing to it.

## Guardrails

- **A pass launches at least two reviewers.** A smaller pass is a bug of this
  skill, never a saving; when a full pass no longer fits, stop the loop with
  the branch pushed and the findings written down, and say so.
- **The diff is the whole branch at every pass.** Reviewing only the last
  fixes shrinks the reviewer set pass after pass and misses what the first pass
  missed.
- **A finding is blocking on cited code**, never on an agent's summary, a
  comment or a doc.
- **"Verified" is said only of what you saw fail and then pass**
  ([`blocking.md`](blocking.md) § Fixing a finding).
- **Reviewers change nothing**: their prompt forbids every write, `git stash`
  and `git checkout` included, since you fix in the same checkout while they
  read.
