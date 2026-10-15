# Splitting a harness file

Read at step 6 when a shape finding (`shape.py`, a `!`) names a file, which
here is a `SKILL.md` or `CLAUDE.md`. A split **moves** sections without
rewriting their sentences; what is new is the transitions and the pointers. One
file per pass unless asked; one commit per file.

1. **Read the whole file, and note for each section**: its responsibility in a
   sentence, its nature (steps, reference, template, commands, anecdote,
   guardrail), what it repeats from another file (`grep`, line quoted), and its
   fate: *kept*, *moved to `<sibling>`*, *replaced by a pointer to `<X>`*,
   *removed* (no-op, repeat of `<X:line>`, surplus anecdote whose rule stays at
   `<line>`). The fate follows `where-each-fact-goes.md` and the moment the
   section is read: what every run reads stays, what one step reads becomes a
   sibling, what two skills do becomes a skill.
2. **Create the siblings by moving sections**: the old text, unchanged, under a
   heading that says at which step it is read ("Read at step 4") and, past 100
   lines, a `## Contents`. A sibling is linked from the step that names it, by
   its relative path, one level only.
3. **Rewrite the main file from its kept sections**, in step order; each step
   ends on what says it is done and names the sibling or skill it calls. The
   description drops under 400 characters, the guardrails under five.
4. **The register**: `python3 .claude/skills/harness-engineer/scripts/shape.py --register <rev>:<path>`
   lists the paragraphs of the old file it cannot find in the tree. Each one is
   a removal, and the commit message justifies it in one line: no-op, repeat,
   surplus anecdote, figure moved to an audit. A paragraph missing from both
   the register's justification and the message is a lost rule.
5. **The controls** of `measures.md` § Controls, plus what the file has of its
   own: an anchor that `CLAUDE.md` or the README links follows in the same
   commit.
6. **Replay the failure**: for each dated rule of the file, reopen the audit
   that wrote it and check that at the step where the defect happened, the file
   that now carries it would have been read. A rule no sibling gets read at the
   right moment goes back into the main file.
7. **File the impact check** as a `harness` issue: each sibling read at least
   once in five runs at its step (read in the sessions with `list_events`, by
   the `Read` calls on its path), with the baseline, the date and the fallback:
   **a sibling never read goes back up, its section as it was**.
