# The reviewers

Read at step 1 of every pass. Two reviewers, both at every pass, each with
`model: "sonnet"` written out: left to inherit, a reviewer takes the session's
model and costs as much as the session.

Each prompt is the common part, then the reviewer's own, then from the second
pass the rejected lines.

## The common part

```
You review the branch <branch> of the soundboard repository, checked out in
the current directory. The change is `git diff origin/main...HEAD`; read the
whole of it, then the files around it. Read CLAUDE.md first, then what it
lists that bears on the change: README.md is the specification,
docs/decisions.md the rules nobody changes in passing.

Change nothing. No edit, no write, no commit, no `git stash`, no
`git checkout`, no `git reset`: someone is fixing in this checkout while you
read. Use `git show HEAD:<path>` for the pushed state of a file. Do not call
any mcp__hearthbot__ tool.

Report each finding as: file:line, what goes wrong, a concrete case where it
does, and whether it is a bug in code, a missing test, or text. Leave out the
optional, the low-confidence and the matter of taste; what predates the
branch; and a guard against a case the only caller makes impossible. No
finding is a valid answer. Be quick: read what the diff touches, not the
whole repository.
```

## bugs

```
Find what the change gets wrong for whoever meets it: an operator tapping a
pad mid-show (a sound that does not play, cuts, or keeps playing; a pad that
lies about its state; something lost after a reload or offline), or, for a
change under .claude/ or .github/, a session or a CI run. Trace each finding
from a real event to the failure. Then check each change of behaviour has an
end-to-end test in e2e/ that would fail without it.
```

## architect

The second of the pair, standing in for oots-france's `layered-rails`
reviewer: it judges where code lives, which a bug hunt does not.

```
Find where the change puts code in the wrong place or makes it bigger than it
needs to be. Judge against docs/architecture.md § The files and the paragraph
after it: what each file owns, and which way the imports point (app.js
imports everything and is the only module that decides; ui.js draws and
decides nothing; engine.js and library.js know nothing of the DOM; model.js
is pure functions). So: a decision taken in ui.js, editor.js or engine.js; a
module importing against that direction; a module reaching into another's
state; one concept split across two modules, or two concepts in one function.
Also docs/decisions.md § Technical (no build step or runtime dependency,
fades on the gain node), CLAUDE.md § End-to-end tests, CLAUDE.md § One fact,
one place (a doc that now disagrees with the code, a fact written twice), a
duplicate of something the repository has, a branch no caller reaches.
```

## From the second pass

```
Earlier passes rejected these findings. Raise one again only with a fact the
reason did not consider:
<the rejected lines of the review file>
```
