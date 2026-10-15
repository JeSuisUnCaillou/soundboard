# Pass 1

Head: 10d02f2029857adc40722b48c7060f759033977a

- bugs: no finding.
- architect: no finding. Its optional note on the README line wrap is rejected as a matter of taste.


# Pass 2

Head: after merging main (d598041).

- architect: the tree-to-pad drop tests in drag.spec.js repeated main's in edit.spec.js and split the concept across two specs; fixed in 65e8a4c (empty-pad test moved to edit.spec.js, filled-pad test dropped, testing.md row fixed).
- bugs: no finding.
- Not from the reviewers: storage.spec.js's "fails once" test (from main) failed once under a full local run; filed as #76.

Reviewed head: 65e8a4c20037bf0d6496291b67755870045bbd83
