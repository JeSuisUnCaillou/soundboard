# Pass 1

Head reviewed: fb40631

- engine.js: "fading after a stop" tested twice, in fire() and state(): fixed in b251e28 (`_fadingOut(i)`), not blocking.
- architecture.md said a take-back always ramps over the fade in, but a pad with no fade in is set at once: doc fixed in b251e28, not blocking.
- App.tapped is keyed by pad index, so a moved pad might share a 300 ms window: rejected, pads move only in edit mode and the window is a fraction of a second.

No blocking finding: one pass.

# Pass 2

Head: a33340d, main (#120) merged in. Conflicts only in docs/status.md (test count, now 95) and docs/testing.md (spec table rows, each side kept); no code of this branch changed. Suite: 172 passed. No finding.

Reviewed head: a33340d1b8c28c30abf68ee06429a22ff323faaf
