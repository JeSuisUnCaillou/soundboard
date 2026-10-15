# Decisions

Why the board is built the way it is. Each of these was chosen on purpose;
changing one is a decision for the owner, not a refactor. How the pieces work
is in [architecture.md](architecture.md).

## Product

- **For a theatre's sound operator, during a show.** Every choice is judged by
  what happens when someone taps a pad in the dark with the audience in. A
  board that hesitates, guesses, rearranges itself or asks a question mid-show
  is wrong, however tidy the code.
- **The operator's own files, never uploaded.** The board reads sounds straight
  off the disk. No server, no account, no network dependency: a theatre's wifi
  is not to be counted on.
- **Works offline, after a reload, on a phone.** That is why every loaded sound
  is copied into IndexedDB (*kept copies*), not only the ones on pads, and why
  the service worker exists. Handles to the real files are a bonus where the
  browser offers them, not a requirement.
- **Reconnecting is an offer, not a toll gate.** If the browser wants
  permission again, the board plays from its copies meanwhile.
- **The board is exactly the size it was set to.** Nothing grows it. A smaller
  board says what it could not keep, and those sounds stay in the folder.
- **Only the first sounds lay themselves out**, at most ten, and only on an
  empty board. After that the board belongs to the operator: adding sounds
  never moves a pad.
- **A sound's length sets what it is.** Under five seconds it is a *hit* (no
  fade in, layers on a second tap, blue); otherwise a *cue* (green). It only
  sets defaults the operator has not touched, and it is decided before the pad
  is drawn so a pad never changes colour in front of them.
- **A pad told to stop looks stopped at once**, even while its sound fades:
  the operator has already moved on. Tapping it again starts it afresh. A fade
  towards the pad's own stop point is *not* a stop, and the pad answers a tap
  as usual.
- **Stop fades, Escape cuts.** Stop (and Space) takes each pad out on its own
  fade out; Escape silences everything instantly.
- **A held key is one tap.** Key repeat must not flicker a pad.
- **Keys sit under the fingers in the shape of the pads.** Row one is `1..=`,
  then `q..]`, `a..\`, `z..#`.
- **Gels mean something once chosen.** Every pad starts the same blue; colour
  is the operator's code for a group, a scene, an act.
- **The screen stays awake** while a board is open, and the board says so if
  the browser will not do it.
- **Under a finger, a touch that moves scrolls**; resting picks a pad up.
  With a mouse, any press-and-move drags, press-and-release plays.
- **Nothing is destroyed by surprise.** *Empty the board* asks twice and keeps
  the sounds. A pad whose file is missing is struck through, not dropped. A
  sound clashing with another's path gets a path of its own, so a pad never
  plays the wrong file.

## Technical

- **No build step and no runtime dependencies.** Plain ES modules served as
  files. `package.json` exists only for Playwright. Do not add a bundler, a
  framework, TypeScript compilation or an npm runtime package.
- **One kept `<audio>` per pad, through its own gain node.** Buffered when the
  pad is set up, so a tap plays in milliseconds rather than after a fetch.
- **Fades are exponential ramps on the gain node**, never on `el.volume`, so a
  fade out can be interrupted by a fade in without a click, and fades sound
  even to the ear.
- **Media elements are fetched with CORS** (`crossOrigin = 'anonymous'`).
  Otherwise a sound served from another origin plays as silence in the audio
  graph.
- **The service worker is network first**, with `cache: 'no-cache'`, and is
  registered with `updateViaCache: 'none'`: a deploy is picked up on the next
  load, and a stale module never runs next to a fresh one.
- **Text from filenames is set as text, never markup** (`ui.js`). The names
  come from someone else's disk.
- **`ui.js` draws, `app.js` decides.** The engine and library know nothing of
  the screen.
- **Tests drive the app like an operator**, through what is on screen, in a
  real Chromium at two sizes. See [testing.md](testing.md).

## Voice

The UI, the docs, the comments and the commit messages share one voice.

- **Plain sentences about the show**, addressed to the operator: "The board is
  empty. The sounds are still under Sounds." Not "Board cleared successfully".
- **Say what happened and what is left**, never blame: "Without permission to
  read them, the board stays on the copies it kept."
- **The board does not chatter.** A toast appears when something happened that
  the operator could not see, or needs to act on. No confirmations of the
  obvious.
- **Comments say why**, in full sentences, and only where the code cannot.
  They describe what the code does now, never what it used to do.
- **Commit and PR titles describe the behaviour, not the code change**, as a
  sentence about the board: "Stop greys out at once, and a pad fading out can
  be tapped back on", "A board is the size it was set to, and no bigger". The
  body explains what an operator sees and why, then briefly how.
- **English only**, everywhere in the repository.
