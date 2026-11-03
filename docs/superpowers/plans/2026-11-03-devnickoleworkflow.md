# devNickoleWorkflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `dnw`, an npm-installable CLI that installs and enforces an SDD + TDD spec workflow in any project, independent of which AI coding tool is used.

**Architecture:** Pure `core/` modules (spec parsing, lifecycle guards, config, manifest, test runner) composed by thin `commands/`. All I/O that tests must control (TTY, confirm prompts, git user, clock, shell commands) goes through an injected `Ctx`. `cli.ts` exports `main(argv, ctx)` so integration tests run in-process; `bin.ts` is the only file touching `process`.

**Tech Stack:** Node >= 20, TypeScript (ESM, `NodeNext`), commander 12, @inquirer/prompts 7, yaml 2, semver 7, Vitest 2.

**Spec:** `docs/superpowers/specs/2026-11-03-devnickoleworkflow-design.md`

## Global Constraints

- npm package name `dev-nickole-workflow`; binary `dnw`; project config dir `.dnw/`.
- `"engines": { "node": ">=20" }`, `"type": "module"`.
- Spec statuses exactly: `draft | review | active | done | superseded`. Types exactly: `api | ui`.
- Spec filename `<id>-<slug>.<type>.md`, id is 4-digit zero-padded string (`"0001"`). Ref format `<id>.<type>`.
- Task line format: `- [ ] T1: <title> (test: <path>)`; markers `[ ]` todo, `[~]` in progress, `[x]` done.
- Marker block delimiters exactly `<!-- dnw:start -->` and `<!-- dnw:end -->`.
- Rejections: exit code 1, stderr `✗ <reason>` then `  Next: <command>` when a next command exists.
- `spec activate` refuses when `ctx.isTTY` is false.
- The CLI never calls an AI model or network service.
- `docs/` is never written by `upgrade` except through a confirmed migration.

## Review Focus

1. **CRLF spec files** (Windows checkouts, `core.autocrlf`): parsing must accept `\r\n`, and writing must preserve the file's original line ending. Pinned in Task 2.
2. **Running from a subdirectory**: `dnw status` from `src/components/` must find the project root by walking up to `.dnw/config.json`. Pinned in Task 4.
3. **Titles with YAML-special characters** (`Login: v2 "beta"`): frontmatter round-trips without corruption and slug strips them. Pinned in Tasks 2 and 3.
4. **Duplicate or renamed spec files** (two `0001.*.api.md` after a manual copy; slug edited by hand): lookup is by `id`+`type` from frontmatter, duplicates are a hard error naming both files. Pinned in Task 3.
5. **Hand-edited status** (someone sets `status: active` directly): `dnw status` flags an `active`/`done` spec with `approvedBy: null` as `⚠ not approved via dnw`. Pinned in Task 8.

---

## File Structure

```
package.json, tsconfig.json, vitest.config.ts, README.md, CHANGELOG.md, .gitignore
src/
  bin.ts                 #!/usr/bin/env node — calls main(), sets process.exitCode
  cli.ts                 main(argv, ctx?) — commander wiring, DnwError printing, version warning
  core/
    errors.ts            DnwError
    context.ts           Ctx interface, defaultCtx(), findRoot()
    spec-file.ts         parseSpec / serializeSpec / parseRef / formatRef
    spec-store.ts        listSpecs / findSpec / writeSpec / nextId / slugify / specFileName
    templates.ts         templatesDir(), readTemplate(), render()
    lifecycle.ts         transition guards + REQUIRED_SECTIONS
    config.ts            DnwConfig, readConfig / writeConfig
    stack.ts             detectStack / recommend
    test-runner.ts       renderFileCommand / runCommand
    runs.ts              readRuns / recordRun
    manifest.ts          hash / marker blocks / writeManagedFiles
    version.ts           packageVersion()
  commands/
    spec.ts              specNew / specReview / specActivate / specDone / specSupersede
    task.ts              taskStart / taskRed / taskDone
    status.ts            status
    init.ts              init
    upgrade.ts           upgrade
  adapters/
    index.ts             AdapterFile, adapterFiles(cfg)
    instructions.ts      renderInstructions(cfg)
    claude.ts / codex.ts / antigravity.ts
  migrations/
    index.ts             Migration, migrations[], pendingMigrations()
templates/
  spec.api.md, spec.ui.md, instructions.md, docs-readme/*.md
tests/
  helpers.ts             tmpProject(), testCtx()
  core/*.test.ts, commands/*.test.ts, e2e.test.ts
```

---

### Task 1: Package scaffold and CLI shell

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `src/bin.ts`, `src/cli.ts`, `src/core/errors.ts`, `src/core/version.ts`
- Test: `tests/cli.test.ts`

**Interfaces:**
- Produces:
  - `class DnwError extends Error { constructor(message: string, public next?: string) }`
  - `packageVersion(): string` — reads `version` from the package's own `package.json` via `new URL('../../package.json', import.meta.url)`.
  - `main(argv: string[], ctx?: Ctx): Promise<number>` — returns exit code; catches `DnwError` and writes `✗ ${message}` and, if set, `  Next: ${next}` through `ctx.err`. Other errors re-throw. (`Ctx` arrives in Task 4; until then `main` takes an optional `{ out(s: string): void; err(s: string): void }` and Task 4 widens it.)

- [ ] **Step 1: Create package files**

