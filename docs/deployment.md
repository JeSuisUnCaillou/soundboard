# Deployment

The board is published to GitHub Pages at
**https://jesuisuncaillou.github.io/soundboard/**. There is nothing to build:
the repository is the site.

## How a change goes live

1. Work on a branch, with its issue and its end-to-end test, open a pull
   request against `main` and hand over the branch preview: the rules are in
   [CLAUDE.md](../CLAUDE.md). `e2e.yml` runs the suite on the pull request.
2. The owner merges, or Claude when [CLAUDE.md](../CLAUDE.md#who-merges)
   allows it: a squash merge, so the PR number ends
   up in the title, `… (#3)`.
3. The push to `main` runs `pages.yml`: it calls `e2e.yml` first and deploys
   only if the suite passes. Deploys run one at a time and are not cancelled.

## Workflows

| File | Runs on | Does |
| --- | --- | --- |
| `.github/workflows/e2e.yml` | every pull request, `workflow_call`, manual | `npm ci`, install Chromium, `npm run test:e2e`, upload the report on failure. Node 22, `ubuntu-24.04`, 15 min timeout. |
| `.github/workflows/pages.yml` | push to `main`, manual | `test` (calls `e2e.yml`), then `deploy`: upload the whole repository as the Pages artifact and deploy it. |

The runner is pinned (`ubuntu-24.04`) so a deploy that worked on Friday works
on Monday; actions follow their major tag and are bumped deliberately.

## After a deploy

The service worker is network first, so a returning visitor gets the new
version on their next load with the network on. A page already open keeps the
old modules until reloaded.

> [!WARNING]
> Everything in the repository is published, `e2e/` and `docs/` included.
> Never commit anything that should not be public.
