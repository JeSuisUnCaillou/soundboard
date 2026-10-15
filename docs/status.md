# Status

Where the board stands, at a glance. Work itself is tracked in
[GitHub issues](https://github.com/JeSuisUnCaillou/soundboard/issues), not
here: this file says what exists and where the gaps are, and links to the
issue that carries each gap. Update it when a gap opens or closes.

_Last reviewed: 2026-10-15._

## What works

Everything the [README](../README.md) describes is built and live, apart from
the known bugs below: the default board on a first launch, adding folders and
files by picker or drop, the library tree with filter, pad settings (name, gel,
level, fades, loop, trims, key, second tap, solo), board settings (size,
default fades, save and load a board file), moving and removing pads by mouse
and by finger, Stop / Space / Escape, the master volume, kept copies and
Reconnect, offline through the service worker, install as an app, and the
screen wake lock.

## Known bugs

None open.

## Test coverage

86 tests, all green: each runs at desktop and phone size, except the 9 drag
tests, which run by mouse on desktop or by finger on phone. Covered: the first
launch and its improv board, the default board loaded back onto an empty board,
a board file with the crickets' old name, tapping, Stop, Escape, the master
volume, fade and second-tap edge cases, every second-tap mode, layering, both
kinds of loop, start and stop points (also with the tab hidden), solo, a pad
stopped while it is still starting, held keys, a pad's own key, keys after a
button or the volume has the focus, a cross-origin sound, edit mode, renaming a
pad and its level, fades and gel (with reload), Board settings rows and columns
(both at once too), shrinking the board, the waiting pad, emptying the board,
adding sounds through the file input, hearing a sound from the tree, the filter,
saving a board file and loading it back (missing sounds struck through),
dropping several sounds or folders at once, the kept copies after a reload and
offline, Reconnect (also refused, and during a cue), a browser out of room for
the copies, keeping sounds added mid-copy and skipping one that cannot be kept,
moving pads and taking them off by mouse and by finger, a tap on a pad under a
toast, dragging a sound from the tree onto a pad and a pad set up before its
sound is open, a browser whose storage refuses or fails once, saving when the
page is hidden, a change kept when the page goes without a word, clearing an
abandoned board, the screen wake lock, a picker dismissed without a word, coming
back offline, opening on weak wifi, keeping a good copy over a server error,
asking no other site for anything, and setting up a pad, hearing a sound and
putting it on a pad from the keyboard.

Not covered yet: nothing known beyond the suite's limits in
[testing.md](testing.md#limits) (Chromium only, audio not listened to).

## Known loose ends

Not filed as issues yet; open one before working on any of them.

- Remote branches left from merged work (`ccr-*`, `claude/compassionate-gauss-*`,
  `claude/mobile-upload-bug-*`) can be deleted.
- There is no way to switch between boards in the UI (see
  [architecture.md](architecture.md#what-is-remembered)). In practice the board is always `default-board`:
  a first launch creates it and stores it as the last board. Only when no
  board loads at all do `absorb` and `blankBoard` make one named after the
  first source.
