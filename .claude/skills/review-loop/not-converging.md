# When the loop does not converge

Read at step 3 before fixing a blocking finding that looks like an earlier
one, and at step 5 from the fifth pass.

Compare the finding with the earlier passes **in the review file**, not with
your memory of the conversation, which may have been summarised. Three shapes:

- **Rebound (A → A)**: the fix of A did not hold; the same finding is back.
- **Oscillation (A ↔ B)**: fixing A brought B, and fixing B as usual would
  bring A back. Two constraints pull against each other.
- **Ratchet (A₁ → A₂ → A₃)**: the same rule, rightly fixed each time, found
  again one step further: one more caller, one more state, one more kind of
  pad. Each fix looks right on its own, which is what makes it costly.

**The trigger is the second extension, not the fifth.** As soon as the same
rule is fixed a second time somewhere else, stop fixing at the site and look
for its general statement where it is owned: the README, `docs/decisions.md`,
the Web Audio or File System Access contract. The rule that closes every level
at once is usually already written there, about the result rather than the
shape of the data.

In all three cases, do not try one more local fix:

1. Set what A needs beside what B (or the first A) needs, and why a local fix
   of one undoes the other.
2. Look for a change that satisfies both, even a wider one. If there is one,
   apply it as a normal fix; the next pass may be the narrow check
   `reviewers.md` allows, with the question it checks named in the review file.
3. If none satisfies both, stop and ask the user with `ask_decision`: what each
   option costs, why they cannot both hold, what was tried.

**Five passes without convergence**, even with findings that look unrelated:
stop and tell the user. Past that, something is more likely escaping the
method than converging slowly. Give them what to decide with: how many passes,
what each found, and that one more pass costs as much as the last one did.
