# Pass 1

Head reviewed: 82ffe82

- bugs: `close` left the site server running and the next `open` reused it, so a show could be played on another clone's code. Fixed in 5b40a09: the stage serves its own checkout on 4174, refuses a port already taken, and stops the server on `close`.
- bugs: the control port ran any POSTed code, from any local caller, and a malformed body killed the stage. Fixed in 5b40a09: a token in a user-only file is required in a header, and a bad body gets a 400.
- bugs: a second `open` launched a browser on the held profile, then crashed on the taken port. Fixed in 5b40a09: the control port is bound first, and a second stage stops with a message.
- architect: no finding.

None of these is in code blocking.md lists (`.claude/skills/` is not), so no second pass.

Reviewed head: 5c601610b071f9e303cf0d1bae45a6442bc540fc

# PR #102, pass 1

Head reviewed: 06eefb2

- bugs: driving.md did not say a second stage needs its own `--out`, so two would share a profile. Fixed in 6365b81.
- bugs and architect: the `need` label the skill files with does not exist yet. Fixed in 6365b81: the skill makes it when missing.
- architect: driving.md said 4174 as if it were the only site port. Fixed in 6365b81.
- architect: a play-the-show line edited past 80 columns. Fixed in 6365b81.

All text, none blocking, so no second pass.

Reviewed head: 6365b81cce0bebbdff7c4ecbe717c175946af4e9

# PR #105, pass 1

Head reviewed: 695ea08

No finding from either reviewer.

Reviewed head: 695ea08acd84e2604e8ee4e487344320b26edf68

# PR #118, pass 1

Head reviewed: e24e2f2

- architect: `PadEditor.save` kept an unused `board` and three blank lines from the removed clash check. Fixed in 9e1eaf0.
- architect: manifest.webmanifest still described pads "with keys". Fixed in 9e1eaf0.
- architect: the comments at the top of app.js and on `TYPED` described letters firing pads. Fixed in 9e1eaf0.
- architect: docs/status.md had a line past 80 columns and an old review date. Fixed in 9e1eaf0.
- bugs: no finding. Leftover references, old boards loading, the pad grid and the tests were all checked.

All text or dead code, none blocking, so no second pass. The owner asked for the change, but it alters a rule of docs/decisions.md and removes a control, so it waits for the owner (step 7).

Reviewed head: 9e1eaf0479f0cf06dc6a236de274889b37ec948c
