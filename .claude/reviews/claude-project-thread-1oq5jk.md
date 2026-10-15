# Pass 1 (flaky fade-out test, #67)

Head: ff5d07b

- bugs: the comment and commit said the pad comes back from where the fade got to; engine.start seeks to trimStart, so it restarts from the top, and the rewrite dropped that check: fixed in c899e10. The test now checks restart from the top with margin, and fails without the seek (tried).
- architect: no finding.
