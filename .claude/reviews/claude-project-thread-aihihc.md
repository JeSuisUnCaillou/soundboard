# Pass 1

Head: 10d02f2029857adc40722b48c7060f759033977a

- bugs: no finding.
- architect: no finding. Its optional note on the README line wrap is rejected as a matter of taste.


# Pass 2

Head: after merging main (d598041).

- architect: the tree-to-pad drop tests in drag.spec.js repeated main's in edit.spec.js and split the concept across two specs; fixed in 65e8a4c (empty-pad test moved to edit.spec.js, filled-pad test dropped, testing.md row fixed).
- bugs: no finding.
- Not from the reviewers: storage.spec.js's "fails once" test (from main) failed once under a full local run; filed as #76.


# Pass 3

Head: 9cd3e34 (main merged again, refused Reconnect and out-of-room tests added).

- bugs: the out-of-room test could fill the browser before the first sound's copy was written; fixed in 6c88da1 (reload first, so the copy is known kept).
- architect: kept.spec.js's Reconnect test and missing-pad test repeated board.spec.js's and edit.spec.js's; fixed in 6c88da1 (both dropped, the missing-pad toast moved into edit.spec.js). Stray blank line in drag.spec.js fixed there too.
- architect: the Reconnect stubs are written in both board.spec.js and kept.spec.js; left, since they model different permission states and a shared helper would serve two callers.
- Not from the reviewers: the browser sometimes closes between offline.spec.js and storage.spec.js, on main's tests too; filed as #78.

# Pass 4

Head: 6c88da1

- bugs: no finding.
- architect: no finding.

Reviewed head: 6c88da121e3b3e0b9c201997681bd43a3e719519
