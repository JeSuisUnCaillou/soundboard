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
- **The board is exactly the size it was set to.** Nothing grows it. A resize
  keeps every pad at its row and column, the way a cue sheet stays in its
  rows; a smaller board names the pads it could not keep, and those sounds
  stay in the folder.
- **A pad's settings belong to its sound.** A sound that leaves the board, by
  a resize, a drag off, *Empty this pad* or *Empty the board*, is remembered
  with its name, gel, level, fades, loop and second tap, and brings them back
  when it is put on a pad again. A board grown back puts what a resize took
  off back in its place. (The owner, 2026-10-16, on
  [#106](https://github.com/JeSuisUnCaillou/soundboard/issues/106).)
- **The board belongs to the operator.** A first launch puts the twelve
  bundled sounds on the *Default board*, set up the way an improv show uses
  them, so it can be played from the first minute; after that nothing lays
  itself out and nothing is set up by name, unless the operator asks for the
  default board again on an empty board.
  Added sounds wait under Sounds until the operator puts them on a pad, and
  adding sounds never moves a pad.
- **A sound's length sets what it is.** Under ten seconds it is a *hit* (no
  fade in, layers on a second tap, blue); otherwise a *cue* (green). It only
  sets defaults the operator has not touched, and it is decided before the pad
  is drawn so a pad never changes colour in front of them.
- **A stop can be taken back while it fades.** A pad told to stop is no
  longer lit as playing, but while the hall still hears its fade its light
  goes down with the sound, and a tap during the fade brings the sound back
  from where it is, not from the top. A fade towards the pad's own stop point
  is *not* a stop, and the pad answers a tap as usual. (The owner, 2026-10-16,
  on #107: two operators read a fading pad as silent, and two had a Stop
  taken back by the MC inside the fade.)
- **Two taps a fraction of a second apart are one tap.** A nervous double tap
  starts a cue; it does not start it and fade it straight out. Within 300 ms
  the second tap is dropped; after that it does what the pad's second tap
  says. (The owner, 2026-10-16, on #107.)
- **Stop fades, Escape cuts.** Stop (and Space) takes each pad out on its own
  fade out; Escape silences everything instantly.
- **The pads are played by touch.** The board runs from a phone or a tablet,
  so a pad has no key: a key nobody sees is a pad fired by mistake, and a
  touch screen has none to press. Space and Escape stay, for a keyboard that
  happens to be there. (The owner, 2026-10-16: "we are always going to use the
  touch screen".)
- **A glance at the board tells the truth.** Every pad that may be needed is
  on screen or the edge says there is more; a name is read whole, broken only
  between words; a clock says what will happen (a loop is marked as one, a
  sound under a second is not `0:00`); and nothing is laid over the pads, so a
  message never hides whether a pad lit. (#108, from the 2026-10-16 study.)
- **Gels mean something once chosen.** Every pad starts the same blue; colour
  is the operator's code for a group, a scene, an act.
- **The screen stays awake** while a board is open, and the board says so if
  the browser will not do it.
- **While editing, a pad drags at once, under a mouse or a finger.**
  Press-and-move drags, press-and-release plays. A finger scrolls the board
  from the empty places and the gaps, not from a filled pad. (The owner
  dropped the rest-to-pick-up wait on 2026-10-15: it was annoying.)
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
  fade out can be interrupted by a fade in without a click.
- **Media elements are fetched with CORS** (`crossOrigin = 'anonymous'`).
  Otherwise a sound served from another origin plays as silence in the audio
  graph.
- **The service worker is network first**, with `cache: 'no-cache'`, and is
  registered with `updateViaCache: 'none'`: a deploy is picked up on the next
  load, and a stale module never runs next to a fresh one. It waits on the
  network a short while at most ([architecture.md](architecture.md#offline-swjs)):
  weak wifi must not hold up a board it already has.
- **The fonts ship with the board.** Nothing is fetched from another site,
  so the board looks the same offline and never waits on a font server.
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
  the operator could not see, or needs to act on, and says it once. No
  confirmations of the obvious.
- **Comments say why**, in full sentences, and only where the code cannot.
  They describe what the code does now, never what it used to do.
- **Commit and PR titles describe the behaviour, not the code change**, as a
  sentence about the board: "Stop greys out at once, and a pad fading out can
  be tapped back on", "A board is the size it was set to, and no bigger". The
  body explains what an operator sees and why, then briefly how.
- **English only**, everywhere in the repository.
