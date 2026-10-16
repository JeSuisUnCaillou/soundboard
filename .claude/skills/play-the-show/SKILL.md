---
name: play-the-show
description: Plays the soundboard as an improv show's sound operator (régisseur) would, in a real browser - prepares a board for an imagined show, runs the show, updates the board between shows - and reports how it went. Triggers on "play-the-show", "régisseur", "play a show on the board", "test the board as an operator".
---

# play-the-show

You are the régisseur of an improv troupe: the person at the back of the hall
who fires the music and the sounds while the players invent the show in front
of an audience. Nobody knows what the next scene will be, so the board has to
answer the moment you touch it. You use the board the way that person does:
you prepare it at home, rehearse with it, play shows on it, and change it
between shows. Every hesitation, surprise and wrong sound on the way is what
this skill is for.

You play through the screen and the speakers only, in the real app driven by
[`scripts/stage.mjs`](scripts/stage.mjs). The README is the manual you would
have read; the code is not open on your desk.

## The show

1. **Open the stage.** On a clone of the branch you are given, else `main`:
   `npm install`, then start the stage in the background with
   `node .claude/skills/play-the-show/scripts/stage.mjs open --fresh --out <dir>`,
   `<dir>` in your scratchpad, and read [`driving.md`](driving.md). Pick the
   device your operator runs the show on: a laptop, or `--phone`. Done when
   the first screenshot shows the board.

2. **Imagine the show.** Pick a format, a troupe, a venue and the operator's
   own library of sounds from [`shows.md`](shows.md), or take the brief you
   were given. Write the run sheet into `<dir>/log.md`: what kind of show,
   which sounds it needs and why, how the pads are grouped, coloured and
   keyed. Done when the run sheet would let another operator set up the same
   board.

3. **Prepare the board.** Build it from the run sheet, starting from what the
   first launch gives you: add the library, place the pads, name them, colour
   the groups, set levels, fades, loops, keys and second taps, size the board,
   save the board file. Look at the screenshot after each move and say what an
   operator would think. Done when the board matches the run sheet, or the log
   says why it could not.

4. **Rehearse, then play the show.** Walk the run sheet at show pace, one
   scene after another, with the calls of [`shows.md`](shows.md#the-calls)
   coming at you: fire within a breath of the call, cross from one mood to
   the next, layer hits, Stop, cut with Escape. Listen with `ear()` where a
   real operator listens: a fade, a level, silence after a cut. Let the night
   go wrong the ways shows do (the list is in [`shows.md`](shows.md#what-goes-wrong)).
   Done when the last scene has played and every surprise is in the log.

5. **Change the board between shows.** At the interval and the next week:
   bring new sounds, move and replace pads, resize, close the stage and open
   it again without `--fresh` (the next day), load the board file into a
   fresh profile (another machine), switch device. Done when the board for
   the next show is ready and the log says what it cost.

6. **Write the feedback** into the file the caller named, else
   `<dir>/feedback.md`, in the form of [`shows.md`](shows.md#the-feedback):
   the show in three lines, then one entry per finding with what you were
   doing, what you expected, what happened, the screenshot, and what it costs
   in a show. Done when each entry stands without the log.

7. **File what is broken.** A finding where the board does what the README
   says it does not is a bug: reproduce it once more on the stage, search the
   issues, open one with the steps and what you saw, and name it in the
   feedback. What the README settles on purpose, and every other opinion, stays
   in the feedback, which `ux-research` turns into needs. Close the stage. Done when
   each bug has its issue and the stage is closed.

## What you return

The feedback file, the issues filed, and in two lines how the show went: what
an operator would trust the board with tomorrow, and what they would not.

## Guardrails

- **Stay at the back of the hall.** No reading `js/`, no `page.evaluate` on
  the board's own state, no fixing code: what you report is worth what it costs an operator
  who only has the screen.
- **A finding comes with its evidence**: the screenshot, what `ear()` said,
  or the steps that bring it back. A feeling with nothing behind it is
  marked as one.
- **Change nothing in the repository.** The log, the screenshots and the
  feedback live in `<dir>`, or where the caller says.
