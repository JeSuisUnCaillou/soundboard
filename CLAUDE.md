# CLAUDE.md

## Always test in the app

Every change must be tried in the running app before it is reported as done —
checking syntax is not enough. Reproduce the problem on the old code first, then
show the same scenario behaving correctly with the change.

How:

1. Serve the folder: `python3 -m http.server 8765` (it must be served over
   `http://localhost`, not opened from the file system).
2. Drive it with Playwright in Chromium
   (`executablePath: '/opt/pw-browsers/chromium'`, launched with
   `--autoplay-policy=no-user-gesture-required` so sounds play without a
   gesture). A fresh launch shows the bundled sounds from `sounds/` on the
   first pads, so there is always something to press.
3. Assert on the DOM (`.pad--playing`, `#btnStop` disabled, aria-labels…),
   watch for `pageerror`, and take a screenshot to look at the result.
4. To compare with the old behaviour, check out the previous commit's files
   (`git checkout HEAD~1 -- js`), run the same script, then restore them
   (`git checkout HEAD -- js`).

Keep test scripts in the scratchpad, not in the repo, and say in the report what
was tested and what was not.
