# Architecture

How the board is put together: what each file owns, how a sound gets from the
disk to the speakers, and what is remembered between launches. Read it before
changing code. Words in *italics* are defined in [glossary.md](glossary.md);
why things are the way they are is in [decisions.md](decisions.md).

## The files

| File | Owns |
| --- | --- |
| `index.html` | The shell: the rail, the grid, the *book*, the transport, and the three `<dialog>` sheets (`#picker`, `#padEditor`, `#setup`). Every element the code or a test finds has an `id` here. |
| `css/app.css` | All styling. BEM-ish classes (`pad--playing`, `lib__item--used`). Layout breakpoints at 900px (*narrow*: the book opens over the board) and 560px, and `pointer: coarse` for touch. |
| `js/app.js` | The `App` class: owns the open board and the edit state, wires every event (taps, keys, drags, drops, pickers), saves, restores, keeps the screen awake. The only module that decides things. |
| `js/engine.js` | `Engine`: Web Audio. One *channel* per pad, extra *voices* for layering and previews, fades, the per-frame `tick()`. Also `probeDuration()`. |
| `js/library.js` | `Library`: every sound the board can reach, from every *source*, keyed by path. Folder walking, pickers, drops, dedup, blob URLs. |
| `js/model.js` | The board and pad data: `newBoard`, `newPad`, `migrate`, resizing, keys, `applyLengthDefaults`, formatting helpers. Pure functions, no DOM. |
| `js/store.js` | `store` (IndexedDB) and `prefs` (localStorage). |
| `js/editor.js` | `PadEditor` (the pad sheet) and `SetupSheet` (Board settings). Read fields, validate, hand the result back to `App` through callbacks. |
| `js/ui.js` | Drawing only: `drawGrid`, `paintPads` (per frame), `drawLibrary` (the tree), `drawStop`, `setPanel`, `setBook`, `toast`, `say`. Decides nothing. |
| `js/gels.js` | The eleven *gels* and `DEFAULT_GEL`. |
| `js/bundled.js` | The *bundled sounds* list and the `default/` path prefix. |
| `sw.js` | The service worker: network first, cache as fallback. |
| `sounds/` | The bundled sound files. |
| `manifest.webmanifest`, `icon*` | Install metadata. |
| `e2e/` | The test suite, see [testing.md](testing.md). |
| `.github/workflows/` | `e2e.yml` (tests on every PR) and `pages.yml` (tests, then deploy `main`), see [deployment.md](deployment.md). |

Dependencies point one way: `app.js` imports everything; `editor.js` imports
`ui.js` and `model.js`; `ui.js` imports `model.js`, `gels.js`, `store.js`;
`engine.js` and `library.js` know nothing of the DOM beyond creating `Audio`
elements and pickers. Keep it that way: a new decision goes in `app.js`, a new
drawing in `ui.js`.

## Data model

A board, as stored and as exported (`model.js`, `BOARD_VERSION = 3`):

```js
{
  version: 3,
  id: 'default-board',          // slug of the first source's name
  cols: 3, rows: 3,             // 1..12 each (MAX_COLS, MAX_ROWS)
  master: 0.8,                  // 0..1
  defaults: { fadeIn: 1, fadeOut: 1.5 },   // seconds, for new pads
  pads: [pad | null, ...],      // exactly cols * rows long; index = row * cols + col
}
```

A pad:

| Field | Default | Meaning |
| --- | --- | --- |
| `file` | path | The library path it plays, e.g. `default/gunshot.mp3`, `Show/Act 1/rain.wav`. |
| `name` | pretty file name | What the pad shows; empty means the file's pretty name (`padTitle`). Max 40 chars. |
| `gel` | `daylight` | Colour id from `gels.js`. |
| `gain` | 1 | Pad level 0..1. |
| `fadeIn`, `fadeOut` | board defaults | Seconds, 0..120. |
| `loop` | false | Loop until stopped. |
| `trimStart`, `trimEnd` | 0, null | Start and stop points in seconds; `trimEnd` must be after `trimStart` or it is `null`. |
| `tap` | `fadeout` | *Second tap*: `fadeout`, `restart`, `pause`, `overlay`, `ignore`. |
| `solo` | false | Fade everything else out when this starts. |
| `key` | from position | One lowercase character; unique on the board. |
| `duration` | 0 | Measured length in seconds; 0 until measured. |

**Changing the format.** Add the field in `newPad` (its default) and in
`migratePad` (read and clamp it from a stored or imported board), then in the
pad sheet (`index.html` + `PadEditor.open` / `save`). Bump `BOARD_VERSION` only
when an old value has to be *reinterpreted* (as version 2 did for the old
default gel); `migrate` already fills in anything missing. `migrate` is the only
door into the app for a board from storage or from a file, so never trust a
board that has not been through it.

