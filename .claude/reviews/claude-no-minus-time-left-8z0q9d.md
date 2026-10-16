# Pass 1

Head reviewed: d6b0736 (the first commit)

- e2e/board.spec.js:193, the fading-pad clock check `/^\d+:\d\d$/` also matched the pad's whole length: fixed in 3cbdd02, it now checks the seconds left fall below the length (seen red with the clock showing the length, green with the fix).
- docs/board.png still shows the old minus on two playing pads: not blocking (an image); left as a leftover issue, since retaking it means staging a show.

# Pass 2

Head reviewed: 3cbdd02

- secondsLeft would read a returning minus as negative seconds: rejected, the anchored checks at board.spec.js:648 and :837 fail on a minus.

Reviewed head: 3cbdd02786862125d442fabdd87bf7f995187bc5
