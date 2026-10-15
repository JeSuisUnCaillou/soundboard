# Pass 1

Head: cafc2c4c000c905699849ad5d7784ba882135931

- bugs: no finding (checked that each new test fails if the behaviour it names breaks).
- architect: no finding.


# Pass 2

Head: ca3d2bbd4548f34984e8d94c483f80df5de609e5

Rebased on main for the merge; the change itself is the same apart from the test count in docs/status.md and the merged docs/testing.md rows. Its solo test was dropped, since #49 already covers solo. Not reviewed again; suite green locally (78 passed).

Reviewed head: ca3d2bbd4548f34984e8d94c483f80df5de609e5
