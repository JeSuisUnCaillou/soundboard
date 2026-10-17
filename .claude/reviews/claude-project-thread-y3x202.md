# Pass 1

Head reviewed: fb28c4d6a85a8ea08ad8ebc9b6f255bd63fade02

- bugs: play-the-show driving.md still said five seconds. Fixed in 408b865 (text, not blocking).
- bugs: the phone assertion depends on Pixel 7 emulating a coarse pointer. Rejected: the phone test passes locally and fails without the fix.
- architect: the sheet's focus rule lived only in a comment. Fixed in 408b865 with a line in docs/architecture.md (text).
- architect: PadEditor reads matchMedia itself instead of App passing a flag. Rejected: a local, read-once detail of how the sheet opens, not a decision about the board; nothing else needs it.

No blocking finding; the loop converged in one pass.

Reviewed head: 408b8653fd7ab6643be3c2b268c4a79c639e6fd6
