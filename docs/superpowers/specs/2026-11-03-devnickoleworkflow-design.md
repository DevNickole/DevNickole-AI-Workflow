# devNickoleWorkflow — Design Spec

- **Date:** 2026-11-03
- **Status:** Draft — awaiting review
- **npm package:** `dev-nickole-workflow`
- **CLI binary:** `dnw`
- **Project config dir:** `.dnw/`

## 1. Purpose

A CLI that installs a personal spec-driven development (SDD) + TDD workflow into any project, so that a team follows the same workflow regardless of which AI coding tool each person uses (Claude Code, Antigravity, ChatGPT/Codex, or none).

### Goals

- Installable per project (`npx dnw init` or `npm i -D dev-nickole-workflow`).
- Source lives in the author's GitHub repo; released as versioned npm packages.
- Upgradable over time without overwriting project-owned content.
- Workflow rules are **enforced by the CLI**, not by AI prompt compliance, so behavior is identical across AI tools.

### Non-goals

- The CLI never calls AI models or requires API keys.
- No server, database, or hosted service. All state is plain files in git.
- No project-specific code generation beyond docs scaffolding and AI instruction files.

### Success criteria

- A colleague can run `npx dnw init` in a fresh repo, answer the questions, and get a working `docs/` structure plus instruction files for their chosen AI tools.
- An AI agent following the generated instructions cannot move a spec to `active` or mark a task done without a recorded failing test followed by a passing test.
- `dnw upgrade` on a project initialized by an older version updates managed files and never modifies `docs/` without explicit confirmation.

## 2. Architecture

Approach: **CLI owns all state transitions; AI tools follow generated instructions that tell them to use the CLI.**

### Tool repository layout

```
devNickoleWorkflow/
  package.json            name: dev-nickole-workflow, bin: { dnw }, Node >= 20, TypeScript
  src/
    cli.ts                command routing and argument parsing
    commands/
      init.ts
      spec.ts             new, review, activate, done, supersede
      task.ts             start, red, done
      status.ts
      upgrade.ts
    core/
      lifecycle.ts        status state machine and transition guards
      spec-file.ts        parse/write spec frontmatter and task checklist
      config.ts           read/write .dnw/config.json
      manifest.ts         managed-file hashes, marker-block handling
      test-runner.ts      runs the project's test command, returns pass/fail
      stack.ts            stack detection and test-framework recommendations
    adapters/
      claude.ts
      codex.ts
      antigravity.ts
    migrations/           versioned migration scripts (e.g. 0002-add-field.ts)
  templates/
    spec.api.md
    spec.ui.md
    instructions.md       single source for all AI instruction files
  tests/                  Vitest
```

Each `core/` module has one responsibility and no dependency on `commands/`. Commands compose core modules. Adapters only render `templates/instructions.md` into tool-specific files.

### Project layout after `dnw init`

```
.dnw/
  config.json             stack, testCommand, testFileCommand, aiTools, superpowers, docs, command, toolVersion
  manifest.json           managed file paths + content hashes
  runs.json               per-task red/green evidence (timestamps, exit codes)
docs/
  design-system/
  architecture/
  products/
  specs/
    0001-user-login.api.md
    0001-user-login.ui.md
CLAUDE.md, .claude/commands/*.md     if Claude Code selected
AGENTS.md                            if ChatGPT/Codex selected
.agents/rules/dnw.md                 if Antigravity selected
```

Ownership:

- **Managed** (upgrade may replace): `.dnw/manifest.json`, AI instruction marker blocks, `.claude/commands/*`, `.agents/rules/dnw.md`, the `enabledPlugins["superpowers@claude-plugins-official"]` key in `.claude/settings.json` (other keys untouched).
- **Project-owned** (upgrade never replaces; only confirmed migrations may edit): everything in `docs/`, `.dnw/config.json`, `.dnw/runs.json`.

## 3. Spec files

