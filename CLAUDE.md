# Working on the soundboard

A sound-cue board for theatre: a static web app (`index.html`, `css/`, `js/` ES
modules, `sw.js`) that plays the operator's own audio files from a grid of
pads, offline. No build step and no runtime dependencies — keep it that way.
`package.json` exists only for the test tooling.

## Read this first

- [README.md](README.md) — what the board does, from the operator's side. It is
  the specification: a behaviour it describes is a behaviour to keep.
- [docs/architecture.md](docs/architecture.md) — what each file owns, the board
  and pad format, how a sound gets from the disk to the speakers, what is
  stored where, and recipes for common changes. **Read it before touching
  code.**
- [docs/decisions.md](docs/decisions.md) — why it is built this way, and the
  voice the UI, comments and commits are written in. Changing one of these is
  the owner's call.
- [docs/glossary.md](docs/glossary.md) — every term (pad, hit, cue, gel, kept
  copies, live, released…) with the code that carries it.
- [docs/testing.md](docs/testing.md) — running and writing the end-to-end
  tests.
- [docs/status.md](docs/status.md) — what works, what is untested, loose ends.
- [docs/deployment.md](docs/deployment.md) — CI, GitHub Pages, branch previews.

## One fact, one place

Each piece of information has one owning file; others link to it. When
something changes, update its owner — and only its owner.

| Topic | Owner |
| --- | --- |
| What the board does, for an operator; browser support | `README.md` |
| Code map, data format, audio engine, storage, offline, recipes | `docs/architecture.md` |
| Why: product rules, technical choices, voice | `docs/decisions.md` |
| Vocabulary | `docs/glossary.md` |
| How to run and write tests, helpers, coverage by spec | `docs/testing.md` |
| What exists, test gaps, known loose ends | `docs/status.md` |
| Workflows, Pages, previews | `docs/deployment.md` |
| Tasks, bugs, ideas, their order | [GitHub issues](https://github.com/JeSuisUnCaillou/soundboard/issues) |
| Rules for working here | this file; the Claude project's instructions and team memory point here |

The Claude project's instructions and team memory hold no rule this file or a
skill does not: the `harness-engineer` skill brings them home on each pass. If
they differ, the repository wins.

A change that alters behaviour, a file's role, a stored format or a convention
updates the doc that owns it in the same commit. A doc that disagrees with the
code is a bug: fix whichever is wrong.

## English only

Everything in the repository is written in English: code, comments, docs,
commit messages, and this file — even when the conversation is in another
language.

## Track work in GitHub issues

Work is tracked in the repository's GitHub issues. Before starting a piece of
work, find its issue or open one that says what and why. Reference it from the
pull request (`Closes #n`) so merging closes it. Something found along the way
and not done goes in a new issue, not in a TODO comment. When an issue opens or
closes a gap listed in `docs/status.md`, update that table. When you suggest
work, say which suggestions already have an issue.

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

The helpers, a worked example and the limits of the suite are in
[docs/testing.md](docs/testing.md).

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

## Open a pull request for every branch

Whenever you create a branch and push work to it, open a pull request for it
against `main` — do not wait to be asked. Give it a title and description that
say what changed and why, and include the raw.githack link above so the
reviewer can try it.

Assign the pull request to the owner, Caillou (`JeSuisUnCaillou`), and do not
request their review: the pull requests are opened under their account, and
GitHub refuses a review from a pull request's own author.

## Who merges

The owner merges. When the owner says "validated" or "merge once green" about
a thread's pull requests, merge each one as soon as it is green.

Once the work is pushed, review it with `Skill(skill: "review-loop")` before
handing it over; a Stop hook starts it otherwise. The skill says which pull
requests Claude merges by itself once it converges (small bug fixes) and
which wait for the owner.

Merge with a squash, so the title ends with the pull request number, `… (#n)`.

## Periodic review

Every 20 pull requests merged into `main`, the harness and the whole codebase
get a review. A weekly scheduled task in the Claude project starts a session
that follows this section:

1. Count the pull requests merged into `main` since the newest issue labelled
   `periodic-review` was opened, or after #50 if there is none. Under 20, stop
   and say so.
2. Open an issue labelled `periodic-review`, "Periodic review after #n", as
   the work's issue.
3. Run `Skill(skill: "harness-engineer")`, then
   `Skill(skill: "architecture-review")`.
4. Comment on the issue with the harness PR and the issues filed, and close
   it. The harness PR waits for the owner.
