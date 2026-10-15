---
name: architecture-review
description: Reviews the whole soundboard codebase on main for architecture and drift from docs/, and files each confirmed finding as an issue; changes no code. Run by the periodic review every 20 merged PRs. Triggers on "architecture-review", "review the whole codebase", "architecture review".
---

# architecture-review

The review-loop's architect sees one branch's diff. Drift spread over many
PRs, a module that keeps growing, a doc that became wrong a line at a time, is
only seen from the whole. This reviews the codebase as it stands on `main` and
changes no code: what it finds becomes issues, which the owner orders like any
other work (`CLAUDE.md` § Track work in GitHub issues).

## The review

1. **Check out `main`.** `git fetch -q origin main`, then
   `git checkout --detach origin/main`, once any branch of your own is
   pushed. Done when `git status` shows a detached `HEAD` at `origin/main`.

2. **Gather what is already known**, with the GitHub MCP tools: the open and
   closed issues labelled `architecture`, and the comment the last
   architecture review left on the previous `periodic-review` issue, with the
   findings it rejected. Done when you hold both lists.

3. **Launch the two reviewers** below in parallel, with the Agent tool,
   `subagent_type: "general-purpose"`, `model: "sonnet"`, in the foreground.
   Each prompt is the common part, then its own, then the two lists of step 2
   under "Already known; raise one again only with a fact it did not
   consider". Done when both have reported.

4. **Settle each finding yourself** at the code it cites: confirmed, rejected
   with one line of why, or a choice the owner makes (a rule of
   `docs/decisions.md`, a behaviour the README does not settle). Done when
   every finding has one of the three.

5. **File each confirmed finding** as an issue labelled `architecture`: the
   title says what is wrong in plain words; the body gives `file:line`, the
   case where it bites, the remedy and its size. A finding that matches an
   open issue gets a comment there if it grew, else nothing. A gap listed in
   `docs/status.md` is named in the issue, for the PR that fixes it. Done
   when every confirmed finding has its issue or its comment.

6. **Report** in one comment on the `periodic-review` issue (to the user if
   run alone): the harness PR, the issues filed, the choices left to the
   owner, and every rejected finding with its reason, which the next review
   reads at step 2. Done when the comment is posted.

## The reviewers

The common part:

```
You review the whole soundboard repository, checked out at origin/main in the
current directory. Read CLAUDE.md first, then docs/architecture.md and
docs/decisions.md; README.md is the specification.

Change nothing: no edit, no write, no commit, no git command but read-only
ones. Do not call any mcp__hearthbot__ tool.

Report each finding as: file:line, what is wrong, a concrete case where it
costs (a bug it invites, a change it makes harder, a reader it misleads), and
a remedy with its size. Leave out the matter of taste, the low-confidence, and
what a rule of docs/decisions.md settles on purpose. No finding is a valid
answer.
```

**modules**: the architect prompt of
[`review-loop/reviewers.md`](../review-loop/reviewers.md#architect), with "the
change" read as the whole codebase, then:

```
Also: a function or file grown past what one reader holds; logic written
twice; an export nothing imports.
```

**docs and tests**:

```
Find where the documents and the code disagree: docs/architecture.md (code
map, data format, storage, recipes), docs/glossary.md (a term whose code moved
or is gone), docs/status.md, docs/testing.md and the helpers in e2e/. Then
what README.md describes that no test in e2e/ drives, and tests that break
CLAUDE.md § End-to-end tests (internals reached into, waitForTimeout,
@playwright/test imported directly). One fact written in two places is a
finding (CLAUDE.md § One fact, one place).
```

## Guardrails

- **A finding is filed on cited code**, never on a reviewer's summary.
- **No code, doc or test changes here**: each fix is its own issue, branch and
  review loop, so the owner chooses what comes first.