`package.json`: name `dev-nickole-workflow`, version `0.1.0`, `"type": "module"`, `"bin": { "dnw": "dist/bin.js" }`, `"files": ["dist", "templates", "CHANGELOG.md"]`, `"engines": { "node": ">=20" }`, scripts `build: tsc -p .`, `test: vitest run`. Deps: `commander@^12`, `@inquirer/prompts@^7`, `yaml@^2`, `semver@^7`. Dev deps: `typescript@^5`, `vitest@^2`, `@types/node@^20`, `@types/semver@^7`.
`tsconfig.json`: `target ES2022`, `module/moduleResolution NodeNext`, `rootDir src`, `outDir dist`, `strict true`, `declaration false`.
`.gitignore`: `node_modules/`, `dist/`.
Run: `npm install` — Expected: exits 0.

- [ ] **Step 2: Write the failing test**

```ts
// tests/cli.test.ts
import { main } from '../src/cli.js';
const io = () => { const o: string[] = [], e: string[] = []; return { o, e, ctx: { out: (s: string) => o.push(s), err: (s: string) => e.push(s) } }; };

test('--version prints package version', async () => {
  const { o, ctx } = io();
  expect(await main(['node', 'dnw', '--version'], ctx as any)).toBe(0);
  expect(o.join('')).toContain('0.1.0');
});

test('unknown command exits non-zero', async () => {
  const { ctx } = io();
  expect(await main(['node', 'dnw', 'nope'], ctx as any)).toBe(1);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/cli.test.ts` — Expected: FAIL, cannot resolve `../src/cli.js`.

- [ ] **Step 4: Implement `errors.ts`, `version.ts`, `cli.ts`, `bin.ts`**

Use commander with `.exitOverride()` and `.configureOutput({ writeOut: ctx.out, writeErr: ctx.err })`; map `CommanderError` with code `commander.version`/`commander.helpDisplayed` to 0, others to 1. `bin.ts`: `process.exitCode = await main(process.argv)`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/cli.test.ts` — Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: scaffold dnw package and CLI shell"
```

---

### Task 2: Spec file parsing and serialization

**Files:**
- Create: `src/core/spec-file.ts`
- Test: `tests/core/spec-file.test.ts`

**Interfaces:**
- Consumes: `DnwError` (Task 1)
- Produces:
  ```ts
  type SpecType = 'api' | 'ui';
  type SpecStatus = 'draft' | 'review' | 'active' | 'done' | 'superseded';
  type TaskState = 'todo' | 'in_progress' | 'done';
  interface SpecTask { id: string; title: string; state: TaskState; testPath: string | null; line: number }
  interface SpecMeta { id: string; type: SpecType; title: string; status: SpecStatus;
    dependsOn: string | null; approvedBy: string | null; supersededBy: string | null }
  interface SpecDoc { path: string; meta: SpecMeta; body: string; eol: '\n' | '\r\n';
    sections: Record<string, string>; tasks: SpecTask[] }
  class SpecParseError extends DnwError { constructor(file: string, line: number, msg: string) } // message: `${file}:${line}: ${msg}`
  parseSpec(text: string, path: string): SpecDoc
  serializeSpec(doc: SpecDoc): string
  formatRef(meta: Pick<SpecMeta, 'id' | 'type'>): string      // "0001.api"
  parseRef(ref: string): { id: string; type: SpecType }        // throws DnwError on bad format
  ```
- `sections` maps each `## Heading` text to its content with HTML comments and whitespace stripped.
- `tasks` are lines under `## Tasks` matching `/^- \[( |~|x)\] (T\d+): (.*?)(?: \(test: (.+)\))?$/`.
- `serializeSpec` writes frontmatter via `yaml` `stringify` and rewrites only the checkbox char of each task line in `body`; output uses `doc.eol`.

- [ ] **Step 1: Write the failing tests**

```ts
const SPEC = `---\nid: "0001"\ntype: api\ntitle: User login\nstatus: draft\ndependsOn: null\napprovedBy: null\nsupersededBy: null\n---\n## Goal\nLet users log in.\n\n## Tasks\n- [ ] T1: Returns token (test: tests/login.test.ts)\n- [~] T2: Locks account\n`;

test('parses meta, sections, tasks', () => {
  const d = parseSpec(SPEC, 'x.md');
  expect(d.meta).toMatchObject({ id: '0001', type: 'api', status: 'draft' });
  expect(d.sections['Goal']).toBe('Let users log in.');
  expect(d.tasks).toEqual([
    expect.objectContaining({ id: 'T1', state: 'todo', testPath: 'tests/login.test.ts' }),
    expect.objectContaining({ id: 'T2', state: 'in_progress', testPath: null }),
  ]);
});

test('round-trips unchanged', () => expect(serializeSpec(parseSpec(SPEC, 'x.md'))).toBe(SPEC));

test('updates status and task marker', () => {
  const d = parseSpec(SPEC, 'x.md');
  d.meta.status = 'review'; d.tasks[0].state = 'done';
  const out = serializeSpec(d);
  expect(out).toContain('status: review');
  expect(out).toContain('- [x] T1: Returns token');
});

test('CRLF input is parsed and preserved', () => {
  const crlf = SPEC.replace(/\n/g, '\r\n');
  const d = parseSpec(crlf, 'x.md');
  expect(d.tasks).toHaveLength(2);
  expect(serializeSpec(d)).toBe(crlf);
});

test('YAML-special title round-trips', () => {
  const d = parseSpec(SPEC, 'x.md'); d.meta.title = 'Login: v2 "beta"';
  expect(parseSpec(serializeSpec(d), 'x.md').meta.title).toBe('Login: v2 "beta"');
});

test('bad status reports file and line', () =>
  expect(() => parseSpec(SPEC.replace('status: draft', 'status: wip'), 'x.md')).toThrow(/x\.md:5: .*status/));

