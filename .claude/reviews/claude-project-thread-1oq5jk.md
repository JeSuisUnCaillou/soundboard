# Pass 1 (flaky fade-out test, #67)

Head: ff5d07b

- bugs: the comment and commit said the pad comes back from where the fade got to; engine.start seeks to trimStart, so it restarts from the top, and the rewrite dropped that check: fixed in c899e10. The test now checks restart from the top with margin, and fails without the seek (tried).
- architect: no finding.

# Pass 2

Head: 0489ee3

- bugs: no finding; noted the restart check leaves about a second of room, and judged it not worth a finding (40 in 40 under four workers).
- architect: no finding.

Reviewed head: 0489ee3d5e8e909340298ae034978194c126a401
