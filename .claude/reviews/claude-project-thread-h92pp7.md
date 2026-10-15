# Pass 1

Head reviewed: faf683b.

- Missing test for the entries path of a drop (two folders and a loose sound without handles): blocking, fixed in 582d2a1.
- Latin Extended font files not precached, so accented names look different offline on a first offline load: fixed in 582d2a1.
- A dragged pad dims but its pencil, now a sibling, does not: fixed in 582d2a1.
- The 3 s patience written in the architecture files table and its Offline section: fixed in 582d2a1 (the table no longer says it).
- status.md says 31 tests, reviewer counted 29: rejected, `playwright test --list --project=desktop` lists 31 (32 after this pass).
- No test drags a sound or a pad over the pencil's corner (`padOf`): not blocking, the pencil keeps the drop target it had inside the pad; dragging pads is the test gap of #7.

# Pass 2

Head reviewed: 69bcacd.

- decisions.md and architecture.md both state the 3 s patience: not blocking, fixed in 6685c74 (decisions.md links to § Offline).
- padOf() relied on the pencil coming right after its pad: not blocking, fixed in 6685c74 (it looks the pad up by number, as the click does).
- Nothing blocking found; the loop converged.

# Pass 3

Head: 28732c9, a merge of main (#49) with only a docs/testing.md conflict, resolved by keeping both sides' rows. No reviewers run: the branch's own code is unchanged since pass 2, and the whole suite passes on the merge (35 tests, 70 runs).

# Pass 4

Head: 6a7822f, a merge of main (#47): conflicts in docs and in the imports of e2e/edit.spec.js, and #47's new test reached the pencil inside its pad, now through `pencil()`. No reviewers run: the branch's own code is unchanged since pass 2, and the whole suite passes on the merge (36 tests, 72 runs).

Reviewed head: 6a7822f62e658d581f5de8cbc9ab34f68d5b6b6c
