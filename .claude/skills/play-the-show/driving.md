# Driving the stage

Read at step 1. `scripts/stage.mjs` keeps one Chromium open between commands,
so a show is played a move at a time: act, look, decide.

## Contents

- The commands
- What `do` gives you
- Where things are on the screen
- The operator's library
- The moves of a show's life
- What the stage cannot do

## The commands

```sh
S=.claude/skills/play-the-show/scripts/stage.mjs
node $S open --fresh --out <dir>      # in the background; add --phone for a Pixel 7
node $S do "await pad('Storm').click(); await wait(2); return await ear()"
node $S close
```

`open` serves this checkout with `e2e/serve.js` on port 4174, stopped again
by `close`, and keeps the browser profile in `<dir>/profile`. Each `do`
prints what its code returns, what the board logged since the last command,
and the screenshot it took after: **read the screenshot**, it is your eyes.
Look before each move: the board remembers edit mode across a reload, so a
press of Edit board may take you out of it. A move that cannot be made fails
after five seconds. One stage holds one browser: to switch device, `close`,
then `open` again with or without `--phone`. Two stages play side by side
when each command of the second carries `STAGE_PORT=4190` (any free port
whose number less 6 is free too).

## What `do` gives you

| Name | What it is |
| --- | --- |
| `page`, `context` | Playwright's, for clicks, keys, a finger (`page.touchscreen`), downloads |
| `pad(title)` | a filled pad by the name it shows |
| `pick(paths)` | the files or the folder the next file dialog answers with |
| `ear()` | the loudest level reaching the speakers now, in dB; -100 is silence |
| `wait(seconds)` | the time a scene takes; a show has long ones |
| `note(text)` | a timed line in `<dir>/log.md` |

`ear()` reads a meter on everything the board sends to the speakers, so it
hears a fade (sample it a few times across the fade), a level (two pads
compared), solo (the others going down) and a cut (silence at once). It does
not tell sounds apart; the screen says which pads are playing.

## Where things are on the screen

Use what the operator sees: a pad's name, a button's text
(`page.getByRole('button', { name: 'Edit board' })`), a key. When a name is
ambiguous, the ids in `index.html` are a fallback: `#btnEdit`, `#btnAdd`
(Add files, then `#btnAddFolder` or `#btnAddFiles`), `#btnBrowse` and
`#btnBrowseDone` on a phone, `#libFilter`, `#btnSetup` (Board settings, with
`#btnExport` and `#btnImport`), `#btnEmpty`, `#btnStop`, `#master`, `#toast`.
A pad's pencil is the button named "Set up <name>".

## The operator's library

An operator brings their own sounds, with the names they came with.

- **The project's shared folder** may hold the troupe's real library as an
  archive: unpack it in `<dir>/library`, and add it as a folder, so its
  subfolders and odd names come along.
- **Made on the spot**, when there is none or the show needs more, with
  ffmpeg, under names an operator would have:

  ```sh
  ffmpeg -loglevel error -f lavfi -i "sine=frequency=880:duration=1.2" door-bell.mp3
  ffmpeg -loglevel error -f lavfi -i "anoisesrc=d=90:c=pink:a=0.3" rain-loop.mp3
  ffmpeg -loglevel error -f lavfi -i "sine=frequency=220:duration=200" "Act 2 - waltz.mp3"
  ```

  Under five seconds a sound is a hit, longer a cue (README). Vary the
  lengths and the loudness, and keep a broken one (`head -c 2000 /dev/urandom
  > cracked.mp3`): libraries have them.

## The moves of a show's life

| Moment | How |
| --- | --- |
| tap, key | `pad('Hero').click()`, `page.keyboard.press('x')` |
| a finger on a phone | `pad('Hero').tap()`; a drag through `page.touchscreen` |
| add sounds | `pick(path)`, then Add files, and Add a folder or Add sound files |
| save the board file | `const d = page.waitForEvent('download')`, click Save board file, `(await d).saveAs(path)` |
| load a board file | `pick(path)`, then Board settings and Load board file |
| the wifi goes | `context.setOffline(true)` |
| the next day | `close`, then `open` with the same `--out`, without `--fresh` |
| another machine | `close`, then `open --fresh` with another `--out` |
| the phone switches app | `page.evaluate` that sets `document.hidden` and dispatches `visibilitychange`, as `board.spec.js` does |

`page.evaluate` is for the world around the board, like the last row; never
for reading or changing the board's own state.

## What the stage cannot do

- The folder pickers of desktop Chrome cannot be answered: the stage deletes
  them, and the board offers its file dialog, as it does in Firefox or
  Safari. Reconnect is not reachable from here.
- The screen wake lock is granted by the stage; headless Chromium refuses it.
- It is Chromium only. What an iPhone does differently is said, not played.
