---
name: harness-engineer
description: Improves the soundboard's harness (CLAUDE.md, skills, team memory, project instructions) from what recent cloud sessions showed, measures the shape of its files and schedules a check of each change. Writes an audit, applies it on a branch, opens the PR, never merges. Triggers on "harness-engineer", "improve the harness", "review how Claude works on this repo", "move memories into the repo".
---

# harness-engineer

The harness is everything around the model: the files an agent reads before it
acts, the limits it is given, the checks that correct it afterwards. The model
does not change from one session to the next; **the harness does, and it is the
only lever we hold**. When an agent makes the same mistake twice, the harness
has a defect, not the agent ([Fowler](https://martinfowler.com/articles/exploring-gen-ai/harness-engineering.html)).

You reread the harness in the light of what happened: start from what the
sessions produced, name the defect, fix it where it will be read, and measure
so the next pass knows whether it helped. You review what made the code get
written, not the code, and a bug in the board goes to its own issue. The method
comes from the texts in [`references.md`](references.md).

## Where this runs

Every session on this repository is a **Claude Code cloud session driven from
the mobile app**, in a container cloned fresh and thrown away afterwards.

- **Only what is pushed, filed or remembered survives.** The audit is committed
  on the branch, follow-ups are GitHub issues labelled `harness`, lessons about
  the conversation go to team memory.
- **Past sessions are not on disk.** They are read with the remote-session
  tools, project threads with the project tools ([`evidence.md`](evidence.md)).
  GitHub is reached with the GitHub MCP tools, never `gh`.
- **The user reviews on a phone.** The PR description is where they accept or
  refuse each change, so it stands on its own; the thread reply stays short.
- **There is no local machine to configure**: no status line, no
  `~/.claude/CLAUDE.md`, no `CLAUDE.local.md`. What the container needs at start
  belongs to the environment's setup script or a SessionStart hook.

## The harness, piece by piece

What decides where a fact goes is **when each file is read**. A rule in a skill
does not exist for a session that does not invoke it; a rule in `CLAUDE.md`
costs on every turn of every session.

| Piece | Read when |
| --- | --- |
| [`CLAUDE.md`](../../../CLAUDE.md): conventions for all work on the repository | every session, in full |
| [`.claude/skills/*/SKILL.md`](../): one way of doing one thing | on invocation; siblings when a step names them |
| `.claude/settings.json`: hooks and permissions the harness runs itself | every session on a clone |
| the project instructions, in the Claude project's settings; their text is in a project session's own system prompt | every session started from the project |
| team memory, `MEMORY.md` as its index, at the path the system prompt gives | the index every session, a file when relevant |
| [`e2e/`](../../../e2e/) and [`.github/workflows/`](../../../.github/workflows/): checks after the fact | every pull request and deploy |

## The three questions

The three pillars of [harnessengineering.academy](https://harnessengineering.academy/blog/what-is-harness-engineering-introduction-2026/),
asked of each defect. A defect almost always has one answer, and it names the
remedy.

1. **Context: did the agent have the right thing in front of it when it needed
   it?** The remedy is to *move* or *shorten*, rarely to write more.
2. **Constraints: what does the prose forbid that nothing prevents?** A rule
   broken twice despite its prose needs a control after the action (a test, a
   failing check), not one more sentence before it.
3. **Entropy: what stopped being true?** A path gone, a file named two ways, a
   memory citing a removed rule, an anecdote whose defect is fixed.

## Input

**With nothing**: the retrospective pass, over the window since the last audit
(the newest `.claude/audits/*-harness*.md` on `origin/main`), else seven days,
else what you are given. A pass cut before its PR is not resumed: its branch is
dropped and yours starts again from the evidence. Like any work here, the pass
first finds or opens its issue, "Harness pass YYYY-MM-DD".

**With a request**, a capability the harness lacks: the request is the evidence
of the need. Look for how the thing is done today and what that costs, what the
request contradicts in the harness (to rewrite, not to patch with an
exception), what would make it go wrong, and the baseline to measure. "A new
rule needs two occurrences" does not hold against an explicit request, but
holds for what you would be tempted to add next to it.

## The pass

1. **Impact of earlier passes.** For each open `harness` issue whose check date
   is due, run its measure, write the result (*held*, *not held*, *not
   measurable*) on the issue and in the audit's first table, and close it if it
   held. *Not held* is a finding of this pass, remedied by the issue's fallback
   or a control; *not measurable* twice closes it as not planned.
2. **Inventory and shape.** `python3 .claude/skills/harness-engineer/scripts/shape.py --since <window start>`,
   then `--duplicates`. A `!` is a finding, context pillar. Thresholds in
   [`how-we-write.md`](how-we-write.md), other measures in
   [`measures.md`](measures.md).
3. **Gather the evidence** of the window with [`evidence.md`](evidence.md):
   sessions, threads, PRs, issues, CI runs, team memory, project instructions.
   Note each fact with its exact source before interpreting it.
4. **Diagnose.** The three questions, then **one** remedy: *write*, *move*,
   *shorten*, *control*, *correct*, *merge*, *remove*, *bring home* (a memory or
   project instruction into a versioned file), *measure*. Where it goes:
   [`where-each-fact-goes.md`](where-each-fact-goes.md). **A new rule needs two
   occurrences**, or one that cost a PR; one brought home needs none.
5. **Write the audit** in `.claude/audits/YYYY-MM-DD-harness.md`
   (`-harness-<topic>.md` for a request) **as the pass's first commit**, in
   the format of [`audit-template.md`](audit-template.md); a *measure* finding
   lives in that commit. Every applied finding carries its **expected impact**:
   measure, dated baseline, threshold, check date, fallback.
6. **Apply** on the session's branch, one commit per finding, following
   [`how-we-write.md`](how-we-write.md); to split a file,
   [`splitting-a-file.md`](splitting-a-file.md). Applied without asking:
   entropy, moves, cuts, and **every memory and project instruction the
   repository does not already say**, brought home into a skill or `CLAUDE.md`.
   Proposed, not written: removing a rule, `.claude/settings.json`, a
   SessionStart hook, the setup script, a change to the project instructions.
7. **Check.** Replay the failure: at the turn where the defect happened, would
   the changed file have been loaded, with the rule high enough to be read? Run
   every command written or changed in the harness both ways, condition true and
   false. Then [`measures.md` § Controls](measures.md#controls), and the whole
   e2e suite if the pass touched `e2e/`.
8. **Push and open the PR** against `main` with the GitHub MCP tools, closing
   the pass's issue (`Closes #n`). Its description has one line per finding,
   with its evidence and its commit, so each can be judged from the phone. The
   merge waits for the user.
9. **File what can only be done later** as `harness` issues: **one
   `Check: <topic>` issue per applied finding**, with the query that gives the
   measure, the baseline, the threshold, the check date (a week after the pass
   unless the measure needs more sessions) and the fallback; a
   memory to empty after the merge; a check this window could not make. If the
   user wants a check to run by itself, offer a one-shot scheduled task on its
   date and create it only on their word.

## What you return

A short reply in the thread pointing to the PR: findings applied and proposed,
the two or three that change the most, one line of expected impact per applied
finding, the memories to empty after the merge. The rest is in the audit and
the PR; what remains after the merge is an issue, not a sentence.

## Guardrails

- **No finding without evidence gathered in this pass.** What you could not
  open goes under "What I could not check".
- **Touch neither the app, nor the README, nor issues other than the pass's
  own.** You write under `.claude/`, in `CLAUDE.md` and in team memory; in
  `e2e/` only when a finding's remedy is a test, with the suite green.
- **Fix in place, move sections, cut; do not rewrite the sentences.** A split
  proves every paragraph has a fate ([`splitting-a-file.md`](splitting-a-file.md)).
  Removing a rule is proposed, with what you searched and over which period.
- **A memory is emptied only after the merge**, once its content is on `main`,
  by editing it down to one line pointing to the versioned file, never by
  deleting it outright; the project instructions, by proposing the same cut.
- **Read sessions by filtered pages; your context holds only the evidence.**
  A session is hundreds of events; ask only for the kinds you need.