test('missing frontmatter is an error', () =>
  expect(() => parseSpec('# hi', 'x.md')).toThrow(/x\.md:1/));

test('refs', () => {
  expect(parseRef('0001.ui')).toEqual({ id: '0001', type: 'ui' });
  expect(() => parseRef('1.web')).toThrow(/<id>\.<type>/);
});
```

- [ ] **Step 2: Run to verify fail** — `npx vitest run tests/core/spec-file.test.ts` — Expected: FAIL, module not found.
- [ ] **Step 3: Implement `src/core/spec-file.ts`** per Interfaces. Detect `eol` from the first line break; normalize to `\n` internally; frontmatter line numbers count from 1 at the opening `---`. Serialize frontmatter keys in the fixed order `id, type, title, status, dependsOn, approvedBy, supersededBy`, with `id` always quoted.
- [ ] **Step 4: Run to verify pass** — same command — Expected: 8 passed.
- [ ] **Step 5: Commit** — `git commit -am "feat: parse and serialize spec files"` (add new files first with `git add -A`).

---

### Task 3: Spec store and spec templates

**Files:**
- Create: `src/core/spec-store.ts`, `src/core/templates.ts`, `templates/spec.api.md`, `templates/spec.ui.md`, `tests/helpers.ts`
- Test: `tests/core/spec-store.test.ts`

**Interfaces:**
- Consumes: `parseSpec`, `serializeSpec`, `SpecDoc`, `SpecType`, `formatRef` (Task 2)
- Produces:
  ```ts
  specsDir(root: string): string                         // <root>/docs/specs
  listSpecs(root: string): SpecDoc[]                     // all *.api.md / *.ui.md, sorted by id then type
  findSpec(root: string, ref: string): SpecDoc           // by meta.id + meta.type
  findSpecOrNull(root: string, ref: string): SpecDoc | null
  writeSpec(doc: SpecDoc): void
  nextId(root: string): string                           // max id + 1, zero-padded to 4
  slugify(title: string): string                         // lowercase, [a-z0-9]+ joined by "-"
  specFileName(id: string, title: string, type: SpecType): string
  templatesDir(): string                                 // package's templates/ via import.meta.url
  readTemplate(name: string): string
  render(tpl: string, vars: Record<string, string>): string   // replaces {{key}}; unknown keys throw
  ```
- `tests/helpers.ts`: `tmpProject(): string` — creates a temp dir with `docs/specs/`, returns path; cleaned in `afterEach`.

Template sections (each heading followed by an HTML comment hint, e.g. `<!-- List each endpoint: METHOD /path -->`):
- `spec.api.md`: frontmatter with `{{id}} {{title}}` and `type: api`, `status: draft`; sections `Goal`, `Endpoints`, `Data Models`, `Errors`, `Acceptance Criteria`, `Tasks`.
- `spec.ui.md`: same frontmatter with `type: ui` and `dependsOn: {{dependsOn}}`; sections `Goal`, `Screens`, `Components`, `States`, `User Flows`, `Acceptance Criteria`, `Tasks`. The Components hint names `docs/design-system/`.

- [ ] **Step 1: Write the failing tests**

```ts
test('nextId is 0001 on empty, then max+1', () => {
  const root = tmpProject();
  expect(nextId(root)).toBe('0001');
  writeFixture(root, '0003-a.api.md', '0003', 'api');
  expect(nextId(root)).toBe('0004');
});

test('findSpec uses frontmatter, not filename', () => {
  const root = tmpProject();
  writeFixture(root, 'renamed-by-hand.api.md', '0002', 'api');
  expect(findSpec(root, '0002.api').meta.id).toBe('0002');
});

test('duplicate id+type is an error naming both files', () => {
  const root = tmpProject();
  writeFixture(root, '0001-a.api.md', '0001', 'api');
  writeFixture(root, '0001-b.api.md', '0001', 'api');
  expect(() => listSpecs(root)).toThrow(/0001-a\.api\.md.*0001-b\.api\.md/);
});

test('missing spec suggests status', () =>
  expect(() => findSpec(tmpProject(), '0009.ui')).toThrow(expect.objectContaining({ next: 'dnw status' })));

test('slug strips special characters', () =>
  expect(specFileName('0001', 'Login: v2 "beta"', 'api')).toBe('0001-login-v2-beta.api.md'));

test('templates render and parse', () => {
  const ui = render(readTemplate('spec.ui.md'), { id: '0001', title: 'Login', dependsOn: '"0001.api"' });
  const d = parseSpec(ui, 'x.md');
  expect(d.meta).toMatchObject({ type: 'ui', dependsOn: '0001.api', status: 'draft' });
  expect(Object.keys(d.sections)).toEqual(['Goal', 'Screens', 'Components', 'States', 'User Flows', 'Acceptance Criteria', 'Tasks']);
});
```
(`writeFixture(root, file, id, type)` is a local helper writing a minimal valid spec.)

- [ ] **Step 2: Run to verify fail** — `npx vitest run tests/core/spec-store.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `spec-store.ts`, `templates.ts`, both templates, `tests/helpers.ts`. `dependsOn` var renders `null` or a quoted ref.
- [ ] **Step 4: Run to verify pass** — Expected: 6 passed.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: spec store and api/ui templates"`

---

### Task 4: Context, project root, config, stack detection

