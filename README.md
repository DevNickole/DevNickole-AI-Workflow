# dev-nickole-workflow (`dnw`)

A CLI that installs a spec-driven development (SDD) + TDD workflow into any project and **enforces** it, so the
workflow stays the same whichever AI coding tool each teammate uses: Claude Code, Antigravity, ChatGPT/Codex, or none.

- Specs are plain Markdown in `docs/specs/`, one file per spec, typed `api` or `ui`.
- Status changes only through `dnw` commands, which check the rules.
- Each task needs a recorded failing test, then a passing test and a green suite.
- `dnw init` writes instruction files for your AI tools and can set up [superpowers](https://github.com/obra/superpowers).

## Install

```bash
npm i -D dev-nickole-workflow
npx dnw init
```

Installing it as a dev dependency pins every teammate to the same version. Non-Node projects can install it
globally (`npm i -g dev-nickole-workflow`); `dnw` warns when its version differs from the project's.

`dnw init` asks for:

1. **Tech stack**: Next.js/React, Node API, Go, Python, Other. It recommends a test framework and test commands.
2. **AI tools** (multi-select): Claude Code, Antigravity, ChatGPT/Codex, none.
3. **Superpowers**: on by default when an AI tool is selected.

Non-interactive form: `dnw init --yes --stack nextjs --ai claude,codex [--no-superpowers] [--test-command ...] [--test-file-command ...]`

### What it creates

```
.dnw/config.json, manifest.json     tool state (commit these)
docs/design-system/                 components, tokens, patterns
docs/architecture/                  system structure and decisions
docs/products/                      product context
docs/specs/                         0001-user-login.api.md, 0001-user-login.ui.md, ...
CLAUDE.md + .claude/commands/dnw-*  Claude Code
AGENTS.md                           ChatGPT/Codex
.agents/rules/dnw.md                Antigravity
```

Existing `docs/` files and existing `CLAUDE.md` / `AGENTS.md` content are kept. dnw writes only between
`<!-- dnw:start -->` and `<!-- dnw:end -->`.

## Lifecycle

```
spec new -> draft -> review -> active -> (tasks, one at a time, SDD + TDD) -> done
                                                                          \-> superseded
```

| Command | Does |
|---|---|
| `dnw spec new "<title>" --type api\|ui [--id <id>]` | Create a draft. `--id` adds the other half of a UI/API pair. |
| `dnw spec review <ref>` | draft → review. Every section must be filled in, and every task needs a test path. |
| `dnw spec activate <ref>` | review → active. **Human only**: needs an interactive terminal. A UI spec waits for its API spec. |
| `dnw task start <ref> <taskId>` | Start one task (only one per spec at a time). |
| `dnw task red <ref> <taskId>` | The task's test must **fail**. Records the failing run. |
| `dnw task done <ref> <taskId>` | The task's test and the full suite must **pass**. |
| `dnw spec done <ref>` | active → done once all tasks are done. |
| `dnw spec supersede <ref> --by <ref>` | Mark a spec as replaced. |
| `dnw status` | Every spec with the next allowed command. Works from any subfolder. |
| `dnw upgrade` | Refresh managed files and run migrations after updating dnw. |

A `<ref>` is `<id>.<type>`, e.g. `0001.api`.

### Per-task loop

```
dnw task start 0001.api T1   ->  write the test  ->  dnw task red 0001.api T1
->  implement  ->  dnw task done 0001.api T1  ->  next task
```

## Upgrading a project

```bash
npm i -D dev-nickole-workflow@latest
```

```bash
npx dnw upgrade
```

Managed files you never edited are replaced. Files you edited are kept, and the new version is written next to them
as `<file>.new`. `docs/` changes only through migrations, which show a preview and ask before applying.

## Releasing (maintainers)

1. Add a `## x.y.z` section to `CHANGELOG.md`.
2. If the spec format changed, add a migration in `src/migrations/index.ts`.
3. Bump the version, then publish (`prepublishOnly` builds and runs the tests):

```bash
npm version minor
```

```bash
npm publish
```

## Development

```bash
npm install
```

```bash
npm test
```
