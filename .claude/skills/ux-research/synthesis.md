# Synthesis

Read at steps 3 to 7. How the material becomes needs, and where each move
comes from.

## Contents

- Observations
- Needs
- Weighing
- The report
- The need issue
- Where the method comes from

## Observations

An observation is one thing an operator did or met, small enough to be
moved on its own (a "nugget" in atomic research):

```
O12 · match d'impro · laptop · the interval
Saw: took a row off the board; five set-up pads went to Sounds; Done gave no warning.
Evidence: regisseur-2026-10-16/day1/shrink.png
Asked for: an undo, or a warning before Done.
```

- **What was seen and what was asked are two lines.** "There should be an
  undo" is an ask; "five set-up pads went without a word" is what was seen.
- **Several findings may make one observation**, when two sessions met the
  same thing; it then lists both sessions, which is what confidence counts.
- **One finding may make several**, when it holds two things met at once.
- What a session liked is an observation too: it says what a change must
  keep.

## Needs

Group the observations by the moment of the show (preparing, rehearsing,
the show, the interval, the next show, another venue) and, inside it, by
what the operator was trying to get done. Name each group as a job story:

> **When** I change the board between shows, **I want** what I set up to
> stay where I put it, **so that** the show I rehearsed is the show I play.

- **Ask why until it is about the show.** "I want an undo" → why? "Because
  Done threw my pads away" → why does it matter? "Because I set the board up
  for tonight and have no time to do it again." The need is the last answer,
  not the first.
- **A need names no control.** "I want a warning dialog" is a solution;
  "I want to know what a change will cost before it is made" is a need.
- **The test of a good group**: the observations under it would all be
  answered by meeting it, and none of them by meeting another.
- Things that look alike may be different needs: two phone layout troubles,
  one about seeing every pad mid-show and one about setting a pad up, sit
  under the show and under preparing.

## Weighing

**Confidence**, from the observations under the need:

| Confidence | When |
| --- | --- |
| high | met by three or more sessions, or by two operators of a different kind |
| medium | met by two sessions, or several times in one |
| low (a lead) | met once |

**Cost**, Nielsen's three factors read for a show, then a rating:

- *Frequency*: how many operators and shows meet it.
- *Impact*: what it costs when met: a show stopped, a cue late, a setup
  slowed, an irritation.
- *Persistence*: once, or every show.

| Rating | Meaning here |
| --- | --- |
| 4 | can stop a show or lose a rehearsed board |
| 3 | delays a cue, or costs an evening of setup |
| 2 | slows the setup, or is worked around each time |
| 1 | cosmetic, or met once and learnt |

A rating made alone is unreliable: give your reason in a line, so the owner
can disagree with it.

## The report

```markdown
# UX study: <question>, <date>

<Five lines: what was studied, with whom, the needs in order, what the owner
must decide.>

## Sources

| Session | Show | Operator | Device |

## Needs

### N1 · <the job story, in short> · cost 4 · confidence high

**When** …, **I want** …, **so that** ….

**Insight:** why the board fails it today, in two sentences.
**Seen:** O3, O12, O17 (the observations, one line each, with sessions).
**Rule in the way:** the line of docs/decisions.md, or none.
**Directions:** two or three ways to meet it, each in a sentence.
**Issues:** #n (folded in), #m (bug, linked).

## What works and must stay

## Observations

<All of them, numbered, as in "Observations" above.>
```

## The need issue

Title: the need in the operator's words, not a control ("Changing the board
between shows keeps what was set up"). Body: the job story; the insight; how
sure the study is and why; the observations with their evidence; the rule of
`docs/decisions.md` in the way, quoted, if any; the directions; the issues it
folds in; a link to the report. End with the attribution footer every GitHub
post carries.

Closing an issue the need covers: a comment saying which need it is now part
of and that its evidence moved there, then close it as a duplicate of the
need issue.

## Where the method comes from

- Atomic research: observations ("nuggets") with evidence, combined into
  findings whose confidence grows with each one
  ([Dovetail](https://dovetail.com/blog/atomic-research)).
- Affinity mapping: observations grouped by similarity, each group named,
  then ranked by frequency and severity.
- Job stories: situation, motivation, outcome, solution-agnostic
  ([24 ways](https://24ways.org/2017/jobs-to-be-done-in-your-ux-toolbox/)).
- Severity from frequency, impact and persistence, on a 0 to 4 scale; one
  evaluator's rating alone is unreliable
  ([course notes on Nielsen's scale](https://grouplab.cpsc.ucalgary.ca/saul/681/1997/kevin/severity.html)).
- About five participants a round find most problems, and several small
  rounds beat one large one
  ([MeasuringU](https://measuringu.com/?p=187)).
