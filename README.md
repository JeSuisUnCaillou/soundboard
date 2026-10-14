# Soundboard

A sound-cue board for theatre, run from a folder of audio on your own machine.
Point it at the folder that holds the show's sound, lay the files out on a grid
of pads, and fire them by click, by key, or by hitting **Go** down the cue sheet.

No build step, no server, no account, and nothing is uploaded: the files are read
straight off the disk by the browser and never leave it.

![The board: a grid of coloured pads on the left, cue sheet on the right, Go bar along the bottom](docs/board.png)

## Running it

Open the hosted copy, or serve the folder yourself:

```sh
python3 -m http.server 8000     # then open http://localhost:8000
```

It has to be served over `http://localhost` or `https://` — opening
`index.html` from the file system will not work, because browsers only hand out
folder access and ES modules in a secure context.

## Browsers

| Browser | Opening a folder | Remembering it between launches |
| --- | --- | --- |
| Chrome, Edge, Opera (desktop and Android) | Folder picker, or drag the folder onto the window | Yes — one click to confirm on each launch |
| Firefox, Safari | Folder picker (file-by-file under the hood), or drag the folder onto the window | No — the board is remembered, the folder has to be picked again |

The difference is the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker),
which only Chromium browsers implement. Everywhere else the board falls back to
`<input type="file" webkitdirectory>`: everything works for the session, but the
browser refuses to hold a folder reference, so the folder is re-picked each time.
Pads, cues, fades and the rest are stored either way.

Audio formats are whatever the browser plays: MP3, M4A, AAC, WAV, FLAC, OGG/Opus,
and on Safari also AIFF.

## Using it

**Setting up.** Open a folder and the sounds are laid out in order to start with.
Switch on **Edit board** and the right-hand panel becomes the folder's contents:
drag a sound onto a pad, drag pads around to reorder, or click a pad to open its
settings. **Board setup** sets the grid size, the board name, and the fades new
pads start with.

**Each pad holds**: the file, a cue number, the name shown on the pad, a note for
the prompt book, one of eleven lighting-gel colours, its level, fade in and fade
out times, a loop switch, start and stop points to the hundredth of a second, a
keyboard key, and what a second tap does — fade it out, start it over, pause it,
layer another copy on top, or nothing at all. A pad can also be set to fade
everything else out when it starts, for a hard scene change.

**Running the show.** The cue sheet on the right lists the pads in playing order.
One cue stands by with a red light; **Go** fires it and the standby moves on, the
way a cue light works in the wings. Pads playing show a green light, a countdown,
and a travel bar along the bottom edge.

| Key | |
| --- | --- |
| `Space` | fire the standing-by cue |
| `↑` `↓` | move the standby through the cue sheet |
| pad keys | fire that pad (shown in the pad's bottom corner) |
| `Esc` | fade everything out |
| `Shift` `Esc` | cut everything dead |

**Carrying a board around.** Board setup saves the whole board as a JSON file and
loads one back. Pads refer to files by their path inside the folder, so a board
travels with its folder to another machine or another browser. A pad whose file
is missing is shown struck through rather than quietly dropped.

## How it is built

Static files, no dependencies, no build:

```
index.html        the shell
css/app.css       all of the styling
js/app.js         wiring: state, taps, keys, redraws
js/engine.js      Web Audio: one media element and gain node per pad
js/library.js     reading the folder, three ways
js/model.js       the board and its pads
js/store.js       IndexedDB: boards, folder handles
js/editor.js      the pad and board setup sheets
js/ui.js          drawing
js/gels.js        the eleven pad colours
```

Each pad keeps its own `<audio>` element wired through a gain node, created and
buffered when the pad is set up, so a tap starts the sound in a few milliseconds
rather than after a fetch. Fades are exponential ramps on the gain node, which is
why a fade out can be interrupted by a fade in without a click. Boards and folder
handles live in IndexedDB.

## What it does not do

No streaming services: this plays files you have. No recording, no editing, no
multi-output routing — everything goes to the system's default output.

## Credit

The shape of the thing is borrowed from [SQ Theatre Sound Cues](https://apps.apple.com/us/app/sq-theatre-sound-cues/id6654896521),
which does the same job as a native iOS app.
