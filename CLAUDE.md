# Working on the soundboard

A static web app: `index.html`, `css/`, `js/` (ES modules), `sw.js`. No build
step and no runtime dependencies — keep it that way. `package.json` exists only
for the test tooling. The README's "How it is built" section maps the files.

## English only

Everything in the repository is written in English: code, comments, docs,
commit messages, and this file — even when the conversation is in another
language.

## End-to-end tests

The board is covered by Playwright tests in `e2e/`, run against the site as it
is served, in Chromium at desktop and phone size.

```sh
npm install
npm run test:e2e
```

**Every change in behaviour comes with an end-to-end test.** A new feature gets
a test that drives it the way an operator would; a bug fix gets a test that
fails without the fix. Add it in the same commit as the change, in the spec
that matches the area (`board.spec.js` for running the show, `edit.spec.js` for
building a board, `offline.spec.js` for the service worker), or a new spec if
none fits. Run the whole suite before pushing, and do not push with it red.

How the tests are written:

- Import `test` and `expect` from `e2e/helpers.js`, not from
  `@playwright/test`: its `test` grants a screen wake lock, which headless
  Chromium refuses.
- Find things the way the operator does — by a pad's name (`pad(page, title)`),
  by the ids in `index.html` — and assert on what is on screen: classes such
  as `pad--playing`, text, the toast. Do not reach into the app's internals.
- Tests must pass in both projects, `desktop` and `phone`. On the narrow layout
  the sounds open from **Browse files**; `showSounds(page)` handles both.
- Sounds a test needs are made in the test (`silentWav()`), not committed.
- The File System Access pickers cannot be answered from a test: delete
  `showOpenFilePicker` / `showDirectoryPicker` in an init script and the board
  falls back to the file input, which `page.waitForEvent('filechooser')` drives.
- Wait on assertions (`await expect(...)`), never on `waitForTimeout`.
- The tests are served by `e2e/serve.js`, which answers byte-range requests.
  `python3 -m http.server` does not, and Chromium will not play a sound
  through it under test.

CI runs the suite on every pull request (`.github/workflows/e2e.yml`), and
the Pages deploy runs it first and does not publish if it fails.

Checking syntax is never enough: a change is not done until it has been seen
working in the running app, through the suite or a test driven the same way.

## Hand over a link to try it

When a feature or fix is finished and pushed, give the user the raw.githack
link to the branch so they can try it themselves:

    https://raw.githack.com/JeSuisUnCaillou/soundboard/<branch>/index.html

Remind them to reload if the old version shows up: the service worker keeps a
copy of the app.
