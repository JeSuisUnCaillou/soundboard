# Deployment

The board is published to GitHub Pages at
**https://jesuisuncaillou.github.io/soundboard/**. There is nothing to build:
the repository is the site.

## How a change goes live

1. Work on a branch, with its end-to-end test (see [CLAUDE.md](../CLAUDE.md)).
2. Open a pull request against `main`. `e2e.yml` runs the suite on it.
3. Hand over the branch preview, served straight from GitHub:
   `https://raw.githack.com/JeSuisUnCaillou/soundboard/<branch>/index.html`.
4. The owner merges (squash merge so far: the PR number ends up in the title,
   `… (#3)`).
5. The push to `main` runs `pages.yml`: it calls `e2e.yml` first and deploys
   only if the suite passes. Deploys run one at a time and are not cancelled.

## Workflows

| File | Runs on | Does |
| --- | --- | --- |
| `.github/workflows/e2e.yml` | every pull request, `workflow_call`, manual | `npm ci`, install Chromium, `npm run test:e2e`, upload the report on failure. Node 22, `ubuntu-24.04`, 15 min timeout. |
| `.github/workflows/pages.yml` | push to `main`, manual | `test` (calls `e2e.yml`), then `deploy`: upload the whole repository as the Pages artifact and deploy it. |

Action versions and the runner are pinned on purpose: a deploy that worked on
Friday should work on Monday. Update them deliberately, not by floating tags.

## After a deploy

The service worker is network first, so a returning visitor gets the new
version on their next load with the network on. A page already open keeps the
old modules until reloaded. When telling the owner to try something, remind
them to reload if the old version shows up.

> [!WARNING]
> Everything in the repository is published, `e2e/` and `docs/` included.
> Never commit anything that should not be public.