**Files:**
- Create: `src/core/context.ts`, `src/core/config.ts`, `src/core/stack.ts`
- Modify: `src/cli.ts` (accept full `Ctx`), `tests/helpers.ts` (add `testCtx`)
- Test: `tests/core/config.test.ts`, `tests/core/stack.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface RunResult { exitCode: number; output: string }
  interface Ctx {
    cwd: string; isTTY: boolean;
    out(s: string): void; err(s: string): void;
    confirm(message: string): Promise<boolean>;
    gitUser(): string;              // `git config user.name`, fallback "unknown"
    now(): string;                  // ISO timestamp
    run(cmd: string, cwd: string): RunResult;
  }
  defaultCtx(): Ctx                 // real process/TTY/inquirer/child_process
  findRoot(cwd: string): string     // walks up to dir containing .dnw/config.json; else DnwError('Not a dnw project', 'dnw init')

  type StackId = 'nextjs' | 'node-api' | 'go' | 'python' | 'other';
  type AiTool = 'claude' | 'codex' | 'antigravity';
  interface DnwConfig { toolVersion: string; stack: StackId; testCommand: string; testFileCommand: string; aiTools: AiTool[] }
  readConfig(root: string): DnwConfig
  writeConfig(root: string, cfg: DnwConfig): void          // pretty JSON, 2 spaces, trailing newline
  detectStack(root: string): StackId
  recommend(stack: StackId): { framework: string; testCommand: string; testFileCommand: string }
  ```
- `testCtx(over?: Partial<Ctx>)` in helpers: collects `out`/`err` into arrays exposed as `ctx.outText()`/`ctx.errText()`, `isTTY: true`, `confirm: async () => true`, `gitUser: () => 'Tester'`, `now: () => '2026-01-01T00:00:00.000Z'`, `run` defaults to throwing "no run stub".

Recommendations (exact values from spec §5):

| stack | framework | testCommand | testFileCommand |
|---|---|---|---|
| nextjs | `Vitest + Playwright` | `npm test` | `npx vitest run {file}` |
| node-api | `Vitest` | `npm test` | `npx vitest run {file}` |
| go | `go test` | `go test ./...` | `go test ./{dir}` |
| python | `pytest` | `pytest` | `pytest {file}` |
| other | `` | `` | `` |

Detection: `package.json` with `next` or `react` dep → nextjs; other `package.json` → node-api; `go.mod` → go; `pyproject.toml` or `requirements.txt` → python; else other.

- [ ] **Step 1: Write failing tests** — `detectStack` for each fixture (5 cases); `recommend('go').testFileCommand === 'go test ./{dir}'`; `writeConfig`/`readConfig` round-trip; `readConfig` on missing file throws with `next: 'dnw init'`; `findRoot` from `<root>/src/components` returns `<root>`; `findRoot` outside any project throws `Not a dnw project`.
- [ ] **Step 2: Run to verify fail** — `npx vitest run tests/core/config.test.ts tests/core/stack.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the three modules; widen `main(argv, ctx = defaultCtx())`. `defaultCtx().run` uses `spawnSync(cmd, { cwd, shell: true, encoding: 'utf8' })`, output = stdout + stderr, `exitCode = status ?? 1`.
- [ ] **Step 4: Run to verify pass** — plus `npx vitest run` (all) — Expected: all pass.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: context, config, stack detection"`

---

### Task 5: Lifecycle guards

**Files:**
- Create: `src/core/lifecycle.ts`
- Test: `tests/core/lifecycle.test.ts`

**Interfaces:**
- Consumes: `SpecDoc`, `formatRef` (Task 2); `DnwError` (Task 1)
- Produces (each throws `DnwError` with `next` set as listed, otherwise returns `void`):
  ```ts
  REQUIRED_SECTIONS: Record<SpecType, string[]>   // exactly the template headings from Task 3
  assertCanReview(doc: SpecDoc): void
  assertCanActivate(doc: SpecDoc, pairApi: SpecDoc | null, isTTY: boolean): void
  assertCanStartTask(doc: SpecDoc, taskId: string): SpecTask
  assertTaskInProgress(doc: SpecDoc, taskId: string): SpecTask   // used by red and done
  assertCanSpecDone(doc: SpecDoc): void
  assertCanSupersede(doc: SpecDoc, by: SpecDoc): void
  ```

Rules and messages (`<ref>` = `formatRef(doc.meta)`):

| Guard | Rejects when | Message contains | next |
|---|---|---|---|
| review | status ≠ draft | `is <status>, expected draft` | `dnw status` |
| review | any required section empty (except Tasks) | `section "<name>" is empty` | — |
| review | 0 tasks | `has no tasks` | — |
| review | task without testPath | `task <T> has no (test: <path>)` | — |
| activate | status ≠ review | `expected review` | `dnw spec review <ref>` (if draft) |
| activate | `!isTTY` | `requires a human at an interactive terminal` | — |
| activate | ui with dependsOn and pairApi null or status ∉ {active, done} | `paired <dep> is still in <status>` (or `is missing`) | `dnw spec review <dep>` when dep is draft |
| start | status ≠ active | `is not active` | `dnw spec activate <ref>` |
| start | unknown task | `has no task <T>` | — |
| start | task not todo | `task <T> is <state>` | — |
| start | another task in_progress | `task <other> is already in progress` | `dnw task done <ref> <other>` |
| in-progress | task not in_progress | `task <T> is not in progress` | `dnw task start <ref> <T>` |
| spec done | status ≠ active | `expected active` | — |
| spec done | any task not done | `tasks not done: T2, T3` | — |
| supersede | by.meta.type ≠ doc.meta.type | `same type` | — |
| supersede | doc is by | `cannot supersede itself` | — |

- [ ] **Step 1: Write failing tests** — one test per table row (16), plus one allowed-path test per guard (6). Build docs with a `makeDoc(overrides)` helper in the test file.
- [ ] **Step 2: Run to verify fail** — `npx vitest run tests/core/lifecycle.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `lifecycle.ts`.
- [ ] **Step 4: Run to verify pass** — Expected: 22 passed.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: lifecycle transition guards"`

