# Blocking or not

Read at step 2, before classifying the first finding of a pass. You decide,
on the code the finding cites. Too wide and the loop goes round on comfort,
too narrow and a bug ships; in real doubt, not blocking. Every confirmed
finding is fixed; only a blocking one forces another pass.

**Blocking**, only in code (`index.html`, `css/`, `js/`, `sw.js`, `e2e/`,
`.github/`, `.claude/hooks/`):

- a bug an operator or a session would meet;
- a change of behaviour with no end-to-end test that fails without it;
- code that breaks a rule of `docs/decisions.md` § Product;
- anything that would turn CI red.

**Not blocking**, everything else, including code in the wrong module or an
import against the direction `docs/architecture.md` sets, unless it is also a
bug: it measures a debt, not a risk mid-show, and blocking on it would send
the loop round on design. Fix it all the same. Also any error in text (a
comment, a doc, a skill, even a false statement), a fact written twice,
something missing from a doc, style, naming, structure.

**The most mechanical fix wins**: delete rather than rephrase, link to the
file that owns a fact rather than restate it. Every new line written to answer
a finding is a new chance of a finding at the next pass. A fix that states an
outside fact (a browser's behaviour, an API's contract) is checked at the
source as you write it.