**Size is fixed.** `fitPads` pads or truncates `pads` to `cols * rows`; nothing
grows a board. Shrinking returns how many filled pads fell off, and the app
toasts it. Changing `cols` re-wraps the same array, so pads keep their order,
not their row and column.

**Keys** default from the pad's position on a keyboard-shaped grid (`KEY_ROWS`:
`1..=`, `q..]`, `a..\`, `z..#`), skipping keys already taken. Saving a key that
another pad holds takes it from that pad (`PadEditor.save`).

**Length decides the kind** (`applyLengthDefaults`): under `SHORT_SOUND` (5 s)
a sound is a *hit* (tap set to `overlay`, fade in 0); otherwise a *cue* (gel
`moss`). Only fields still at their untouched default move, and only once the
length is known. It runs when a pad is made (`App.padFor`), when a pad is given
a new sound by drag and drop, and when `measure()` finds pads with no duration.

## Where sounds come from (`library.js`)

The library is additive: sources are added, never swapped. Each entry is
`{ path, name, dir, src, ...one of handle | file | url }`.

| Source kind | How it arrives | Backed by | Survives a reload? |
| --- | --- | --- | --- |
| `bundled` | Always, at boot (`addBundled`) | `url: sounds/<file>` | Yes, it is part of the app. Path prefix `default/`. |
| `dir` / `file` with `handle` | `showDirectoryPicker` / `showOpenFilePicker` / a drop with `getAsFileSystemHandle` (desktop Chromium) | `FileSystemHandle` | The handle is stored; permission usually must be granted again (*Reconnect*). |
| `dir` / `files` without handle | `<input type=file>` (with `webkitdirectory` for a folder), or a drop via `webkitGetAsEntry` | `File` | No; only through the *kept copies*. |
| `cache` | At restore, from IndexedDB (`addCached`) | `File` made from the stored blob | Yes. |

Paths include the folder's own name (`Show/cue.wav`) so the tree shows it.
Folders are walked to depth 6, skipping dotfiles, `__MACOSX` and
`node_modules`; only names matching the `AUDIO` regex count.

`_merge` folds new entries in: the same sound found again is skipped (same
handle via `isSameEntry`, or same name + size + mtime); a real file arriving for
a path held as a copy replaces the copy in place; a *different* sound with a
clashing path gets `name (2).ext`. A pad therefore never silently changes sound.

`url(path)` gives what an `<audio>` can play: the bundled URL, or a blob URL
made once per path and revoked on `reset()`.

## Playing (`engine.js`)

```
<audio> ─ MediaElementSource ─ GainNode (pad) ─┐
<audio> ─ MediaElementSource ─ GainNode (pad) ─┼─ GainNode (master) ─ destination
<audio> ─ ... extras (layers, previews)  ──────┘
```

- **Channel**: one per pad index, created on `prime()` and kept with its file
  buffered, so a tap is immediate. `channels: Map<i, channel>`.
- **Extras**: throwaway voices for `overlay` taps and for previews (channel
  `PREVIEW = -1`), dropped when they end. `extras: Set`.
- **Voice state**: `idle` → `starting` → `playing` ⇄ `paused` → `idle`. Two
  flags matter: `released` (someone told it to stop; it may still be fading)
  and `fading` (a gain ramp to silence is under way, which may be the pad's own
  fade towards its stop point, *not* a release).
- `live(i)` = active voices that are not `released`. It is the single source
  of truth for "is this pad playing" — the pad's look, the Stop button, Stop and
  Space, and what a tap does all read it. A tap on a pad with nothing live
  starts it, even if a released voice is still fading out.
- `fire(i, pad)` implements the *second tap* modes. `start()` handles `solo`,
  seeks to `trimStart`, sets the gain to the floor or the level, plays, and
  ramps in.
- Fades are `exponentialRampToValueAtTime` on the gain node towards `FLOOR`
  (0.0001), never on `el.volume`. `_stopVoice` ramps and then `settle()`s on a
  timer: pause, rewind to `trimStart`, back to `idle` (or dropped, for extras).
- `tick()` runs every animation frame while anything plays (`App.run`): it
  honours `trimEnd` (loop back or stop), starts the fade out early enough to
  land on the stop point, and loops from `trimStart`.
- `reset()` tears down every element. The app calls it whenever paths may now
  point at different blobs (reconnect, moves, resizing, import, empty).