---

### Task 6: Spec commands

**Files:**
- Create: `src/commands/spec.ts`
- Modify: `src/cli.ts` (register `spec` subcommands)
- Test: `tests/commands/spec.test.ts`

**Interfaces:**
- Consumes: Tasks 2–5.
- Produces (all `async`, all resolve root with `findRoot(ctx.cwd)`, all print a one-line `✓ ...` on success):
  ```ts
  specNew(ctx: Ctx, title: string, opts: { type: SpecType; id?: string }): Promise<SpecDoc>
  specReview(ctx: Ctx, ref: string): Promise<void>
  specActivate(ctx: Ctx, ref: string): Promise<void>
  specDone(ctx: Ctx, ref: string): Promise<void>
  specSupersede(ctx: Ctx, ref: string, by: string): Promise<void>
  ```
- CLI: `dnw spec new <title> --type <api|ui> [--id <id>]`, `dnw spec review <ref>`, `dnw spec activate <ref>`, `dnw spec done <ref>`, `dnw spec supersede <ref> --by <ref>`.

Behaviour:
- `specNew`: with `--id`, that id must already have the other type (`DnwError('No spec 0001 exists', 'dnw spec new "<title>" --type <type>')`) and must not have this type. A new `ui` sets `dependsOn` to `<id>.api` when that spec exists, else `null`. Success line: `✓ Created docs/specs/<file> (draft)`.
- `specActivate`: after guards pass, `await ctx.confirm('Approve <ref> "<title>" and set it active?')`; `false` → `DnwError('Activation cancelled')`. Sets `approvedBy = ctx.gitUser()`.
- `specSupersede`: sets `status = 'superseded'`, `supersededBy = by`.
- Every command writes the spec only after all guards pass.

- [ ] **Step 1: Write failing tests** (use `tmpProject()` + a `.dnw/config.json` written via `writeConfig`):
  - `spec new` twice gives `0001` and `0002`; file names match `specFileName`.
  - `spec new --type ui --id 0001` after `0001.api` sets `dependsOn: '0001.api'`.
  - `--id 0001 --type api` when `0001.api` exists → throws `already exists`.
  - full path: new → fill sections and a task via string replace → review → activate → status `active`, `approvedBy: 'Tester'`.
  - activate with `testCtx({ isTTY: false })` → throws, file unchanged (compare bytes).
  - activate with `confirm: async () => false` → throws `cancelled`, file unchanged.
  - `main(['node','dnw','spec','activate','0001.ui'], ctx)` with draft pair returns 1 and `ctx.errText()` contains `✗ Cannot activate 0001.ui: paired 0001.api is still in draft` and `Next: dnw spec review 0001.api`.
  - supersede sets both fields.
- [ ] **Step 2: Run to verify fail** — `npx vitest run tests/commands/spec.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `commands/spec.ts` and CLI wiring. Prefix guard messages with `Cannot <verb> <ref>: ` in the command layer.
- [ ] **Step 4: Run to verify pass** — then `npx vitest run` — Expected: all pass.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: spec new/review/activate/done/supersede"`

---

### Task 7: Test runner, run evidence, task commands

**Files:**
- Create: `src/core/test-runner.ts`, `src/core/runs.ts`, `src/commands/task.ts`
- Modify: `src/cli.ts`
- Test: `tests/core/runs.test.ts`, `tests/commands/task.test.ts`

**Interfaces:**
- Consumes: `Ctx.run` (Task 4), guards (Task 5), store (Task 3), `readConfig` (Task 4).
- Produces:
  ```ts
  renderFileCommand(template: string, testPath: string): string   // {file} → path (posix slashes), {dir} → dirname
  interface RunEvidence { red?: { at: string; exitCode: number }; green?: { at: string; exitCode: number } }
  runKey(ref: string, taskId: string): string                      // "0001.api/T1"
  readRuns(root: string): Record<string, RunEvidence>              // {} when .dnw/runs.json missing
  recordRun(root: string, key: string, kind: 'red' | 'green', exitCode: number, at: string): void
  taskStart(ctx: Ctx, ref: string, taskId: string): Promise<void>
  taskRed(ctx: Ctx, ref: string, taskId: string): Promise<void>
  taskDone(ctx: Ctx, ref: string, taskId: string): Promise<void>
  ```
- CLI: `dnw task start|red|done <ref> <taskId>`.

Behaviour:
- `taskStart`: guard, set task `in_progress`, write. Print `✓ T1 in progress. Write the test at <path>, then: dnw task red <ref> T1`.
- `taskRed`: guard in-progress; test file must exist at `<root>/<testPath>` else `DnwError('Test file <path> does not exist')`; run `renderFileCommand(cfg.testFileCommand, testPath)`; exit 0 → `DnwError('Test passed, but it must fail first. Write a test that fails for the missing behavior.')`; non-zero → `recordRun(... 'red' ...)`, print `✓ Red recorded. Implement, then: dnw task done <ref> T1`.
- `taskDone`: guard in-progress; no `red` evidence → `DnwError('No failing run recorded', 'dnw task red <ref> T1')`; run file command, non-zero → `DnwError('Task test fails:\n<last 20 lines of output>')`; run `cfg.testCommand`, non-zero → `DnwError('Full test suite fails:\n<last 20 lines>')`; then `recordRun(... 'green' ...)`, set task `done`, write, print `✓ T1 done.` plus `Next: dnw task start <ref> <next todo>` or `Next: dnw spec done <ref>` when none left.
- Neither red nor done changes the spec file when they reject.