Specs are single flat Markdown files in `docs/specs/`. Two types, for separation of concerns:

- **`api`** — endpoints, request/response shapes, error cases, data models, acceptance criteria, tasks.
- **`ui`** — screens, components (referencing `docs/design-system/`), states, user flows, acceptance criteria, tasks.

### Naming and pairing

- Filename: `<id>-<slug>.<type>.md`, e.g. `0001-user-login.api.md`.
- A feature's UI and API specs **share an ID**. Either half may exist alone.
- Spec reference format used by commands: `<id>.<type>`, e.g. `0001.api`.
- `dnw spec new` assigns the next unused ID; `--id <id>` creates the other half of an existing pair.

### Frontmatter

```yaml
---
id: "0001"
type: api              # api | ui
title: User login
status: draft          # draft | review | active | done | superseded
dependsOn: null        # ui specs: "0001.api" when the pair has an API half
approvedBy: null       # set by `spec activate` from git user.name
supersededBy: null     # e.g. "0007.api"
---
```

### Tasks section

Tasks live inside the spec under `## Tasks`:

```markdown
## Tasks
- [ ] T1: POST /auth/login returns a token for valid credentials (test: tests/auth/login.test.ts)
- [~] T2: Locks account after 5 failures (test: tests/auth/lockout.test.ts)
- [x] T3: ...
```

- `[ ]` todo, `[~]` in progress, `[x]` done.
- Each task must declare exactly one test path in `(test: <path>)`.
- Red/green evidence is stored in `.dnw/runs.json`, keyed by `<id>.<type>/<taskId>`, not in the spec file.

## 4. Lifecycle and commands

```
spec new -> draft -> review -> active -> (tasks, one at a time, SDD+TDD) -> done
                                                                       \-> superseded
```

| Command | Transition | Guards |
|---|---|---|
| `dnw spec new "<title>" --type api\|ui [--id <id>]` | → `draft` | Type required. With `--id`, that ID must exist and the given type must not. A new `ui` half sets `dependsOn` to the `api` half when it exists. |
| `dnw spec review <ref>` | `draft` → `review` | All required template sections non-empty; ≥ 1 task; every task has a test path. |
| `dnw spec activate <ref>` | `review` → `active` | Requires interactive TTY confirmation (refuses when stdin is not a TTY, so AI agents cannot self-approve). For `ui` with `dependsOn`, the API half must be `active` or `done`. Records `approvedBy`. |
| `dnw task start <ref> <taskId>` | `[ ]` → `[~]` | Spec `active`; no other task `[~]` in the same spec. |
| `dnw task red <ref> <taskId>` | records red | Task `[~]`; test file exists; running the task's test **fails**. Records evidence. |
| `dnw task done <ref> <taskId>` | `[~]` → `[x]` | Red evidence recorded for this task; the task's test **passes**; the full test command passes. Records evidence. |
| `dnw spec done <ref>` | `active` → `done` | All tasks `[x]`. |
| `dnw spec supersede <ref> --by <ref>` | any → `superseded` | Target spec exists and has the same type. Sets `supersededBy`. |
| `dnw status` | — | Lists specs grouped by status, the in-progress task per active spec, and the next allowed command. |
| `dnw upgrade` | — | See section 6. |

### Running a single task's test

`config.json` stores two commands:

- `testCommand` — full suite, e.g. `npm test`.
- `testFileCommand` — single test with a `{file}` (test file path) or `{dir}` (its directory) placeholder, e.g. `npx vitest run {file}`, `go test ./{dir}`.

### Errors

Every rejected command exits non-zero and prints the reason plus the next valid command:

```
✗ Cannot activate 0001.ui: paired 0001.api is still in draft.
  Next: dnw spec review 0001.api
```

Malformed spec files (bad frontmatter, unknown status, task without test path) produce a file:line error and no state change. Commands are atomic: a spec file is written only after all guards pass.

