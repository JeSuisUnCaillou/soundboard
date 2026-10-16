# Pass 1

Head reviewed: fb40631

- engine.js: "fading after a stop" tested twice, in fire() and state(): fixed in b251e28 (`_fadingOut(i)`), not blocking.
- architecture.md said a take-back always ramps over the fade in, but a pad with no fade in is set at once: doc fixed in b251e28, not blocking.
- App.tapped is keyed by pad index, so a moved pad might share a 300 ms window: rejected, pads move only in edit mode and the window is a fraction of a second.

No blocking finding: one pass.

Reviewed head: b251e28a81541c16711058137514eba0e36168e6
