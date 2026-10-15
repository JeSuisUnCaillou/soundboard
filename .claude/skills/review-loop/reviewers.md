# The reviewers

Read at step 1 of every pass, before launching anyone.

## Contents

- Who reviews, and when
- What every prompt says
- The prompts
- Cost

## Who reviews, and when

Decide on `git diff --name-only origin/main...HEAD`, and write the condition
next to each reviewer in the review file, so a shrinking set shows at once.

| Reviewer | Launched |
| --- | --- |
| correctness | always |
| simplicity | always |
| tests | the diff touches `index.html`, `css/`, `js/`, `sw.js` or `e2e/` |
| docs | the diff touches a `.md` file, or changes behaviour, a stored format or a file's role |

Every reviewer runs with `model: "sonnet"`, written out: left to inherit, it
takes the session's model and the independent look costs as much as the
session.

A pass that only checks a structural fix (`not-converging.md`)
may run correctness and the reviewer that found the cycle, simplicity if that
was correctness. Every other pass keeps the full set.

## What every prompt says

Put these lines at the head of each prompt, then the reviewer's own part.

```
You review the branch <branch> of the soundboard repository, checked out in
the current directory. The change is `git diff origin/main...HEAD`; read the
whole of it, then the files around it.

Read CLAUDE.md first, then the docs it lists that bear on the change:
README.md is the specification, docs/decisions.md the rules nobody changes in
passing, docs/architecture.md what each file owns.

Change nothing. No edit, no write, no commit, no `git stash`, no
`git checkout`, no `git reset`: someone is fixing in this checkout while you
read. To see the pushed state of a file, use `git show HEAD:<path>`. Do not
call any mcp__hearthbot__ tool.

Report each finding as: file:line, what goes wrong, a concrete case where it
does (input, tap, state), and whether it is a bug in code, a missing test, or
text. Leave out what you would call optional, low confidence or a matter of
taste; what predates the branch (a pattern shared by files the diff does not
touch); and a guard against a case the only caller makes impossible. A finding
you hesitate over, you keep to yourself. No finding is a valid answer.
```

From the second pass, add:

```
Earlier passes rejected these findings, with the reason. Raise one again only
with a fact the reason did not consider:
<the "Rejected" lines of every earlier pass>
```

## The prompts

**correctness**

```
Find what the change breaks or gets wrong when an operator uses the board:
a tap that does not play, a pad that lies about its state, a sound cut or
left playing, something lost after a reload or offline, an error swallowed.
Judge against the README and docs/decisions.md § Product: a board that
hesitates, guesses or rearranges itself mid-show is wrong. Trace each finding
from a real event (a tap, a key, a drop, a reload) to the failure.
```

**simplicity**

```
Find what makes the change bigger or harder than it needs to be: code that
duplicates something the repository already has, a branch no caller reaches,
a helper used once, state kept in two places. Also what breaks
docs/decisions.md § Technical: a build step or runtime dependency, ui.js
deciding or app.js drawing, a fade on el.volume, text from a filename set as
markup, a comment that says what instead of why.
```

**tests**

```
Find each change of behaviour in the diff that no end-to-end test in e2e/
would catch if it were undone, and each test that would still pass without
the change it claims to cover. Check the tests follow CLAUDE.md § End-to-end
tests: helpers from e2e/helpers.js, things found the way the operator finds
them, no waitForTimeout, both desktop and phone.
```

**docs**

```
Find each place where a doc and the code now disagree, using the table in
CLAUDE.md § One fact, one place: a behaviour the README describes otherwise, a
file's role or a stored format docs/architecture.md describes otherwise, a gap
in docs/status.md the change opens or closes, a term docs/glossary.md lacks.
Also a fact the change writes in two files. English only.
```

## Cost

A pass is two to four agents, each reading the whole diff and the docs. It is
the price of the only net that catches a blocking finding before the merge;
save elsewhere, never by dropping a reviewer. The audit that measures it is the
one to quote, not a figure copied here.