- [ ] **Step 1: Write failing tests** — `renderFileCommand('go test ./{dir}', 'pkg/auth/login_test.go') === 'go test ./pkg/auth'`; `recordRun`/`readRuns` round-trip; and with an active spec fixture and a scripted `run` stub (`exitCodes` queue):
  - start → task `[~]`; start second task while first in progress → rejects.
  - red with missing test file → rejects, no evidence.
  - red when stub returns 0 → rejects `must fail first`.
  - red when stub returns 1 → evidence recorded with `at` from `ctx.now()`.
  - done without red → rejects with `next` `dnw task red 0001.api T1`.
  - done when file test passes but suite fails → rejects, task still `[~]`.
  - done happy path → task `[x]`, `green` recorded, output contains `Next: dnw spec done 0001.api` when last task.
  - stub receives `npx vitest run tests/login.test.ts` then `npm test` (asserts the exact commands).
- [ ] **Step 2: Run to verify fail** — `npx vitest run tests/core/runs.test.ts tests/commands/task.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the three modules and CLI wiring.
- [ ] **Step 4: Run to verify pass** — then `npx vitest run` — Expected: all pass.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: task start/red/done with TDD evidence"`

---

### Task 8: Status command

**Files:**
- Create: `src/commands/status.ts`
- Modify: `src/cli.ts`
- Test: `tests/commands/status.test.ts`

**Interfaces:**
- Consumes: `listSpecs`, `readRuns`, `findRoot`.
- Produces: `status(ctx: Ctx): Promise<void>`; CLI `dnw status`.

Output format (groups in order draft, review, active, done, superseded; empty groups omitted):
```
ACTIVE
  0001.api  User login        T2 in progress (red ✓)
            Next: dnw task done 0001.api T2
REVIEW
  0001.ui   User login        Next: dnw spec activate 0001.ui  (human)
DRAFT
  0002.api  Payments          Next: dnw spec review 0002.api
```
Next-command rules: draft → `spec review`; review → `spec activate … (human)`; active with in-progress task → `task red` if no red evidence else `task done`; active with no in-progress and todo left → `task start <ref> <first todo>`; active all done → `spec done`; done/superseded → none. Superseded rows show `→ <supersededBy>`.
Warning: an `active` or `done` spec with `approvedBy: null` gets the suffix `⚠ not approved via dnw`.
Empty project prints `No specs yet. Next: dnw spec new "<title>" --type api`.

- [ ] **Step 1: Write failing tests** — fixture with one spec per state → assert each `Next:` line; hand-edited `status: active` with `approvedBy: null` → output contains `⚠ not approved via dnw`; empty project message; run from `<root>/src` (cwd) works.
- [ ] **Step 2: Run to verify fail** — `npx vitest run tests/commands/status.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `status.ts` and wiring. Pad ref column to 10 chars, title column to 18.
- [ ] **Step 4: Run to verify pass** — Expected: all pass.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: status command with next-step hints"`

---

### Task 9: Manifest and AI adapters

**Files:**
- Create: `src/core/manifest.ts`, `src/adapters/index.ts`, `src/adapters/instructions.ts`, `src/adapters/claude.ts`, `src/adapters/codex.ts`, `src/adapters/antigravity.ts`, `templates/instructions.md`
- Test: `tests/core/manifest.test.ts`, `tests/adapters.test.ts`

**Interfaces:**
- Consumes: `DnwConfig` (Task 4), `readTemplate`/`render` (Task 3).
- Produces:
  ```ts
  interface AdapterFile { path: string; content: string; mode: 'whole' | 'marker' }
  renderInstructions(cfg: DnwConfig): string
  adapterFiles(cfg: DnwConfig): AdapterFile[]          // union of selected tools, de-duplicated by path
  interface Manifest { toolVersion: string; files: Record<string, string> }   // path -> sha256 of managed content
  hash(content: string): string                        // sha256 hex of content with \r\n normalized to \n
  applyMarkerBlock(existing: string | null, block: string): string
  readManifest(root: string): Manifest | null
  writeManifest(root: string, m: Manifest): void
  writeManagedFiles(root: string, files: AdapterFile[], prev: Manifest | null, toolVersion: string):
    { manifest: Manifest; written: string[]; conflicts: string[] }
  ```

`templates/instructions.md` content (rendered with `{{testCommand}}`, `{{testFileCommand}}`): project docs map (`docs/architecture`, `docs/products`, `docs/design-system`, `docs/specs`); spec types api/ui and pairing by id; lifecycle; **"Never edit `status`, `approvedBy`, `supersededBy` or task checkboxes by hand — use `dnw` commands."**; **"Never run `dnw spec activate` — a human approves specs."**; the per-task loop `dnw task start` → write test → `dnw task red` → implement → `dnw task done`; "run `dnw status` when unsure what to do next".

Adapter output:
- claude: `CLAUDE.md` (marker, instructions); `.claude/commands/dnw-spec-new.md`, `dnw-spec-review.md`, `dnw-task-start.md`, `dnw-task-red.md`, `dnw-task-done.md`, `dnw-status.md` (whole). Each command file has frontmatter `description:` and a body that runs the matching `dnw` command with `$ARGUMENTS` and states the next step.
- codex: `AGENTS.md` (marker, instructions).
- antigravity: `.agent/rules/dnw.md` (whole, instructions) and `.agent/workflows/dnw-spec.md`, `dnw-task.md` (whole). **Before implementing, check the current Antigravity docs for rule/workflow file locations and frontmatter; if they differ, follow the docs and note the change in the commit message.**
- `aiTools: []` → no files.