- iOS: `wake()` on the first gesture nudges every primed element to play and
  pause at silence, so each answers its first tap.
- `voiceElement()` sets `crossOrigin = 'anonymous'`: a media element from
  another origin plays as silence in the graph unless fetched with CORS.

## The app (`app.js`)

**Boot**: bind refs, build the sheets, read `prefs` (edit mode, book open),
wire events, add the bundled sounds, then `restore()`:

1. No `last` board in `meta` → `firstBoard()`: the *Default board* with the
   bundled sounds on it.
2. Otherwise load and `migrate` the board, add its kept copies, `absorb([])`.
3. Stored handles all `granted` → `reconnect()` silently. Some not → show
   **Reconnect** (pads already play from copies) or, if nothing at all can
   play, open the picker with **Reopen**.

**Adding sounds** always ends in `absorb(added)`: create a board if there is
none (id = slug of the first source), auto-place up to `AUTO_PLACE` (10) sounds
*only if the board was empty*, store handles, save, `primeAll()` (first 48
pads), `measure()` (three at a time), `keepAwake()`, `keepSounds()`, toast.

**Editing**: `setEditing(on)` toggles `body[data-editing]` and the book. In edit
mode a click on a filled pad still fires it (a listen), a click on a sound in
the tree previews it, the pencil (or shift-click) opens the pad
sheet, a click on an empty pad makes it the *waiting pad* for the next **+**.
Pads move by pointer events (`wirePadDragging`): a mouse drags after 6 px; a
finger after resting 400 ms. Dropping on another pad swaps them (`model.move`);
dropping on `#book` or `#browse` takes the pad off. Sounds dragged from the tree
use HTML5 drag and drop with the `application/x-soundboard-path` type.

**Saving**: `queueSave()` debounces 500 ms; `saveNow()` on structural changes
and `beforeunload`. `keepSounds()` copies every loaded sound (pads first) into
IndexedDB, skipping bundled ones and unchanged ones, deleting copies of sounds
no longer loaded; on `QuotaExceededError` it stops trying for the session.

**Keys** (`onKey`): ignored in an open dialog, in a field, or with a modifier.
Space = `stop()` (each live pad on its own fade out); Escape = cut all; a pad
key fires that pad, ignoring auto-repeat.

## What is remembered

| Where | Key | What |
| --- | --- | --- |
| IndexedDB `soundboard` v2, store `boards` | board `id` | The board object. |
| store `handles` | board `id` | Array of `FileSystemHandle`s for its sources. |
| store `sounds` | `` `${boardId}\n${path}` `` | `{ boardId, path, name, size, lastModified, blob }`, the *kept copies*. |
| store `meta` | `last`, `cols`, `rows` | Last open board id; last board size chosen (new boards start at it). |
| localStorage `soundboard:ui` | `editing`, `book`, `filter`, `openDirs` | Where the operator was, applied before the first draw. |

Only one board is in use at a time. `store.listBoards` and `deleteBoard` exist
but nothing in the UI switches boards.

## Offline (`sw.js`)

Network first with `cache: 'no-cache'`, falling back to the cache, falling back
to `index.html`. Same-origin GETs only, so the Google Fonts stylesheet is not
cached and the board falls back to system fonts offline. The `SHELL` list is
precached on install.

> [!IMPORTANT]
> A new file the app loads (a module, a bundled sound) must be added to `SHELL`
> in `sw.js`, or the board breaks offline for anyone who has not loaded it
> online since. Bump `CACHE` when removing or renaming shell files, so old
> copies are cleared.

## Recipes

- **New pad setting**: `model.js` (`newPad`, `migratePad`), `index.html` (field
  in `#padEditor`), `editor.js` (`open` fills it, `save` reads it), `engine.js`
  if it changes playback, a test in `e2e/edit.spec.js` or `board.spec.js`.
- **New board setting**: `model.js` (`newBoard`, `migrate`), `index.html`
  (`#setup`), `SetupSheet.open` / `apply`, `App.applySetup`.
- **New bundled sound**: file in `sounds/`, name in `BUNDLED` (`bundled.js`),
  path in `SHELL` (`sw.js`), and update `BUNDLED_TITLES` in `e2e/helpers.js`
  (the first-launch tests count them).
- **New JS module**: import it from where it belongs and add it to `SHELL`.
- **New element the code needs**: give it an `id` in `index.html` and add the
  id to `bindRefs` in `ui.js` (or `el(id)` in `editor.js`).
- **New user-facing message**: `toast()` for what the operator should read,
  `say()` for the screen reader's live region. Wording rules are in
  [decisions.md](decisions.md#voice).
