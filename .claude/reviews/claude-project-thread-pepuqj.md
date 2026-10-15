# Pass 1

Head reviewed: b3ae2b73230b20c8b98c876c8e86cdb7191d36eb

- bugs: a saved board with `default/crickets ambiance.wav` or `default/sexy.mp3` loses those pads after the deploy. Crickets: fixed in 625d408 (`migratePad` moves the old path to `default/crickets.mp3`, with a test seen red without it). Sexy: left to the user, since it has no replacement on the new board and mapping it to another track would play the wrong file.
- bugs (minor): a double tap on Load the default board runs `layDefault` twice. Rejected: the second run finds the pads taken and changes nothing.
- architect: `docs/testing.md` restated each pad's setup, which `bundled.js` owns. Fixed in 1f99b7a.
