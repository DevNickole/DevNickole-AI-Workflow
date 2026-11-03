# dev-nickole-workflow (`dnw`)

A CLI that installs a spec-driven development (SDD) + TDD workflow into any project and **enforces** it, so the
workflow stays the same whichever AI coding tool each teammate uses: Claude Code, Antigravity, ChatGPT/Codex, or none.

- Specs are plain Markdown in `docs/specs/`, one file per spec, typed `api` or `ui`.
- Status changes only through `dnw` commands, which check the rules.
- Each task needs a recorded failing test, then a passing test and a green suite.
- `dnw init` writes instruction files for your AI tools and can set up [superpowers](https://github.com/obra/superpowers).

## Install

dnw installs straight from GitHub; it is not on the npm registry. You need Node 20+ and git.
Pin a release tag (`#v0.1.0`) so the whole team runs the same version. See
[releases](https://github.com/DevNickole/DevNickole-AI-Workflow/tags) for the latest tag.

Node projects (saved in `package.json`, so teammates get it with `npm install`):

```bash
npm i -D github:DevNickole/DevNickole-AI-Workflow#v0.1.0
```

```bash
npx dnw init
```

Any other project (Flutter, Go, Python, ...), installed once per machine:

```bash
npm i -g github:DevNickole/DevNickole-AI-Workflow#v0.1.0
```

```bash
dnw init
```

The built CLI is committed in `dist/`, so installing needs no build step. `dnw` warns when its version
differs from the one the project was set up with.

`dnw init` asks for:

1. **Tech stack**: Next.js/React, Node API, Flutter/Dart, Go, Python, Other. It suggests test commands, using the project's existing test setup when it has one.
2. **Docs locations**: architecture, product and design-system docs. Existing files are suggested.
3. **AI tools** (multi-select): Claude Code, Antigravity, ChatGPT/Codex, none. Tools the project already uses are preselected.
4. **Superpowers**: on by default when an AI tool is selected.

Non-interactive form: `dnw init --yes [--stack nextjs] [--ai claude,codex] [--no-superpowers] [--test-command ...] [--test-file-command ...]`. With `--yes`, everything not given is detected.

### What it creates

```
.dnw/config.json, manifest.json     tool state (commit these)
docs/architecture/                  system structure and decisions   (only if the project has none)
docs/products/                      product context                  (only if the project has none)
docs/design-system/                 components, tokens, patterns     (only if the project has none)
docs/specs/                         0001-user-login.api.md, 0001-user-login.ui.md, ...
CLAUDE.md + .claude/commands/dnw-*  Claude Code
AGENTS.md                           ChatGPT/Codex
.agents/rules/dnw.md                Antigravity
```

## Add dnw to an existing project

`dnw init` adapts to what is already there and changes nothing it does not own:

| Already in the project | What dnw does |
|---|---|
| `docs/architecture.md`, `docs/mvp.md`, `lib/theme/`, ... | Maps them in `.dnw/config.json` and points the AI instructions at them. No duplicate folders. |
| A test setup (Jest, Vitest, Mocha, `flutter test`, pnpm/yarn/bun) | Uses it instead of recommending a new one. |
| `CLAUDE.md`, `AGENTS.md` | Keeps your content; dnw writes only between `<!-- dnw:start -->` and `<!-- dnw:end -->`. |
| `.claude/commands/`, `.agents/skills/`, other docs | Untouched. dnw adds its own `dnw-*` commands and `.agents/rules/dnw.md`. |
| `.claude/settings.json` | Adds one `enabledPlugins` key for superpowers and keeps every other setting. |
| No `package.json` | Generated commands call `dnw` directly instead of `npx --no-install dnw`. |

Run `dnw init` from the project root. Inside a folder that already belongs to a dnw project, it refuses and names that
project's root.

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

Install the newer tag the same way you installed dnw, then run `dnw upgrade` in the project. Node projects:

```bash
npm i -D github:DevNickole/DevNickole-AI-Workflow#v0.2.0
```

```bash
npx dnw upgrade
```

Other projects:

```bash
npm i -g github:DevNickole/DevNickole-AI-Workflow#v0.2.0
```

```bash
dnw upgrade
```

Managed files you never edited are replaced. Files you edited are kept, and the new version is written next to them
as `<file>.new`. `docs/` changes only through migrations, which show a preview and ask before applying.

## Releasing (maintainers)

A release is a git tag on `main`. Colleagues install tags, so nothing reaches them until you tag.

1. Add a `## x.y.z` section to `CHANGELOG.md`.
2. If the spec format changed, add a migration in `src/migrations/index.ts`.
3. Bump the version. This runs the tests, rebuilds `dist/`, commits, and creates the `vx.y.z` tag. Then push with the tag:

```bash
npm test
```

```bash
npm version minor
```

```bash
git push --follow-tags
```

4. Tell the team the new tag, e.g. `#v0.2.0`.

## Development

```bash
npm install
```

```bash
npm test
```

`dist/` is committed because colleagues install from GitHub without a build step. `npm test` rebuilds it, and
`npm version` rebuilds it into every release, so commit it along with your source changes.
