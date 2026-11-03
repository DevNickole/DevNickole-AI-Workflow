# dnw workflow

This project uses **dnw** (dev-nickole-workflow): spec-driven development + TDD, enforced by the `dnw` CLI.
Run dnw commands as `{{dnw}} <command>`. Never use plain `npx dnw`, which could download an unrelated package.

## Project docs

- `{{architecture}}`: system architecture and technical decisions
- `{{products}}`: product context, users, goals
- `{{designSystem}}`: UI components, tokens and patterns. Reuse these in UI specs.
- `docs/specs/`: one Markdown file per spec, e.g. `0001-user-login.api.md` and `0001-user-login.ui.md`

Read the relevant docs before drafting a spec or writing code.

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

## Commands

- `dnw spec new "<title>" --type api|ui [--id <id>]`: create a draft. Then fill every section and the task list.
- `dnw spec review <ref>`: draft → review, once every section and task is filled in.
- `dnw spec done <ref>`: after every task is done.
- `dnw spec supersede <ref> --by <ref>`: mark a spec as replaced.

## Per-task loop (SDD + TDD)

1. `dnw task start <ref> <taskId>`
2. Write the test at the task's test path, from the spec's acceptance criteria.
3. `dnw task red <ref> <taskId>`: the test must fail. Single-test command: `{{testFileCommand}}`
4. Implement the minimum code to make it pass.
5. `dnw task done <ref> <taskId>`: the task test and the full suite (`{{testCommand}}`) must pass.
6. Continue with the next task shown in the output.
{{superpowersSection}}