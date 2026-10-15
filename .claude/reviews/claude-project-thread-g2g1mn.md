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
