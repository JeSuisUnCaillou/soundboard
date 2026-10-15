# Pass 1

Head: 4916d2252f3ce27b9f9ddde512aabf67f61d8571

- bugs: no finding (checked that each new test fails if the behaviour it names breaks).
- architect: no finding.


# Pass 2

Head: 691ebe97664443a02912747863a24d1f372392f1

Rebased on main for the merge; the change itself is the same apart from the test count in docs/status.md and the merged docs/testing.md rows. Not reviewed again; suite green locally (99 passed, 8 skipped by design; one test lost its browser at launch and passed on its own).

Reviewed head: 691ebe97664443a02912747863a24d1f372392f1
