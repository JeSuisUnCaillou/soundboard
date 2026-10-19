---
name: review-loop
description: Reviews a pushed branch with two fresh reviewer agents, fixes what they confirm, and goes round until a pass finds nothing blocking. Started by the Stop hook once a branch's work is pushed. Triggers on "review-loop", "review this branch until it is clean", "review and fix this PR".
---

# review-loop

`review → fix → review…` on a branch whose work is committed and pushed, until
a pass confirms nothing blocking. Two fresh reviewers see the change without
your reasons for it; the fixes stay with you, since you hold the context. Fast
beats thorough-looking: two reviewers, one pass in the common case, three at
most.

## When it runs

The `Stop` hook (`.claude/hooks/review-gate.sh`) refuses to end a turn on a
pushed branch that differs from `main` and has no pass recorded for its
current head, and names this skill. Run it before the reply that hands the
work over, so the hook has nothing to stop. The branch's PR is open first
(`CLAUDE.md`).

The diff is always the whole branch, `git diff origin/main...HEAD` after
`git fetch -q origin main`. The review file is `.claude/reviews/<branch>.md`,
every `/` of the branch name turned into `-`; each pass appends to it.

## The loop

1. **Launch the two reviewers** of [`reviewers.md`](reviewers.md) in
   parallel, with the Agent tool, `subagent_type: "general-purpose"`,
   `model: "sonnet"`, in the foreground.

2. **Settle each finding yourself.** Read the code it cites, confirm or
   reject it, classify it with [`blocking.md`](blocking.md).
   - Confirmed: fix it the most mechanical way, one commit per group.
   - False positive: leave the code, one line on why.
   - It takes a choice the user owns (a rule of `docs/decisions.md`, a
     behaviour the README does not settle): fix nothing for it, and leave it
     to the user in the reply.

3. **Write the pass** into the review file under `# Pass n`: the head
   reviewed, then one line per finding with its fate (fixed in `<sha>`,
   rejected because…, left to the user). A pass with no finding says so.

4. **Run the e2e suite** (`npm run test:e2e`) if a fix touched code, and push.

5. **Go round again only if a blocking finding was fixed.** From the second
   pass, give the reviewers the rejected lines so far. If a blocking finding
   comes back where an earlier fix should have closed it, or a third pass
   still finds one, stop fixing at the site: find the rule it breaks where it
   is owned (README, `docs/decisions.md`), fix that, or leave it to the user.

6. **Close the file**: append `Reviewed head: <full sha of HEAD>` as the last
   line, commit the review file alone (`git show HEAD --stat`), push. The hook
   reads that line; a branch unchanged since it outside `.claude/reviews/`
   needs no new pass.

7. **Ship everything but a feature.** A PR ships by itself once the loop
   converged with nothing left to the user, unless it is a medium-to-big
   feature: one that gives the operator something new to do or see (a
   control, a setting, a mode, a screen), changes the stored format, or
   changes a rule of `docs/decisions.md`. Bug fixes, tests, docs, the
   harness and small touches to an existing feature (a word, a default, a
   colour) ship. In doubt, it is a feature and waits. To ship, watch the PR
   (`subscribe_pr_activity`), and on its CI-green event merge it with
   `merge_pull_request`, squash, and `expectedHeadSha` set to the commit that
   closed the review file, so a commit pushed after the review is never
   merged unreviewed. A PR that conflicts with `main` gets no CI run on a new
   push, so no green event comes: before waiting, read its mergeable state
   (`pull_request_read`), and if it conflicts, merge `main` in, run the suite
   and push. Chosen by the user on 2026-10-15: "The only thing I
   want to review are medium-big features."

8. **Weigh the leftovers.** List what the work leaves open: questions you
   asked yourself or the user and did not settle, tasks you put off, edge
   cases a reviewer raised that this PR does not cover, findings you rejected
   as out of scope but real. Drop what no longer matters, and say why in a
   few words; open an issue for each of the others, unless one already
   exists (search first), saying what and why and linking the PR.

## What you return

In the reply that hands the work over: shipped or waiting for the user and
why, how many passes and what they fixed in a line, what was left to the
user, the issues step 8 opened, and a link to the review file. Add the same
line to the PR description.

## Guardrails

- **Both reviewers run at every pass, on the whole branch.** Reviewing only
  the last fixes misses what the first pass missed.
- **A finding is blocking on cited code**, never on an agent's summary.
- **"Verified" is said only of what you saw fail and then pass**: for a fix
  of behaviour, undo it, see its test go red, put it back.
- **Reviewers change nothing**: their prompt forbids every write, `git stash`
  and `git checkout` included, since you fix in the same checkout.
