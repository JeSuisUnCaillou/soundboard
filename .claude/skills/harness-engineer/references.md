# References for the method

Four texts ground the method; reopen them rather than remember them:

- [What is harness engineering?](https://harnessengineering.academy/blog/what-is-harness-engineering-introduction-2026/)
  — the three pillars: context, constraints, entropy.
- [Harness Engineering](https://martinfowler.com/articles/exploring-gen-ai/harness-engineering.html)
  (Fowler) — what guides before the action against what controls after it.
- [Spécifier, c'est coder](https://yoandev.co/specifier-c-est-coder) — the
  feedback loop: every correction made by hand asks "should it have been in a
  file of the repository?".
- [awesome-harness-engineering](https://github.com/walkinglabs/awesome-harness-engineering)
  gives the rest, including [Better Harness](https://github.com/QoderAI/better-harness),
  which makes session evidence the only basis for a recommendation ("*missing
  or partial evidence remains explicit*").

For the shape of the files themselves:

- [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
  (Anthropic) — `SKILL.md` under 500 lines, description under 1,024
  characters, siblings one level deep, contents past 100 lines.
- [`writing-for-agents`](https://github.com/mattpocock/skills/blob/main/skills/productivity/writing-for-agents/SKILL.md)
  and [`invocation.md`](https://github.com/mattpocock/skills/blob/main/.agents/invocation.md)
  (mattpocock) — context pointers, information hierarchy, no-ops, negation,
  and calling a skill through the tool rather than a `/name` in prose.
- [Writing a good CLAUDE.md](https://www.humanlayer.dev/blog/writing-a-good-claude-md)
  (HumanLayer) — under 300 lines, universal, never a linter's job.

The method itself is adapted from the `harness-engineer` skill of
[numerique-gouv/oots-france](https://github.com/numerique-gouv/oots-france/tree/main/.claude/skills/harness-engineer),
which runs on a local machine; this one runs in cloud sessions driven from the
mobile app.