`applyMarkerBlock`: `null` → block wrapped in markers + `\n`; existing without markers → existing + `\n\n` + wrapped block; existing with markers → replace between markers only.
`writeManagedFiles`: for `marker` files always apply block; manifest hash = hash(block). For `whole` files: if file missing or `hash(current) === prev.files[path]` → write; else write `<path>.new` and add to `conflicts`. Manifest hash = hash(new content).

- [ ] **Step 1: Write failing tests**
  - `applyMarkerBlock` three cases; user text before and after markers survives a replace.
  - `hash('a\r\nb') === hash('a\nb')`.
  - `adapterFiles({ aiTools: ['claude','codex'], … })` paths include `CLAUDE.md`, `AGENTS.md`, six `.claude/commands/dnw-*.md`; none under `.agent/`.
  - rendered instructions contain the config's `testCommand` and `Never run \`dnw spec activate\``.
  - `writeManagedFiles`: fresh write → no conflicts; second run with modified `.claude/commands/dnw-status.md` → that path in `conflicts`, `dnw-status.md.new` exists, original untouched; unmodified file is overwritten with new content.
- [ ] **Step 2: Run to verify fail** — `npx vitest run tests/core/manifest.test.ts tests/adapters.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** modules and template.
- [ ] **Step 4: Run to verify pass** — Expected: all pass.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: AI adapters and managed-file manifest"`

---

### Task 10: `dnw init`

**Files:**
- Create: `src/commands/init.ts`, `templates/docs-readme/design-system.md`, `architecture.md`, `products.md`, `specs.md`
- Modify: `src/cli.ts`, `src/core/context.ts` (add prompt methods to `Ctx`)
- Test: `tests/commands/init.test.ts`

**Interfaces:**
- Consumes: Tasks 4, 9.
- Adds to `Ctx`:
  ```ts
  select<T extends string>(message: string, choices: { value: T; name: string }[], def?: T): Promise<T>
  checkbox<T extends string>(message: string, choices: { value: T; name: string }[]): Promise<T[]>
  input(message: string, def: string): Promise<string>
  ```
  (`defaultCtx` uses `@inquirer/prompts`; `testCtx` takes scripted `answers: unknown[]` consumed in order.)
- Produces:
  ```ts
  interface InitOptions { yes?: boolean; stack?: StackId; ai?: AiTool[]; testCommand?: string; testFileCommand?: string }
  init(ctx: Ctx, opts: InitOptions): Promise<void>
  ```
- CLI: `dnw init [--yes] [--stack <id>] [--ai <list>] [--test-command <cmd>] [--test-file-command <cmd>]`; `--ai none` → `[]`.

Behaviour (operates on `ctx.cwd`, not `findRoot`):
1. If `.dnw/config.json` exists → `DnwError('Already initialized', 'dnw upgrade')`.
2. Stack: `opts.stack` ?? (yes ? detected : `select` with detected as default).
3. Print `Recommended test framework: <framework>`. testCommand / testFileCommand: opts ?? (yes ? recommendation : `input` with recommendation as default). Stack `other` with `--yes` and no commands → `DnwError('Stack "other" needs --test-command and --test-file-command')`.
4. AI tools: `opts.ai` ?? (yes ? `[]` : `checkbox` of Claude Code / Antigravity / ChatGPT (Codex); none checked = none).
5. For each of `design-system`, `architecture`, `products`, `specs` under `docs/`: create dir if missing; write `README.md` from template only if the dir was created.
6. `writeConfig` with `toolVersion = packageVersion()`; `writeManagedFiles(…, prev = null)`; `writeManifest`.
7. Print summary: created paths, then `Next: dnw spec new "<title>" --type api`.

- [ ] **Step 1: Write failing tests**
  - `init(ctx, { yes: true, stack: 'nextjs', ai: ['claude'] })` → config equals `{ toolVersion: '0.1.0', stack: 'nextjs', testCommand: 'npm test', testFileCommand: 'npx vitest run {file}', aiTools: ['claude'] }`; `docs/specs/README.md` and `CLAUDE.md` exist; `.dnw/manifest.json` lists `CLAUDE.md`.
  - interactive with answers `['go', 'go test ./...', 'go test ./{dir}', ['codex','antigravity']]` → config matches, `AGENTS.md` and `.agent/rules/dnw.md` exist.
  - existing `docs/architecture/notes.md` and existing `CLAUDE.md` with `# Mine` → both preserved; `CLAUDE.md` still starts with `# Mine`; no README written into existing `docs/architecture/`.
  - second `init` → rejects with `next: 'dnw upgrade'`.
  - `--yes --stack other` without commands → rejects.
- [ ] **Step 2: Run to verify fail** — `npx vitest run tests/commands/init.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `init.ts`, README templates (2–4 lines each describing the folder's purpose), Ctx prompt methods, CLI wiring.
- [ ] **Step 4: Run to verify pass** — then `npx vitest run` — Expected: all pass.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: dnw init"`

---

### Task 11: `dnw upgrade`, migrations, version warning

**Files:**
- Create: `src/commands/upgrade.ts`, `src/migrations/index.ts`, `CHANGELOG.md`
- Modify: `src/cli.ts` (version-mismatch warning before every command except `init`/`upgrade`/`--version`)
- Test: `tests/commands/upgrade.test.ts`

