# Testing

The board is covered by [Playwright](https://playwright.dev) end-to-end tests
in `e2e/`, run in Chromium at desktop and phone size against the site as it is
served. The rule that every change in behaviour comes with a test is in
[CLAUDE.md](../CLAUDE.md#end-to-end-tests); this file is how to write and run
them.

## Running

```sh
npm install
npx playwright install chromium   # once; not needed where a Chromium is preinstalled
npm run test:e2e                  # the whole suite, both projects
npx playwright test e2e/edit.spec.js --project=phone   # one spec, one size
npx playwright test -g "Escape"   # by title
```

The suite takes about half a minute. `playwright.config.js` starts
`node e2e/serve.js 4173` itself (and reuses one already running, outside CI).
On failure, CI uploads `playwright-report/` and `test-results/` (traces are
kept on failure) as the `playwright-report` artifact.

## The setup

| Piece | What it does |
| --- | --- |
| `playwright.config.js` | Projects `desktop` (Desktop Chrome) and `phone` (Pixel 7, 412px wide, so *narrow*). Fully parallel; one retry on CI. Chromium runs with `--autoplay-policy=no-user-gesture-required`. |
| `e2e/serve.js` | A dependency-free static server that answers byte-range requests, sends `Cache-Control: no-cache`, and allows CORS. |
| `e2e/helpers.js` | The `test` and `expect` every spec imports, and the helpers below. |

Why a custom server: Chromium will not play a sound under test from a server
without byte ranges, and `python3 -m http.server` has none. Reached as
`127.0.0.1` instead of `localhost`, the same server is another origin, which is
how `board.spec.js` tests a sound served cross-origin.

## Helpers (`e2e/helpers.js`)

| Helper | Use |
| --- | --- |
| `test` | Playwright's `test` with a granted screen wake lock injected; headless Chromium refuses one, and the board's warning toast would hide what a test reads. Always import this one. |
| `expect` | Re-exported from Playwright. |
| `openBoard(page)` | Go to `/` and wait for the default board's three pads. Every test starts from a fresh browser context, so this is always a first launch. |
| `pad(page, title)` | A filled pad by the name it shows. |
| `BUNDLED_TITLES` | `['Gunshot', 'Crickets ambiance', 'Sexy']`. Gunshot (3 s) is a hit; Crickets ambiance (26 s) and Sexy (2 min 54) are cues. |
| `showSounds(page)` | Open the book wherever the layout keeps it (**Browse files** on phone). |
| `isNarrow(page)` | Viewport ≤ 900px. |
| `silentWav(seconds, rate)` | A WAV buffer made in the test, for adding sounds. Never commit test audio. |

`board.spec.js` also has a local `setUpPad(page, title, fields)` that enters
edit mode, opens a pad's sheet, fills fields by id, saves and leaves edit mode.
Move it to `helpers.js` when a second spec needs it.

## Writing a test

The rules are in [CLAUDE.md](../CLAUDE.md#end-to-end-tests). Beyond them:

- What to assert on: `pad--playing`, `pad--paused`, `pad--missing`,
  `pad--waiting`, `lib__item--used`, `#toast` text, `aria-pressed`,
  `disabled`. A fade that must finish is waited for by asserting its end state.
- Branch on `isNarrow(page)` only where the layout really differs (the book,
  the bottom bar).
- `page.route` cannot see requests the service worker answers: a test that
  routes requests needs `test.use({ serviceWorkers: 'block' })`, as the
  cross-origin test in `board.spec.js` does.
- Headless Chromium keeps every tab visible. A test of the board in a hidden
  tab overrides `document.hidden` and `visibilityState` in an init script and
  dispatches `visibilitychange`, as the stop-point test in `board.spec.js` does.
- Persistence is tested by `page.reload()` and asserting the board came back.
- Adding sounds, with the pickers deleted as CLAUDE.md says:

  ```js
  await page.addInitScript(() => {
    delete window.showOpenFilePicker;
    delete window.showDirectoryPicker;
  });
  await openBoard(page);
  await page.locator('#btnEdit').click();
  await showSounds(page);
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#btnAdd').click();
  await page.locator('#btnAddFiles').click();
  await (await chooser).setFiles([{ name: 'door.wav', mimeType: 'audio/wav', buffer: silentWav(1) }]);
  ```

  See `edit.spec.js` for the full example.
- Downloads (the board file) are caught with `page.waitForEvent('download')`;
  uploads to a hidden input with `setInputFiles` on `#importFile`.

## Which spec

| Spec | Covers |
| --- | --- |
| `board.spec.js` | Running the show: the first board, tapping, Stop, Escape, master volume, fades and second taps, stop points (also in a hidden tab), a pad stopped while starting, keys, cross-origin sound, Reconnect during a cue. |
| `edit.spec.js` | Building a board: edit mode, the pad sheet, Board settings (resizing too), loading a board file, emptying, adding sounds, keeping copies of sounds. |
| `offline.spec.js` | The service worker: reload with the network off. |

What is not covered yet is listed in [status.md](status.md#test-coverage).

## Limits

- Chromium only: Safari and Firefox behaviour (iOS gesture rules, no folder
  picker) is not exercised. Check it by hand on a device when a change touches
  `engine.wake`, pickers or touch handling.
- The File System Access pickers cannot be answered from a test. A handle
  can still be had from the browser's private storage
  (`navigator.storage.getDirectory()`): the Reconnect test in `board.spec.js`
  returns one from a stubbed `showDirectoryPicker` and stubs
  `queryPermission` / `requestPermission` to make the board ask again.
- Audio is not listened to: "playing" means the pad shows `pad--playing`.
