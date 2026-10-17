# Pass 1 (PR #130, layering pads skip the double-tap window)

Head reviewed: cea1a3f

- decisions.md quoted the owner in French against CLAUDE.md § English only: fixed in 3ed4a11, not blocking.
- A second tap that lands while a pad's very first tap is still unlocking audio restarts the channel instead of layering: rejected, a race older than the branch (the 300 ms window hid it), on the first tap of a session only.

No blocking finding: one pass.

# Pass 2

Head: 05a37ff, main (#126, #127) merged in. Conflict only in the test count of docs/status.md (now 107); no code of this branch changed. Suite: 195 passed. No finding.

Reviewed head: 05a37ffa85f5def8586ebb918d1633dddc5e49a9
