# Pass 1

Head reviewed: e79c528

- bugs: a sound dropped on a filled pad lost its remembered settings (setPad deleted them): fixed in 4546656, with a test.
- bugs: Empty the board remembering its pads had no test: fixed in 4546656.
- architect: app.js edited the inside of a remembered entry: fixed in 4546656 (`forgetPlaces` in model.js; the delete is gone with the bug fix).
- architect: `resize` sorted and wrapped `back`, which the only caller counts: fixed in 4546656 (a count).

# Pass 2

Head reviewed: 4546656

- bugs: Load the default board recalled what an emptied board's sounds had (second tap, trims, solo) under the default setup: fixed in e027bdc, with a test that fails without it.
- architect: no finding.

# Pass 3

Head reviewed: e027bdc

- bugs: no bug; status.md left the tree-drop tests out of its count of tests that run on one size: fixed in 41a8044.
- architect: the guard in `remember` repeated its callers': fixed in 41a8044.
- architect: `listOf` could live in model.js: rejected, it is toast wording, which app.js decides, and model.js holds no UI copy.

No blocking finding: the loop converged.

Reviewed head: 41a804479e0e69fda6581d0d53d0a50a4136219b