## 5. `dnw init`

Interactive flow:

`init` must work in new **and existing** projects: it adopts what is already there and changes nothing it does not own.

0. Refuse when the folder is inside another dnw project (a parent has `.dnw/config.json`); name that root.
1. Detect stack: `pubspec.yaml` → Flutter (checked first; Flutter repos may carry a tooling `package.json`), `package.json` (Next.js / React vs Node API), `go.mod`, `pyproject.toml`/`requirements.txt`; preselect the guess.
2. **Stack:** Next.js/React, Node API, Flutter/Dart, Go, Python, Other.
3. **Test commands:** use the project's existing setup when it has one, else recommend; user accepts or edits `testCommand` and `testFileCommand`.

   | Stack | No existing tests | testCommand | testFileCommand |
   |---|---|---|---|
   | Next.js/React | Vitest + Playwright | `<pm> test` | `npx vitest run {file}` |
   | Node API | Vitest | `<pm> test` | `npx vitest run {file}` |
   | Flutter | flutter_test | `flutter test` | `flutter test {file}` |
   | Go | go test | `go test ./...` | `go test ./{dir}` |
   | Python | pytest | `pytest` | `pytest {file}` |
   | Other | — | user input | user input |

   Node: `<pm>` comes from the lockfile (pnpm, yarn, bun, else npm). An existing `scripts.test` using Jest, Vitest or Mocha keeps that runner (`npx jest {file}`, `npx vitest run {file}`, `npx mocha {file}`); any other script uses `<pm> test -- {file}`. npm's placeholder script counts as no tests.
4. **Docs locations** (`config.docs`): architecture, products, design system. Each is a file or a folder ending in `/`. Detected candidates, most specific first:
   - architecture: `docs/architecture/`, `docs/architecture.md`, `docs/ARCHITECTURE.md`, `ARCHITECTURE.md`
   - products: `docs/products/`, `docs/product/`, `docs/product.md`, `docs/mvp.md`, `docs/prd.md`, `docs/PRD.md`, `PRD.md`
   - design system: `docs/design-system/`, `docs/design-system.md`, `lib/theme/`, `src/theme/`, `src/design-system/`, `src/components/ui/`

   Defaults when nothing is found: `docs/architecture/`, `docs/products/`, `docs/design-system/`. `docs/specs/` is always dnw's.
5. **AI tools** (multi-select), preselected from what exists: `CLAUDE.md`/`.claude/` → Claude, `AGENTS.md` → Codex, `.agents/`/`.agent/`/`GEMINI.md` → Antigravity.
6. **Install superpowers?** (default yes; skipped when no AI tools selected). See section 6.1.
7. Create only missing doc locations (folder + `README.md`, or the named Markdown file) and `docs/specs/`. Existing files are never overwritten.
8. `config.command`: `npx --no-install dnw` when `package.json` lists `dev-nickole-workflow`, else `dnw`. Generated instructions use it.
9. Write `.dnw/config.json`, generate adapter files, write `.dnw/manifest.json`.
10. Run superpowers setup steps (section 6.1).

Non-interactive: `dnw init --yes [--stack nextjs] [--ai claude,codex] [--no-superpowers] [--test-command ...] [--test-file-command ...]`. With `--yes`, everything not given is detected (stack, test commands, docs, AI tools); superpowers defaults to on when AI tools are selected.

Configs without `docs` or `command` (older versions) fall back to the default folders and `npx --no-install dnw`.

Re-running `init` on an initialized project exits with a message pointing to `dnw upgrade`.

## 6. AI adapters

`templates/instructions.md` is the single source. It is rendered with config values (paths, test commands) and describes:

- The project docs structure and where to look for context (architecture, products, design system).
- The spec lifecycle and that **status is changed only via `dnw` commands, never by editing frontmatter**.
- The per-task loop: `task start` → write the test → `task red` → implement → `task done` → next task.
- That `spec activate` is human-only.

