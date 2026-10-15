# Where each fact goes

Read at step 4 of the pass, and at step 6 by
`splitting-a-file.md`, for each memory as for each new
rule. **A fact has one place**, the one that is loaded when it is needed; any
other place only points to it.

| The fact says… | It goes in | Examples |
| --- | --- | --- |
| how to do one thing, at one step | the skill that does that step: its `SKILL.md` if every run reads it, a sibling if one step alone does | "how to read past sessions" → `harness-engineer/evidence.md` |
| a move that two skills make | a skill that both call with `Skill(skill: "…")` | none yet; created only with two callers on record |
| a convention for all work on the repository, whatever the task | `CLAUDE.md`, and then as much comes out of it as goes in | "every change in behaviour comes with an e2e test", "hand over the raw.githack link" |
| what a check could verify instead of a sentence | a test in `e2e/`, a CI step, `.claude/settings.json`: **proposed**, not written, except an e2e test a finding calls for | "do not push with the suite red" → already enforced by `e2e.yml` and `pages.yml` |
| what the cloud container needs at start | the environment's setup script or a SessionStart hook: **proposed in the report**, the user changes it in the environment's settings | `npm install` before the suite, the Playwright browser path |
| a convention for every session of the Claude project, not only this repository | the project instructions: **proposed in the report**, the user edits them in the project's settings | "track work with GitHub issues" |
| what the user expects of the conversation itself | stays a memory | "act without asking first", "keep replies short on the phone" |
| a fact about the outside world that goes stale | a memory, dated | a browser's support for the File System Access API |
| a measured figure | the audit that measured it; a skill points to the audit | cost per session, pushes per PR |
| a rule about writing the harness itself | `how-we-write.md`, since this is the only skill that edits these files | "no threshold in percent in a skill" |

Two tests settle it quickly:

- **Could a session that never had this conversation need it?** If so, a memory
  is not enough: a subagent does not read memory, and a new session rereads
  only the index. That is almost everything that starts with "when we ship",
  "when we test", "when we open a PR".
- **Is the fact true in another environment?** If not, it goes in no versioned
  file. A container path, a memory folder's path, a session id do not enter a
  skill.

## Bringing a memory home takes two steps

Because the PR is not merged when you finish. In the pass, the fact goes into
the versioned file and the memory **keeps its content**, since a session opened
tomorrow would otherwise read a pointer to a file `main` does not have yet, but
gets this line at the top:

```md
> **Canonical version**: `.claude/skills/<name>/SKILL.md` in the repository. If the two differ, the repository wins.
```

After the merge, the memory is edited down to that one line and its line leaves
`MEMORY.md`. Your report lists them, and so does a `harness` issue, which the
first pass after the merge does: a move whose only trace is a reply never
happens. A memory that holds something only the conversation needs (the "why"
of one of the user's preferences) keeps that part and loses the rest.
