# Review of claude/project-thread-raujti

PR #60: saving and storage, dropped sounds, tidy-ups and #45 (closes #23 and #45).
(The earlier passes on this branch were for #49, merged.)

# Pass 1

Head reviewed: cd5b5e3695ea29c55ebb6a625c918d5baf744df5

- bugs: giveSound reverted fields on a pad saved from its sheet (blocking) — fixed in 92afc6f, with a test that fails without it.
- bugs/architect: forgotOthers was set before forgetOtherBoards succeeded — fixed in 92afc6f.
- architect: status.md restated a fact architecture.md owns — fixed in 92afc6f (links instead).
- architect: dead list-style on .lib — fixed in 92afc6f.
- architect: model.js row did not list giveSound — fixed in 92afc6f.
- architect: an over-long line in the Saving paragraph — fixed in 92afc6f.
- bugs (caveat): the hidden-page save test also sees pagehide on reload — rejected as a finding: it still fails without the fix (checked).
