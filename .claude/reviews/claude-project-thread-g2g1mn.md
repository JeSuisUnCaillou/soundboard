# Review of claude/project-thread-g2g1mn

# Pass 1

Head reviewed: 171696461e1ad5dc278a83832f8693338472bba5. Reviewers: the first
version's correctness, simplicity and docs (the diff touched `.md` files).

- `.claude/hooks/review-gate.sh`: a branch pushed without `-u` has no upstream,
  so the hook let it end unreviewed. Blocking, fixed in 9ecd791; the old hook
  allowed such a branch and the new one blocks it, run both ways in a scratch
  repository.
- `reviewers.md` and `not-converging.md` linked each other, against
  `how-we-write.md` § The shape of a skill (found by two reviewers). Not
  blocking; gone with `not-converging.md` in 4b9e152, which also made the skill
  lighter at the user's request.

# Pass 2

Head reviewed: 069401f861a91824c8f2de24822a8069cb0ec262. Reviewers: bugs and
rules, the light version's two.

- bugs: no finding. It traced the hook's exits, the `stop_hook_active` guard
  and pass 1's fix by reading.
- rules: the review file had no `Reviewed head:` line, so the hook kept
  refusing. Rejected: the file was open on purpose until the loop closed it at
  step 6, which this line does.

After this pass and without a new one, since it is text in a skill: the second
reviewer became the architect, at the user's request (d00f1e1).

Reviewed head: d00f1e16ebb0b41d5091f387615155a078c18736

# Pass 3

Head reviewed: 0e86ab58fa5a612b620ff72350b3dc04b4af31ac, after step 7 (auto-merge
of bug fixes, the user's choice) was added. Reviewers: bugs and architect.

- bugs: an armed auto-merge, or a merge on the CI-green event, would take
  commits pushed after the review. Text in a skill, so not blocking by
  `blocking.md`, but it decides what ships: fixed in d9fa447, merge pinned to
  the reviewed commit with `expectedHeadSha`, no auto-merge armed.
- bugs: "the harness waits" caught every PR, since each commits its review
  file under `.claude/`. Fixed in d9fa447: the test is now the list of files a
  shippable diff may touch.
- bugs: `docs/deployment.md` said only the owner merges. Fixed in d9fa447.
- bugs: the fallback needed the session to watch the PR. Fixed in d9fa447, step 7
  says to subscribe.
- architect: no finding.

No blocking finding: the loop stops here.

Reviewed head: d9fa4479771cdbb51fb54f61691983779b30063c

# PR #65, pass 1

Head reviewed: b733d05, the merge rule widened to everything but medium-to-big
features. Reviewers: bugs and architect.

- Both: `CLAUDE.md` § Periodic review still said the harness PR waits for the
  owner. Text, not blocking; fixed in 70b5f34.
- architect: `CLAUDE.md` § Who merges restated step 7 without its conditions.
  Text, not blocking; fixed in 70b5f34, it now only points to step 7.

No blocking finding: the loop stops here.

Reviewed head: 70b5f3442e5679a23034f2651a9c84969cb30edc

# PR #69, pass 1

Head reviewed: 8ef8baf, leftovers weighed at the end of the work. Reviewers:
bugs and architect.

- bugs: no finding.
- architect: the kinds of leftovers were listed in both `CLAUDE.md` and step 8,
  already differently. Text, not blocking; fixed in 3371c68, `CLAUDE.md` points
  to step 8.

No blocking finding: the loop stops here.

Reviewed head: 3371c682dafb25f772d8bba7c106da3ad87af0c2
