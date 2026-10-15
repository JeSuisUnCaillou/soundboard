# Status

Where the board stands, at a glance. Work itself is tracked in
[GitHub issues](https://github.com/JeSuisUnCaillou/soundboard/issues), not
here: this file says what exists and where the gaps are, and links to the
issue that carries each gap. Update it when a gap opens or closes.

_Last reviewed: 2026-10-15._

## What works

Everything the [README](../README.md) describes is built and live: the default
board, adding folders and files by picker or drop, the library tree with
filter, auto-placement, pad settings (name, gel, level, fades, loop, trims,
key, second tap, solo), board settings (size, default fades, save and load a
board file), moving and removing pads by mouse and by finger, Stop / Space /
Escape, the master volume, kept copies and Reconnect, offline through the
service worker, install as an app, and the screen wake lock.

## Test coverage

16 tests, each run at desktop and phone size, all green. Covered: the first
launch, tapping, Stop, Escape, the master volume, fade and second-tap edge
cases, stop points, held keys, a cross-origin sound, edit mode, renaming a pad
(with reload), emptying the board, adding sounds through the file input, and
coming back offline.

Not covered yet:

| Gap | Issue |
| --- | --- |
| Saving a board file and loading it back; missing files struck through | [#5](https://github.com/JeSuisUnCaillou/soundboard/issues/5) |
| Pad settings beyond the name (key, loop, second-tap modes, trims, solo, level, gel) and Board settings rows / columns | [#6](https://github.com/JeSuisUnCaillou/soundboard/issues/6) |
| Moving and removing pads by mouse and by finger | [#7](https://github.com/JeSuisUnCaillou/soundboard/issues/7) |
| Reconnect and stored handles (cannot be driven from a test) | none |
| Dropping a folder on the window, the library filter, the waiting pad | none |

## Known loose ends

- Sounds no longer lay themselves out on the board, except the bundled ones on
  a first launch. `App.absorb` in `js/app.js` still places up to `AUTO_PLACE`
  (10) added sounds when the board has no filled pad, which only happens after
  **Empty the board**.
- Offline, the Google Fonts stylesheet is not available (the service worker
  only caches same-origin files), so the board falls back to system fonts.
- `sw.js` precaches `icon.svg` but not the PNG icons.
- Remote branches left from merged work (`ccr-*`, `claude/compassionate-gauss-*`,
  `claude/mobile-upload-bug-*`) can be deleted.
- `store.listBoards` / `deleteBoard` exist but there is no way to switch
  between boards in the UI: the board in use is the one keyed by the first
  folder opened, or `default-board`.
