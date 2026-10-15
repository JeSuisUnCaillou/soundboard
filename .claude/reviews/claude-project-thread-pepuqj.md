# Pass 1

Head reviewed: b3ae2b73230b20c8b98c876c8e86cdb7191d36eb

- bugs: a saved board with `default/crickets ambiance.wav` or `default/sexy.mp3` loses those pads after the deploy. Crickets: fixed in 625d408 (`migratePad` moves the old path to `default/crickets.mp3`, with a test seen red without it). Sexy: left to the user, since it has no replacement on the new board and mapping it to another track would play the wrong file.
- bugs (minor): a double tap on Load the default board runs `layDefault` twice. Rejected: the second run finds the pads taken and changes nothing.
- architect: `docs/testing.md` restated each pad's setup, which `bundled.js` owns. Fixed in 1f99b7a.

# Pass 2

Head reviewed: ca75c6c4e587d1a45a193fe7195137d40c129982

- No finding from either reviewer.

Reviewed head: ca75c6c4e587d1a45a193fe7195137d40c129982

# Pass 3

Head reviewed: 9476a33 (after merging main), then 97319ad9e7f8b237fca31ab6b6957fbe8ec8e54b

- architect: `docs/architecture.md` and `docs/testing.md` kept conflict markers from the merge. Fixed in 97319ad, keeping both sides (main's `primeAll()` wording and `pencil` helper, the branch's `loadDefault` and twelve-title row).
- bugs: no finding; the suite (98 tests) passes, and main's adapted tests still test what they were written for.

Reviewed head: 97319ad9e7f8b237fca31ab6b6957fbe8ec8e54b

# Pass 4

Head reviewed: a10cc7e (after merging main again)

- architect: Phone and Sting (over 5 s, gel `daylight`) would turn green when `measure()` runs. Rejected: `place()` measures each pad in `padFor` before `layDefault` applies its setup, and `measure()` only touches pads with no duration. Pinned by a check on Phone's gel and second tap in the setup test, added in f1ae742, which passes.
- bugs: no finding; main's `giveSound`, `write` and `remembered` survive the merge, and the adapted tests still test what they were written for.

Reviewed head: f1ae7421e2ed6e231912f906f3f9708538440f27

# Pass 5

Head reviewed: 65336b58f7b10243cea3e15d27819c8bd19f4e6f

- CI showed the toast test racing the first board's welcome toast; fixed in 65336b5 by raising the board's own toast (emptying it), seen red without the toast's `pointer-events: none`.
- bugs, architect: no finding.

Reviewed head: 65336b58f7b10243cea3e15d27819c8bd19f4e6f

# Pass 6

Head reviewed: dc8a49f (after merging main a third time), then 8c27bf64f0574803cdab6c01a22b034e01cd6898

- bugs: "a pad fading towards its stop point still answers a tap by stopping" set up Crickets, which now loops, so no fade towards the stop point ran. Fixed in 8c27bf6 with `padLoop: false`; the suite passes.
- architect: no finding.

Reviewed head: 8c27bf64f0574803cdab6c01a22b034e01cd6898
