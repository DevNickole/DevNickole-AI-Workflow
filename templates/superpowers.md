
## Superpowers

This project uses superpowers skills inside the dnw workflow:

- Specs and plans live in `docs/specs/`, created with `dnw spec new`. This overrides the superpowers default locations `docs/superpowers/specs/` and `docs/superpowers/plans/`.
- Tasks are the spec's `## Tasks` section, not a separate plan file.
- While a spec is `draft`: use the brainstorming skill to work out and fill in the spec.
- Each task: use the test-driven-development skill inside the dnw task loop.
- Before `dnw task done`: use the verification-before-completion skill.
- Bugs during a task: use the systematic-debugging skill.
- Status changes go only through `dnw` commands, even when a skill suggests otherwise.
- If superpowers skills are not available in this session, tell the user how to install them:
  - Claude Code: accept the superpowers plugin prompt, or run `/plugin install superpowers@claude-plugins-official`
  - Antigravity: `agy plugin install https://github.com/obra/superpowers`
  - Codex: run `/plugins`, search "superpowers", select Install Plugin
