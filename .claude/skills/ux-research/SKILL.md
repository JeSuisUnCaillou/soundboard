---
name: ux-research
description: Turns what operators met on the board (play-the-show feedback, issues, the owner's asks) into the needs behind them - observations, needs, insights with their confidence - and files one issue per need, folding the issues it explains into it. Triggers on "ux-research", "UX researcher", "synthesise the feedback", "what do operators need".
---

# ux-research

A complaint says what got in the way; an ask says what someone thought would
fix it. Neither is the need. You do what a UX researcher does with them:
take them apart into what was seen, put back together what belongs together,
ask why until you reach what the operator is trying to get done in a show,
and hand the owner a few needs worth deciding on instead of a pile of
tickets. One need answered well closes several complaints at once.

The method, and the texts it comes from, are in [`synthesis.md`](synthesis.md).

## The study

1. **Frame the question and gather the material.** Name what the study
   answers (the whole board, or one moment such as the interval). Gather
   every source on it: the play-the-show feedback files, the open and closed
   issues labelled `ux` or `bug`, the owner's asks in them. Read README.md and
   `docs/decisions.md` as the rules the board keeps on purpose. Done when the
   sources are listed at the top of the report, each with who played and on
   what.

2. **Look for enough participants.** One session is one operator: its
   findings are leads, not facts. With fewer than three sessions that differ
   in format, operator or device, run more with
   `Skill(skill: "play-the-show")`, each briefed on a show and an operator
   the others did not cover. Done when there are three, or the report says
   why not.

3. **Take everything apart into observations**, one per thing an operator
   did or met, as [`synthesis.md`](synthesis.md#observations) says: what
   happened, the evidence, the session, and apart from it what the operator
   asked for. Done when every finding of every source has its observations
   and no observation carries an opinion.

4. **Group them by need.** Sort the observations by the moment of the show
   and what the operator was trying to get done there, never by screen or
   feature. Name each group as a job story and ask why until it is about the
   show (see [`synthesis.md`](synthesis.md#needs)). Done when every
   observation sits under one need and no two needs would be met by the same
   change.

5. **Weigh each need**: the insight (why the board fails it today), how sure
   you are (how many sessions and operators met it), and how much it costs
   (frequency, impact, persistence, rated as
   [`synthesis.md`](synthesis.md#weighing) says). Check it against
   `docs/decisions.md`: a need a rule stands in the way of is a question for
   the owner, quoting the rule. Done when each need has its three and its
   question, if any.

6. **Write the report** in the file the caller named, else in your
   scratchpad, in the form of [`synthesis.md`](synthesis.md#the-report):
   the needs in order of what they cost, each with its job story, insight,
   confidence, observations, and two or three directions that would meet it,
   not a design. Done when the owner could choose the next work from it alone.

7. **File one issue per need and fold in the rest.** For each need worth the
   owner's decision, find the issues it explains: open one issue for the need
   (labels `ux` and `need`, made if the repository lacks them) that lists them,
   then close each one it wholly covers as a duplicate with a line pointing to
   it; an issue that holds a bug of its own stays open, linked. A need that
   matches an open need issue gets a comment with the new evidence instead. Done
   when no open `ux` issue is explained by another, and the report names each
   issue.

## What you return

The report, and in a few lines: the needs found in order, how sure the study
is of each, what was folded into what, and what the owner has to decide.

## Guardrails

- **The operator's words are evidence, not the answer.** An ask is kept as an
  observation of what they tried to get; the need is found behind it.
- **Confidence is said, never implied.** A need met by one operator in one
  session reads as a lead to confirm, however strong the screenshot.
- **Change no code and no doc**: the owner chooses what the needs become.
