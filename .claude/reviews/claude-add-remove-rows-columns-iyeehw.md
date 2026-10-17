# Pass 1

Head reviewed: 4356b08 (first design: Add/Remove column and row at the edges).

- architect: `growOrShrink` restated the pad geometry instead of `rowCol` — fixed in the working tree, then superseded: Caillou asked for a new design (a bin per row and column, one + in the corner) before it was pushed, built in 4d3295e.
- bugs: no finding.

# Pass 2

Head reviewed: 4d3295e (bins per row and column, one + in the corner).

- bugs: an armed bin removed sounds added to its line after the first tap, which the toast never named — fixed in c6d7c63 (the second tap must match the named sounds; test fails without it, seen red).
- architect: the armed bin marked twice (DOM poke in app.js and drawGrid's option) — fixed in c6d7c63 (one path: binArmed and a redraw).
- architect: board limits decided in ui.js — fixed in c6d7c63 (app.js passes `can`).
- architect: docs/testing.md coverage row not updated, status.md list too long — fixed in c6d7c63.

# Pass 3

Head reviewed: c6d7c63. No finding from either reviewer.

Reviewed head: c6d7c63bbc9f3005bbd95c0e14c4ec356291ffe7
