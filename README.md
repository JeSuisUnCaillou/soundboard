# Soundboard

A sound-cue board for theatre, run from the audio on your own machine. Point it
at the folder that holds the show's sound — or at a handful of files, and more
of them whenever you like — lay them out on a grid of pads, and fire them by
click or by key.

No build step, no server, no account, and nothing is uploaded: the files are read
straight off the disk by the browser and never leave it.

![The board on a laptop: a grid of coloured pads, Stop and what is playing along the bottom](docs/board.png)

<img src="docs/phone.png" alt="The same board on a phone: the pads filling the screen, Stop and the volume underneath" width="300">

![Edit mode: the board on the left with a drag grip on each pad, the folder's tree of sounds on the right showing which cue each one is on](docs/edit.png)

## Running it

It is live at **https://jesuisuncaillou.github.io/soundboard/** — or serve the
folder yourself:

```sh
python3 -m http.server 8000     # then open http://localhost:8000
```

It has to be served over `http://localhost` or `https://` — opening
`index.html` from the file system will not work, because browsers only hand out
folder access and ES modules in a secure context.

## Coming back to it

Reload the page and nothing has changed: the same board, the whole folder in the
tree, the same folders open, still in edit mode if that is where you were. Every
sound that has been loaded is kept inside the browser — not only the ones on
pads — so nothing has to be picked again and no permission has to be granted.
That holds in every browser, with the network off, and on a phone.

Where the browser allows it — Chrome, Edge and Opera on the desktop — the board
also keeps a handle on the places the sounds came from, and goes back to the real
files on disk when it can, so a file edited between rehearsals is the file that
plays. If the browser wants permission again, a **Reconnect** button appears next
to the folder's name; until it is used the board plays from its own copies, so
nothing stops a show.

Those copies are the reason the board installs well. **Install** it from the
browser menu (Chrome and Edge offer it in the address bar; on iOS, Share → Add to
Home Screen) and it runs in its own window, offline, and can hold on to folder
permission instead of asking at every launch.

To clear the copies, clear the site's data in the browser. A sound that is no
longer loaded has its copy dropped on the next change.

## Browsers

| Browser | Adding sounds | Going back to the files on disk |
| --- | --- | --- |
| Chrome, Edge, Opera on the desktop | A folder or single files, by picker or dropped on the window | Yes |
| Firefox and Safari on the desktop | A folder or single files, by picker or dropped on the window | No — the board plays its own copies |
| Chrome on Android | A folder, or single files | No — the board plays its own copies |
| Safari on iPhone and iPad | Single files — iOS has no folder picker | No — the board plays its own copies |

The difference is the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker),
which only desktop Chromium browsers implement. It is what lets a folder be
reopened as a folder; everywhere else the browser hands over a snapshot of files
and nothing that outlives the session, which is what the kept copies are for.

Audio formats are whatever the browser plays: MP3, M4A, AAC, WAV, FLAC, OGG/Opus,
and on Safari also AIFF.

## Using it

**Setting up.** **Add files** takes a whole folder or a few sounds at a time,
subfolders and all, and whatever arrives joins what is already open — so a board
can be built from several places and added to mid-rehearsal. A sound already on
the board is recognised and left where it is.

On an empty board the first ten lay themselves out, so there is something to look
at; after that the board is yours and anything added waits in **Sounds**, the
folder's own tree, which opens beside the board in edit mode. Adding a folder
never moves a pad you have set.

While editing, a tap is a listen: a sound in the tree plays where it is, and so
does a pad, so a cue can be checked before and after it goes on the board. The
**+** beside a sound puts it on the next free pad and the pencil on a pad opens
its settings — where **Hear it** auditions a file before the pad is committed to
it. With a mouse the whole pad is a handle: press anywhere below the pencil and
move, and the pad comes with you; press and release without moving and it just
plays. Under a finger the dots in the corner do the dragging, so a touch that
lands on a pad is still free to scroll the board. Dragging a pad onto the sounds
panel takes it off the board, leaving the sound where it is. There is no limit on how many sounds a board holds. **Empty the
board** clears the pads without touching the sounds, and asks twice.
**Edit board** keeps the board in front of you and opens the folder's contents
beside it: tap a sound to put it on the next free pad, or drag one onto a
particular pad. Each pad grows a grip in its corner — drag that to move the pad,
with a mouse or a finger. Clicking a pad opens its settings, which show the pad
as it will look while you type. **Board setup** sets how many columns the board
has; the pads wrap into as many rows as they need and the board scrolls, so
nothing is ever pushed off it. It also holds the fades new pads start with — a
second in, a second and a half out, so nothing begins or ends on a hard edge
unless a pad is told to.

**Each pad holds**: the file, the name shown on the pad, a note under it, a
colour, its level, fade in and fade
out times, a loop switch, start and stop points to the hundredth of a second, a
keyboard key, and what a second tap does — fade it out, start it over, pause it,
layer another copy on top, or nothing at all. A pad can also be set to fade
everything else out when it starts, for a hard scene change.

**Running the show.** Tap a pad to fire it. A pad that is playing lights up in
its own colour, the way a lamp does, with a green light, a countdown and a travel
bar along its bottom edge; the transport lists what is running against the clock. Pads all
start the same colour, so one of the eleven lighting gels means something once
it is chosen — a group, a scene, an act. The red **Stop** button takes everything
playing out, each sound on its own fade; `Esc` cuts the lot dead the moment you
hit it.

| Key | |
| --- | --- |
| pad keys | fire that pad, from the key shown in its corner |
| `Space` | stop what is playing, fading it out |
| `Esc` | cut everything dead |

**On a tablet or a phone.** The board is the whole screen, and it keeps the shape
you gave it: a six-column board is six columns wide everywhere, scrolling rather
than rearranging itself under the operator. While editing, Stop and the volume
give their place to **Browse files**, which opens the folder over the whole
screen — the pads and the files are never half each — and **Back to the pads**
closes it. Pads are moved by their grip, which works the same under a finger as
under a mouse; a pad's row and column can also be typed into its settings. The
screen is kept awake while a board is open.

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
