# Soundboard

A sound-cue board for theatre, run from a folder of audio on your own machine.
Point it at the folder that holds the show's sound, lay the files out on a grid
of pads, and fire them by click or by key.

No build step, no server, no account, and nothing is uploaded: the files are read
straight off the disk by the browser and never leave it.

![The board on a laptop: a grid of coloured pads, Stop and what is playing along the bottom](docs/board.png)

<img src="docs/phone.png" alt="The same board on a phone: two columns of pads, Stop and the master fader underneath" width="300">

## Running it

It is live at **https://jesuisuncaillou.github.io/soundboard/** — or serve the
folder yourself:

```sh
python3 -m http.server 8000     # then open http://localhost:8000
```

It has to be served over `http://localhost` or `https://` — opening
`index.html` from the file system will not work, because browsers only hand out
folder access and ES modules in a secure context.

## Installing it

The board is a progressive web app: **Install** it from the browser menu (Chrome
and Edge offer it in the address bar; on iOS, Share → Add to Home Screen) and it
runs in its own window, works with the network off, and — on Chrome and Edge —
can hold on to permission for the show's folder instead of asking at every
launch. Without installing, the folder is a single click away each time the page
is loaded: the browser, not the board, is what insists on asking.

## Browsers

| Browser | Choosing the sounds | Remembering the folder between launches |
| --- | --- | --- |
| Chrome, Edge, Opera on the desktop | Folder picker, or drag the folder onto the window | Yes — one click to confirm on each launch |
| Firefox and Safari on the desktop | Folder picker, or drag the folder onto the window | No |
| Chrome on Android | Folder picker | No |
| Safari on iPhone and iPad | **Choose sound files** — iOS has no folder picker | No |

The difference is the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker),
which only desktop Chromium browsers implement. Everywhere else the board falls
back to `<input type="file" webkitdirectory>`, or on iOS to picking the sounds
themselves: everything works for the session, but the browser will not hold on to
a folder, so it is chosen again on the next launch. The board itself — pads,
cues, colours, fades — is remembered either way, and finds its files again by
name as soon as the folder is reopened.

Audio formats are whatever the browser plays: MP3, M4A, AAC, WAV, FLAC, OGG/Opus,
and on Safari also AIFF.

## Using it

**Setting up.** Open a folder and the sounds are laid out in order to start with.
**Edit board** keeps the board in front of you and opens the folder's contents
beside it: tap a sound to put it on the next free pad, or drag one onto a
particular pad. Each pad grows a grip in its corner — drag that to move the pad,
with a mouse or a finger. Clicking a pad opens its settings, which show the pad
as it will look while you type. **Board setup** sets how many columns the board
has; the pads wrap into as many rows as they need and the board scrolls, so
nothing is ever pushed off it.

**Each pad holds**: the file, a cue number, the name shown on the pad, a note
under it, one of eleven lighting-gel colours, its level, fade in and fade
out times, a loop switch, start and stop points to the hundredth of a second, a
keyboard key, and what a second tap does — fade it out, start it over, pause it,
layer another copy on top, or nothing at all. A pad can also be set to fade
everything else out when it starts, for a hard scene change.

**Running the show.** Tap a pad to fire it. A pad that is playing shows a green
light, a countdown, and a travel bar along its bottom edge, and the transport
lists what is running against the clock. The red **Stop** button takes everything
playing out, each sound on its own fade; `Esc` cuts the lot dead the moment you
hit it.

| Key | |
| --- | --- |
| pad keys | fire that pad, from the key shown in its corner |
| `Space` | stop what is playing, fading it out |
| `Esc` | cut everything dead |

**On a tablet or a phone.** The board is the whole screen, and it keeps the shape
you gave it: a six-column board is six columns wide everywhere, scrolling rather
than rearranging itself under the operator. While editing, the folder's sounds
slide over the pads from the **Sounds** button and get out of the way again as
soon as one lands. Pads are moved by their grip, which works the same under a
finger as under a mouse; a pad's row and column can also be typed into its
settings. The screen is kept awake while a board is open.

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
js/library.js     reading the folder, four ways
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
