# Pass 1

Head: cafc2c4c000c905699849ad5d7784ba882135931

- bugs: no finding (checked that each new test fails if the behaviour it names breaks).
- architect: no finding.


# Pass 2

Head: ca3d2bbd4548f34984e8d94c483f80df5de609e5

Rebased on main for the merge; the change itself is the same apart from the test count in docs/status.md and the merged docs/testing.md rows. Its solo test was dropped, since #49 already covers solo. Not reviewed again; suite green locally (78 passed).


# Pass 3

Head: cf96bf29482afbad0b0d16594221a99efa657401

Rebased on #53, which moved the pad pencil beside its pad; the level-and-colour test now opens the sheet through the `pencil` helper. No other change. Suite green locally (92 passed; one test lost its browser at launch and passed on its own).

Reviewed head: cf96bf29482afbad0b0d16594221a99efa657401
