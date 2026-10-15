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
| Changing columns in Board settings throws pads away or leaves sounds on the wrong pads | [#17](https://github.com/JeSuisUnCaillou/soundboard/issues/17) |
| Pressing Reconnect during a show cuts every sound dead | [#18](https://github.com/JeSuisUnCaillou/soundboard/issues/18) |
| Keeping copies of sounds can silently skip some | [#19](https://github.com/JeSuisUnCaillou/soundboard/issues/19) |
| Dropping several files or folders at once in Chromium adds only the first | [#20](https://github.com/JeSuisUnCaillou/soundboard/issues/20) |
| The service worker is slow on weak wifi and can cache error pages | [#21](https://github.com/JeSuisUnCaillou/soundboard/issues/21) |
| Sounds in the tree and pad settings cannot be reached from the keyboard | [#22](https://github.com/JeSuisUnCaillou/soundboard/issues/22) |
| Smaller fixes from the code review | [#23](https://github.com/JeSuisUnCaillou/soundboard/issues/23) |

## Test coverage

21 tests, each run at desktop and phone size, all green. Covered: the first
launch, tapping, Stop, Escape, the master volume, fade and second-tap edge
cases, stop points (also with the tab hidden), a pad stopped while it is still starting, held keys, a cross-origin sound, edit mode, renaming a pad
(with reload), emptying the board, adding sounds through the file input, and
coming back offline.

Not covered yet:

| Gap | Issue |
| --- | --- |
| Saving a board file and loading it back; missing files struck through | [#5](https://github.com/JeSuisUnCaillou/soundboard/issues/5) |
| Pad settings beyond the name (key, loop, second-tap modes, trims, solo, level, gel) and Board settings rows / columns | [#6](https://github.com/JeSuisUnCaillou/soundboard/issues/6) |
| Moving and removing pads by mouse and by finger | [#7](https://github.com/JeSuisUnCaillou/soundboard/issues/7) |
| Playback modes, Reconnect and the kept copies | [#24](https://github.com/JeSuisUnCaillou/soundboard/issues/24) |
| Dropping a folder on the window, the library filter, the waiting pad | none |

## Known loose ends

Not filed as issues yet; open one before working on any of them.

- Offline, the Google Fonts stylesheet is not available (the service worker
  only caches same-origin files), so the board falls back to system fonts.
- `sw.js` precaches `icon.svg` but not the PNG icons.
- Remote branches left from merged work (`ccr-*`, `claude/compassionate-gauss-*`,
  `claude/mobile-upload-bug-*`) can be deleted.
- `store.listBoards` / `deleteBoard` exist but there is no way to switch
  between boards in the UI. In practice the board is always `default-board`:
  a first launch creates it and stores it as the last board. Only when no
  board loads at all do `absorb` and `blankBoard` make one named after the
  first source.
