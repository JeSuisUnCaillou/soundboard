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


# Pass 5

Head: eaa5dad (CI on 6c88da1 failed main's Reconnect test as flaky: a pad set just before a reload was lost; filed #79, fixed by saving at once on put, move and resize).

- bugs: the move path had no test that fails without the fix; fixed in d434a03 (drag.spec.js, seen red with queueSave and green with saveNow).
- architect: no finding.

# Pass 6

Head: d434a03

- bugs: no finding (left out as low-confidence: on a very slow runner the debounce could fire before the reload, so the new tests could pass without the fix; they cannot fail with it).
- architect: no finding.


# Pass 7

Head: 195ea09 (main's twelve-sound first board merged; tests adapted to it).

- bugs: "layers a short sound over itself without being told to" passed on the Default board's own Gunshot setting, not the length rule; test dropped in d17e249.
- architect: makeRoom written in drag.spec.js and kept.spec.js with different meanings; one helper in helpers.js, in d17e249. main's inline copies in edit.spec.js left as they predate the branch.

# Pass 8

Head: 59fa23c (CI on 195ea09 failed on a Chromium crash in main's offline tests, #78; the service worker network switch moved into offline.spec.js, in a worker of its own).

- bugs: no finding (checked in Playwright 1.56.1's sources that the file gets its own worker and the switch reaches no other spec).
- architect: no finding.

Reviewed head: 59fa23c87a111cc2d463fabbb97aba5b73d65433
