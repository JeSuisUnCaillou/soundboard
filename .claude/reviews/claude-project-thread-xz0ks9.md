# Pass 1

Head reviewed: d0ff645

- bugs: `review-loop/SKILL.md` step 7, merging `main` into a converged PR
  leaves `expectedHeadSha` on the old head and the review file stale; fixed
  in d85e7cb (the merge goes round the loop once more).
- bugs, architect: the added line in `reviewers.md` ran past 80 columns;
  rewrapped in d85e7cb.
- architect: no other finding.

Both findings were text, so not blocking: no second pass.

Reviewed head: 14d14717bc10b17dca4f758d233bb2cd991aa399
