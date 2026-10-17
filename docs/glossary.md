# Glossary

Every word the board, its docs and its code use with a particular meaning, once
each, with where it lives in the code. Look a word up here rather than guessing
it from context, and define new terms here, not elsewhere.

| Term | Meaning | In the code |
| --- | --- | --- |
| **Board** | The grid of pads for a show, with its size, master level and default fades. One is open at a time. | `board` object, `model.js` `newBoard` |
| **Default board** | The board a first launch opens, holding the bundled sounds. Its id is `default-board`. | `App.firstBoard` |
| **Pad** | One cell of the board that holds a sound and how to play it. Empty pads are `null` or have no `file`. | `pad` object, `model.js` `newPad`; `.pad`, `.pad--filled`, `.pad--empty` |
| **Remembered** | A sound that left the board, kept with the settings its pad had (and, if a resize took it off, its row and column), so it comes back as it was. | `board.remembered`, `model.js` `remember`, `recall` |
| **Pad title** | What a pad shows: its own name, or the file's pretty name. Tests find pads by it. | `padTitle`, `prettyName` |
| **Sound** | An audio file the board can reach, by its library path. | `Library.entries` |
| **Path** | A sound's identity: its folder-relative path including the folder's own name, e.g. `Show/Act 1/rain.wav`. Pads point at paths, so a board travels with its folder. | `pad.file`, entry `path` |
| **Source** | One place sounds came from: a folder, some files, the bundled set, or the kept copies. | `Library.sources`, `kind` |
| **Bundled sounds** | The twelve sounds served with the app under `sounds/`, shown under `default/` in the tree. | `bundled.js` |
| **Kept copies** | Blobs of every loaded sound stored in IndexedDB, so a reload plays without the folder. | `store.putSound`, `App.keepSounds`, `Library.addCached`, source kind `cache` |
| **Handle** | A `FileSystemHandle` from the File System Access API (desktop Chromium only), stored so the real files can be reopened. | `store.saveHandles`, `CAN_PERSIST` |
| **Reconnect / Reopen** | Granting read permission on stored handles again. *Reconnect* (rail) when pads already play from copies; *Reopen* (picker) when nothing can play. | `#btnReconnect`, `#btnReopen`, `App.reconnect` |
| **Missing** | A pad whose path is not in the library. Shown struck through, never dropped. | `.pad--missing` |
| **Will not load** | A pad whose file was tried and failed to load: unreadable, or a player the browser refused. Shown with a red dashed border, never dropped. | `.pad--broken`, `Engine.wontLoad` |
| **Edit mode** | Building the board: the book, Board settings, Empty the board, pencils on pads. Off is "running the show". | `App.editing`, `body[data-editing="on"]`, `#btnEdit` |
| **Book** / **Sounds** | The panel holding the library tree. Beside the board when wide, over it from **Browse files** when narrow. | `#book`, `setBook`, `body[data-book]` |
| **Narrow** | Viewport ≤ 900px. The book covers the board; Stop and the volume give way to **Browse files** in edit mode. | `NARROW` in `app.js`, `isNarrow` in tests |
| **Waiting pad** | An empty pad clicked in edit mode; the next **+** lands on it. | `App.padWanting`, `.pad--waiting` |
| **Preview** / **listen** | Hearing a sound from the tree. A voice on channel `PREVIEW` (-1); tapping the same sound again stops it. | `Engine.preview`, `.lib__item--playing` |
| **Hit** | A sound under 10 s: starts at full level, layers on a second tap, stays blue. | `SHORT_SOUND`, `applyLengthDefaults` |
| **Cue** | A sound of 10 s or more: fades in, fades out on a second tap, comes up green (Moss). | idem, `LONG_GEL` |
| **Gel** | A pad colour, named after a theatre lighting gel. Eleven of them. | `gels.js`, `DEFAULT_GEL = 'daylight'` |
| **Second tap** | What tapping a playing pad does: `fadeout`, `restart`, `pause`, `overlay` (layer), `ignore`. | `pad.tap`, `Engine.fire`, `#padTap` |
| **Layer** | Another copy of a pad's sound played on top; the pad shows `×n`. | `overlay`, `Engine._extra`, `.pad__stack` |
| **Solo** | "Fade everything else out when this starts." | `pad.solo` |
| **Trim / start and stop points** | Where in the file a pad starts and stops, to the hundredth of a second. | `trimStart`, `trimEnd`, `Engine.tick` |
| **Fade in / fade out** | Seconds of gain ramp at start and stop. New pads take the board's defaults (1 s / 1.5 s). | `fadeIn`, `fadeOut`, `board.defaults` |
| **Stop** | Fade out everything playing, each pad on its own fade out. Also Space. | `#btnStop`, `App.stop` |
| **Cut** | Silence everything at once. Escape. | `engine.stopAll({ fade: 0 })` |
| **Live** | Playing and not yet told to stop. What a pad's look, Stop and a tap all go by. | `Engine.live` |
| **Released** | Told to stop; may still be fading out. The pad is no longer lit as playing; while its sound fades it is *fading*. | `voice.released` |
| **Fading** | A pad released while its sound is still heard: its light goes down with the sound, and a tap brings the sound back from where it is. | `state: 'fading'`, `.pad--fading`, `--level`, `.lamp--fading` |
| **Double tap** | Two taps on a pad within 300 ms. They count as one tap, except on a pad that layers. | `DOUBLE_TAP`, `App.tap` |
| **Channel** | The kept `<audio>` + gain node of one pad. | `Engine.channels` |
| **Voice** | Any playing `<audio>` + gain: a channel, a layer or a preview. | `Engine.active` |
| **Prime** | Create a pad's channel and buffer its file ahead of time. | `Engine.prime`, `App.primeAll` |
| **Measure** | Read a sound's length once, through a throwaway `<audio>`. | `probeDuration`, `App.measure`, `Library.lengthOf` |
| **Lamp** / **travel** / **countdown** | The green light, the progress bar along the bottom and the time left on a playing pad. The lamp dims on a fading pad. | `.pad__lamp`, `.lamp--go`, `.lamp--fading`, `.pad__travel`, `.pad__time` |
| **Toast** | The short message, said over the top rail and never over the pads. Tests assert on it. | `toast()`, `#toast` |
| **Bin** / **+** | While editing, the buttons round the grid: a bin under each column and beside each row takes it out (twice tapped if it has sounds); the + in the corner adds a row and a column. | `.bin`, `.bin--armed`, `#btnGrow`, `App.removeLine`, `App.grow`, `model.removeLine` |
| **Edge fade** | A side of the board that goes on past the screen's edge fades out there. | `drawEdges`, `.stage--more-right` (and `-left`, `-up`, `-down`) |
| **Loop mark** | The circling arrow before a looping pad's clock, which counts to the end of one pass. | `.pad--loop` |
| **Board file** | A board exported as JSON (`<id>.soundboard.json`) from Board settings. | `App.exportBoard`, `importBoard` |
| **Shell** | The files the service worker precaches so the board runs offline. | `SHELL` in `sw.js` |
| **Operator** | The person running sound for the show. The docs and the UI copy are written for them. | |
