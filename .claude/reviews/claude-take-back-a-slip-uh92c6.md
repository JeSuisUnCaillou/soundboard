# Pass 1 (PR #130, layering pads skip the double-tap window)

Head reviewed: cea1a3f

- decisions.md quoted the owner in French against CLAUDE.md § English only: fixed in 3ed4a11, not blocking.
- A second tap that lands while a pad's very first tap is still unlocking audio restarts the channel instead of layering: rejected, a race older than the branch (the 300 ms window hid it), on the first tap of a session only.

No blocking finding: one pass.

Reviewed head: 3ed4a11d71858e5c33d3e9974608ea16ad87c8c1
