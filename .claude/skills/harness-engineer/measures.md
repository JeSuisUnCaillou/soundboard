# Measures

Read at steps 1, 2 and 7 of the pass, and at step 6 by `splitting-a-file.md`.
Every figure in an audit comes from one of these commands or queries; a figure
nothing here returns does not enter a finding. Dated baselines live in the
audits, never here.

## Contents

- The shape of the harness
- Sessions and cost
- PRs and CI
- Controls

## The shape of the harness

```sh
python3 .claude/skills/harness-engineer/scripts/shape.py --since "$SINCE"   # one row per skill, `!` on a threshold crossed
python3 .claude/skills/harness-engineer/scripts/shape.py --duplicates       # paragraphs found in two files
git log --since="$SINCE" --name-only --format= -- .claude CLAUDE.md | sort | uniq -c | sort -rn   # what keeps being touched
```

The fresh clone of a cloud session can be shallow: if `git log` stops short of
the window, `git fetch --unshallow origin main` first.

The thresholds are those of `how-we-write.md`. A harness file touched in every
session is the surest sign of a structure problem: a sentence gets added where a
section should move, or a check should replace it.

## Sessions and cost

From `list_sessions`, keeping the soundboard sessions of the window
(`evidence.md`):

- **sessions**: their number, by `origin` and by `status_bucket`; a `failed`
  one is read.
- **cost**: `external_metadata.usage.cost_usd` per session, its median and
  total; and `cache_write_tokens` against `cache_read_tokens`, since a session
  that keeps rewriting its cache is one that kept waiting.
- **user corrections**: read by hand in the `user` events and the threads, never
  counted by keyword.

## PRs and CI

With the GitHub MCP tools:

- **pushes per PR**: the commits of each PR merged or closed in the window
  (`pull_request_read`, method `get_commits`), median and max.
- **red then green**: the `e2e.yml` runs of each PR (`actions_list`), and what
  turned them green, from the commit that followed.
- **open `harness` issues** at the end of the window (`list_issues`,
  `labels: ["harness"]`), and those whose check date is past.

## Controls

Run at step 7, all of them, in the pass:

```sh
# paths cited by the harness and missing from the repository, this skill excluded
# since it quotes paths as examples; what follows a ~/ is outside the repository
grep -ohE '(^|[^~/])(\.claude|e2e|js|css|docs|\.github)/[A-Za-z0-9_./*-]+' CLAUDE.md \
  $(ls .claude/skills/*/*.md 2>/dev/null | grep -v harness-engineer) \
  | sed -E 's/^[^.ejcd]//; s/[.,)]*$//' | grep -v '\*' | sort -u \
  | while read p; do [ -e "$p" ] || echo "missing: $p"; done
# relative markdown links resolve from each file's own folder
for f in CLAUDE.md .claude/skills/*/*.md; do d=$(dirname "$f")
  grep -oE '\]\([^)#h][^)]*\)' "$f" | sed -E 's/^\]\((.*)\)$/\1/; s/#.*//' \
  | while read l; do [ -z "$l" ] || [ -e "$d/$l" ] || echo "$f -> $l"; done; done
# siblings are linked one level deep: a sibling that links another sibling
grep -lE '\]\([a-z-]+\.md\)' .claude/skills/*/*.md | grep -v SKILL.md
# the shape
python3 .claude/skills/harness-engineer/scripts/shape.py
```

A template (`YYYY-MM-DD-`, `<name>`) comes out of the first control naturally;
what counts is a real path that no longer exists.
