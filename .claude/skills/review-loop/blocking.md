# Blocking or not, and fixing a finding

Read at step 3, before classifying the first finding of a pass, and before
saying "verified".

## Contents

- Blocking or not
- Fixing a finding

## Blocking or not

The reviewers do not decide this; you do, on the code they cite. Too wide and
the loop goes round on comfort, too narrow and a real bug ships. In real doubt
after these rules, call it not blocking: it is still fixed, and it stays in
the review file.

**Blocking**, only in code (`index.html`, `css/`, `js/`, `sw.js`, `e2e/`,
`.github/`, `.claude/hooks/`):

- a bug an operator or a session would meet;
- a change of behaviour with no end-to-end test that fails without it
  (`CLAUDE.md` § End-to-end tests);
- code that breaks a rule of `docs/decisions.md`;
- anything that would turn CI red.

**Not blocking**, everything else, including:

- **any error in text**, a comment, a doc, a skill, even a false statement:
  text is not run. It is fixed like any confirmed finding, and does not force
  a pass;
- a fact written in two places, unless the two copies already make the code
  behave differently, which is then a bug;
- something missing from a doc;
- style, naming, structure, clean-up.

## Fixing a finding

**The most mechanical fix wins.** Delete rather than rephrase, link to the
file that owns a fact rather than restate it, change the one word rather than
the paragraph. Every new line written to answer a finding is a new chance of a
finding at the next pass.

**A fix that states an outside fact is checked as you write it.** A browser's
behaviour, an API's contract, a count: check it at the source before writing
it (the spec, MDN, the file), and say in the review file how. Never quote what
you have not read in the source itself; never write a figure about a system
outside the repository.

**A test that passes proves nothing until it has failed.** For every fix of
behaviour: undo the fix, watch its test go red, put the fix back and watch it
go green. A test written after a fix often passes for reasons unrelated to it,
a fixture that already satisfies it, a path the run never reaches. The same
holds for what you write in the review file and the reply: "verified" is said
only of what you saw fail and then pass. Claiming a check you did not make is
the one defect that makes the loop worthless; everything else the next pass
catches.