Adapter output:

- **Claude Code:** marker block in `CLAUDE.md`; slash commands in `.claude/commands/` (`spec-new.md`, `spec-review.md`, `task-start.md`, `task-red.md`, `task-done.md`, `status.md`).
- **ChatGPT/Codex:** marker block in `AGENTS.md`.
- **Antigravity:** `.agents/rules/dnw.md` with frontmatter `trigger: always_on` and `description` (per antigravity.google/docs/rules; `.agent/` is legacy and workflows are being migrated to skills, so none are generated).

Existing `CLAUDE.md` / `AGENTS.md` content is preserved: dnw writes only between `<!-- dnw:start -->` and `<!-- dnw:end -->`.

### 6.1 Superpowers

[Superpowers](https://github.com/obra/superpowers) (skills for brainstorming, planning, TDD, debugging, review) is installed alongside dnw when `config.superpowers` is `true`. Install mechanics differ per tool:

| Tool | Mechanism | What dnw does |
|---|---|---|
| Claude Code | Project setting, committed to the repo | Merges `"enabledPlugins": { "superpowers@claude-plugins-official": true }` into `.claude/settings.json`, keeping all other keys. Teammates are prompted to install it when they open the project. |
| Antigravity | User-level CLI install | If `agy` is on PATH, asks to run `agy plugin install https://github.com/obra/superpowers` (with `--yes`: runs it). Otherwise prints that command. |
| ChatGPT/Codex | Interactive marketplace only | Prints: in Codex run `/plugins`, search `superpowers`, select Install Plugin. |

The rendered instructions gain a "Superpowers" section that maps the two workflows, so they do not conflict:

- Spec and plan files live in `docs/specs/` via `dnw spec new`, **overriding** superpowers' default `docs/superpowers/specs/` and `docs/superpowers/plans/` locations. Tasks are the `## Tasks` section of the spec, not a separate plan file.
- `draft` phase → use superpowers brainstorming to fill the spec.
- Each task → use superpowers test-driven-development inside the `task start` → `task red` → `task done` loop.
- Before `dnw task done` → use superpowers verification-before-completion.
- Bugs during a task → use superpowers systematic-debugging.
- Status changes still go only through `dnw` commands.
- If superpowers skills are not available in the session, tell the user the install step for their tool.

`dnw upgrade` re-applies the `.claude/settings.json` merge (managed key only) and the instructions section.

## 7. Versioning and upgrades

- Recommended install: `npm i -D dev-nickole-workflow` (team pinned to one version via `package.json`). Non-Node projects use a global install; the CLI warns when its version differs from `config.toolVersion`.
- Releases follow semver. Breaking changes to spec format require a migration.

`dnw upgrade`:

1. Compare each managed file's current hash to `manifest.json`.
   - Unchanged → replace with the new version.
   - Locally modified → write `<file>.new` beside it and warn. Nothing is overwritten.
   - Marker blocks → replaced in place; content outside markers untouched.
2. Run pending migrations (`src/migrations/`, ordered by number, after `config.toolVersion`). Each migration shows a preview of affected `docs/` files and requires confirmation; `--yes` accepts all.
3. Update `config.toolVersion` and `manifest.json`.
4. Print a short changelog for versions crossed.

## 8. Testing (the tool itself)

- **Vitest** for unit and integration tests.
- Unit: `lifecycle` guards (every allowed and rejected transition), `spec-file` parse/write round-trip, `manifest` hash/marker logic, `stack` detection.
- Integration: run the built CLI against temp directories — `init` (interactive answers injected), full spec lifecycle with a fake test command that fails then passes, `upgrade` from a fixture project created by an older template version.
- TTY guard tested by running `spec activate` with non-TTY stdin and asserting refusal.
- The tool's own development follows TDD.

## 9. Open decisions

None blocking. Names (`dev-nickole-workflow`, `dnw`) can be changed before first publish.
