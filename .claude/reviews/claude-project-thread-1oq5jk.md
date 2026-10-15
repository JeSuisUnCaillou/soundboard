# Pass 1 (flaky fade-out test, #67)

Head: ff5d07b

- bugs: the comment and commit said the pad comes back from where the fade got to; engine.start seeks to trimStart, so it restarts from the top, and the rewrite dropped that check: fixed in c899e10. The test now checks restart from the top with margin, and fails without the seek (tried).
- architect: no finding.

# Pass 2

Head: 0489ee3

- bugs: no finding; noted the restart check leaves about a second of room, and judged it not worth a finding (40 in 40 under four workers).
- architect: no finding.

# Pass 3

Head: b608618

Rebased on main for the merge. Main (#60) had loosened the same test to accept any clock reading from -0:19 to -0:23; this branch's version replaces it, since it also checks the pad starts again from the top. Nothing else changed. Not reviewed again; suite green locally (123 passed, 11 skipped).

Reviewed head: b608618533e1ecd36023f0d1c0d9468c2711e200
