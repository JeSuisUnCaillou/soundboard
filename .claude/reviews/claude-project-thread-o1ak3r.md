# Pass 1

Head reviewed: 82ffe82

- bugs: `close` left the site server running and the next `open` reused it, so a show could be played on another clone's code. Fixed in 5b40a09: the stage serves its own checkout on 4174, refuses a port already taken, and stops the server on `close`.
- bugs: the control port ran any POSTed code, from any local caller, and a malformed body killed the stage. Fixed in 5b40a09: a token in a user-only file is required in a header, and a bad body gets a 400.
- bugs: a second `open` launched a browser on the held profile, then crashed on the taken port. Fixed in 5b40a09: the control port is bound first, and a second stage stops with a message.
- architect: no finding.

None of these is in code blocking.md lists (`.claude/skills/` is not), so no second pass.

Reviewed head: 5c601610b071f9e303cf0d1bae45a6442bc540fc
