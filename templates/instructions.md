# dnw workflow

This project uses **dnw** (dev-nickole-workflow): spec-driven development + TDD, enforced by the `dnw` CLI.
Run dnw commands as `{{dnw}} <command>`. Never use plain `npx dnw`, which could download an unrelated package.

## Project docs

- `{{architecture}}`: system architecture and technical decisions
- `{{products}}`: product context, users, goals
- `{{designSystem}}`: UI components, tokens and patterns. Reuse these in UI specs.
- `docs/specs/`: one Markdown file per spec, e.g. `0001-user-login.api.md` and `0001-user-login.ui.md`

Read the relevant docs before drafting a spec or writing code.

If one of these docs still contains `<!-- fill: ... -->` hints, it is an unfilled template. Before drafting specs,
help the user fill it in: ask about each section, write their answers into it, and delete each hint once its section is
done. If a doc is missing, `dnw docs add` creates its template. `dnw status` lists the docs that still need filling.

## Specs

- Two types: `api` (endpoints, data models, errors) and `ui` (screens, components, states, flows).
- A feature's UI and API specs share an id. The UI spec depends on the API spec.
- Lifecycle: `draft` → `review` → `active` → `done`, or `superseded`.
- Tasks live in the spec's `## Tasks` section: `- [ ] T1: <what> (test: <path>)`. Each task has exactly one test file.

## Rules

- Never edit `status`, `approvedBy`, `supersededBy` or task checkboxes by hand. Use `dnw` commands.
- Never run `dnw spec activate`. A human approves specs.
- Implement only tasks of `active` specs, one task at a time.
- When unsure what to do next, run `dnw status`.
- If `dnw status` says onboarding is not done, run `dnw onboard` and work through its steps with the user before
  anything else.
- Change this project's skills in `.dnw/skills/`, then run `dnw skill sync`. Never edit the copies in `.claude/skills/`
  or `.agents/skills/` that dnw manages.

## Commands

- `dnw onboard`: a checklist for learning this project: read the code, write the docs, ask the user about gaps.
  Run `dnw onboard --done` when finished.
- `dnw spec new "<title>" --type api|ui [--id <id>]`: create a draft. Then fill every section and the task list.
- `dnw spec review <ref>`: draft → review, once every section and task is filled in.
- `dnw spec done <ref>`: after every task is done.
- `dnw spec supersede <ref> --by <ref>`: mark a spec as replaced.
- `dnw docs add [architecture|products|design-system]`: add fillable templates for missing docs. Never overwrites.
- `dnw skill new <name> --description "<what it does and when to use it>"`: create a project skill.
- `dnw skill edit <name>`: show which file to edit. A shared skill gets a project copy first.
- `dnw skill sync`: check skills and copy changes to each AI tool. `dnw skill list` shows them all.

## Per-task loop (SDD + TDD)

1. `dnw task start <ref> <taskId>`
2. Write the test at the task's test path, from the spec's acceptance criteria.
3. `dnw task red <ref> <taskId>`: the test must fail. Single-test command: `{{testFileCommand}}`
4. Implement the minimum code to make it pass.
5. `dnw task done <ref> <taskId>`: the task test and the full suite (`{{testCommand}}`) must pass.
6. Continue with the next task shown in the output.
{{workflowSection}}{{superpowersSection}}