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

| Bug | Issue |
| --- | --- |
| Touching the master volume turns off every keyboard shortcut, Escape included | [#12](https://github.com/JeSuisUnCaillou/soundboard/issues/12) |
| Save board file ignores what was just typed in Board settings | [#45](https://github.com/JeSuisUnCaillou/soundboard/issues/45) |
| Smaller fixes from the code review | [#23](https://github.com/JeSuisUnCaillou/soundboard/issues/23) |

## Test coverage

50 tests, each run at desktop and phone size, all green. Covered: the first
launch, tapping, Stop, Escape, the master volume, fade and second-tap edge
cases, every second-tap mode, start and stop points (also with the tab
hidden), solo, a pad stopped while it is still starting, held keys and a pad's
own key, a cross-origin sound, edit mode, renaming a pad and its level, fades
and gel (with reload), Board settings rows and columns (columns and rows
changed at once too), shrinking the board, the waiting pad, emptying the
board, adding sounds through the file input, saving a board file and loading
it back (missing sounds struck through), dropping several sounds or folders
at once, Reconnect during a cue, keeping sounds added mid-copy and skipping
one that cannot be kept, coming back offline, opening on weak wifi, keeping a
good copy over a server error, asking no other site for anything, and setting
up a pad, hearing a sound and putting it on a pad from the keyboard.

Not covered yet:

| Gap | Issue |
| --- | --- |
| Moving and removing pads by mouse and by finger | [#7](https://github.com/JeSuisUnCaillou/soundboard/issues/7) |
| Playback modes, a refused Reconnect, and a browser out of room for the kept copies | [#24](https://github.com/JeSuisUnCaillou/soundboard/issues/24) |
| Dropping a folder on the window, the library filter | none |

## Known loose ends

Not filed as issues yet; open one before working on any of them.

- Remote branches left from merged work (`ccr-*`, `claude/compassionate-gauss-*`,
  `claude/mobile-upload-bug-*`) can be deleted.
- `store.listBoards` / `deleteBoard` exist but there is no way to switch
  between boards in the UI. In practice the board is always `default-board`:
  a first launch creates it and stores it as the last board. Only when no
  board loads at all do `absorb` and `blankBoard` make one named after the
  first source.
