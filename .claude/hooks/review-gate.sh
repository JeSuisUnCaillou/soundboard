#!/bin/sh
# Stop hook: keeps a session from ending its turn on a branch whose work is
# pushed but has not been through the review loop since it last changed.
# It stays out of the way everywhere else: on main, with uncommitted or
# unpushed work (the implementation is not over), and on a branch whose files
# have not changed since the head its review file names.

input=$(cat)

# The hook already refused once in this turn: let it end, so it never loops.
printf '%s' "$input" | grep -q '"stop_hook_active" *: *true' && exit 0

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
branch=$(git symbolic-ref --quiet --short HEAD 2>/dev/null) || exit 0
[ "$branch" = main ] && exit 0
[ -z "$(git status --porcelain 2>/dev/null)" ] || exit 0
# Compared with origin's copy of the branch, however it was pushed.
pushed=$(git rev-parse -q --verify "refs/remotes/origin/$branch" 2>/dev/null) || exit 0
[ "$pushed" = "$(git rev-parse HEAD)" ] || exit 0
base=$(git merge-base HEAD origin/main 2>/dev/null) || exit 0

outside_reviews() { git diff --quiet "$1" HEAD -- . ':(exclude).claude/reviews'; }

# Nothing but review files differs from main: nothing to review.
outside_reviews "$base" && exit 0

file=".claude/reviews/$(printf '%s' "$branch" | tr / -).md"
reviewed=$(sed -n 's/^Reviewed head: \([0-9a-f]\{7,40\}\).*/\1/p' "$file" 2>/dev/null | tail -n 1)
if [ -n "$reviewed" ] && git cat-file -e "$reviewed^{commit}" 2>/dev/null \
  && outside_reviews "$reviewed"; then
  exit 0
fi

printf '%s\n' '{"decision": "block", "reason": "This branch is pushed and has changed since its last review pass. Before handing it over, run Skill(skill: \"review-loop\") on it; it ends by recording the reviewed head in its review file under .claude/reviews/. If the pull request of this branch is already merged or closed, say so and end the turn instead."}'