**Interfaces:**
- Consumes: Tasks 4, 9; `semver`.
- Produces:
  ```ts
  interface MigrationChange { file: string; before: string; after: string }
  interface Migration { version: string; description: string; plan(root: string): MigrationChange[] }
  migrations: Migration[]                                    // empty in 0.1.0
  pendingMigrations(from: string, to: string, list?: Migration[]): Migration[]   // from < m.version <= to, ascending
  changelogBetween(changelog: string, from: string, to: string): string        // "## x.y.z" sections in (from, to]
  upgrade(ctx: Ctx, opts: { yes?: boolean; migrations?: Migration[]; changelog?: string }): Promise<void>
  ```
- CLI: `dnw upgrade [--yes]`.

Behaviour:
1. `cfg = readConfig(root)`; `to = packageVersion()`. If `semver.gt(cfg.toolVersion, to)` → `DnwError('Project uses dnw <v>, newer than installed <to>', 'npm i -D dev-nickole-workflow@latest')`. If equal → print `Already up to date (<to>)` and return.
2. `writeManagedFiles(root, adapterFiles(cfg), readManifest(root), to)`; print each conflict as `⚠ <path> was modified locally; new version written to <path>.new`.
3. For each pending migration: print description and, per change, the file path and a `-`/`+` line diff; `yes || await ctx.confirm('Apply?')` → write `after`; declined → print `Skipped <version>` and stop (do not bump `toolVersion` past a skipped migration: set it to the last applied version, or leave unchanged).
4. Set `cfg.toolVersion = to` (when nothing skipped), `writeConfig`, `writeManifest`.
5. Print `changelogBetween(...)` from the package's `CHANGELOG.md` (or `opts.changelog`).

Version warning in `cli.ts`: if `.dnw/config.json` is found from cwd and its `toolVersion` ≠ `packageVersion()`, write `⚠ This project uses dnw <v>; installed is <w>. Run: dnw upgrade` to `ctx.err` and continue.

`CHANGELOG.md` initial content: `# Changelog\n\n## 0.1.0\n\n- Initial release: init, spec, task, status, upgrade.\n`.

- [ ] **Step 1: Write failing tests**
  - project initialized with `ai: ['claude']`; then simulate an older install: set `toolVersion` to `0.0.9`, overwrite `.claude/commands/dnw-status.md` with `old`, and set its manifest hash to `hash('old')` → upgrade replaces the file with the current rendered content, no conflicts, `toolVersion` becomes `0.1.0`.
  - `toolVersion` equal to installed → prints `Already up to date (0.1.0)`; `toolVersion: '9.0.0'` → rejects with `next` `npm i -D dev-nickole-workflow@latest`.
  - locally modified `.claude/commands/dnw-status.md` → kept, `.new` written, warning printed.
  - `docs/` files byte-identical before and after an upgrade with no migrations.
  - fake migration `{ version: '0.1.0', plan: () => [{ file: 'docs/specs/x.md', before: 'a', after: 'b' }] }` with `confirm → false` → file unchanged, `toolVersion` stays `0.0.9`; with `yes: true` → file changed.
  - `pendingMigrations('0.0.9', '0.2.0', [m('0.1.0'), m('0.2.0'), m('0.3.0')])` → versions `['0.1.0','0.2.0']`.
  - `changelogBetween` returns only sections in range.
  - `main(['node','dnw','status'])` in a project with `toolVersion: '0.0.9'` → `errText` contains `Run: dnw upgrade`, exit code 0.
- [ ] **Step 2: Run to verify fail** — `npx vitest run tests/commands/upgrade.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** modules, changelog, warning.
- [ ] **Step 4: Run to verify pass** — then `npx vitest run` — Expected: all pass.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: dnw upgrade with migrations and version warning"`

---

### Task 12: End-to-end test, README, packaging

**Files:**
- Create: `tests/e2e.test.ts`, `README.md`
- Modify: `package.json` (add `"prepublishOnly": "npm run build && npm test"`)

**Interfaces:**
- Consumes: the built binary `dist/bin.js`.

- [ ] **Step 1: Write the failing e2e test** — in a temp dir with its own `package.json` whose `test` script is `node check.js` (`check.js` exits 0 if `src/ok.txt` exists, else 1), using `spawnSync('node', [binPath, ...args], { cwd })`:
  1. `init --yes --stack node-api --ai claude --test-command "npm test" --test-file-command "node check.js"` → exit 0.
  2. `spec new "Smoke" --type api` → exit 0; fill sections and add `- [ ] T1: ok file (test: check.js)`.
  3. `spec review 0001.api` → exit 0.
  4. `spec activate 0001.api` (non-TTY under spawnSync) → exit 1, stderr contains `interactive terminal`.
  5. Set `status: active` and `approvedBy: e2e` by direct edit (simulating human approval), `task start 0001.api T1` → 0; `task red` → 0; create `src/ok.txt`; `task done` → 0; `spec done 0001.api` → 0.
  6. `status` → stdout contains `DONE` and `0001.api`.
- [ ] **Step 2: Run to verify fail** — `npm run build && npx vitest run tests/e2e.test.ts` — Expected: FAIL only if wiring gaps exist; fix them in this task.
- [ ] **Step 3: Write `README.md`** — install (`npm i -D dev-nickole-workflow`, `npx dnw init`), the lifecycle diagram from the spec, command table, the per-task SDD+TDD loop, upgrading (`npm i -D dev-nickole-workflow@latest && npx dnw upgrade`), and "releasing" (`npm version <patch|minor|major>`, add a CHANGELOG section, `npm publish`).
- [ ] **Step 4: Verify the package** — `npm run build && npx vitest run && npm pack --dry-run` — Expected: all tests pass; pack listing contains `dist/bin.js`, `templates/instructions.md`, `templates/spec.api.md`, `templates/spec.ui.md`, `CHANGELOG.md`, and no `tests/` or `src/`.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "test: end-to-end lifecycle; docs: README"`
