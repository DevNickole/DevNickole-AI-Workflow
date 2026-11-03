import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpProject, testCtx } from '../helpers.js';
import { init } from '../../src/commands/init.js';
import { upgrade } from '../../src/commands/upgrade.js';
import { readConfig, writeConfig } from '../../src/core/config.js';
import { hash, readManifest, writeManifest } from '../../src/core/manifest.js';
import { changelogBetween, pendingMigrations, type Migration } from '../../src/migrations/index.js';
import { main } from '../../src/cli.js';

const STATUS_CMD = '.claude/commands/dnw-status.md';

async function project() {
  const root = tmpProject();
  await init(testCtx({ cwd: root }), { yes: true, stack: 'node-api', ai: ['claude'] });
  return root;
}

function setVersion(root: string, v: string) {
  writeConfig(root, { ...readConfig(root), toolVersion: v });
}

const m = (version: string, file = 'docs/specs/x.md'): Migration => ({
  version,
  description: `migration ${version}`,
  plan: () => [{ file, before: 'a', after: 'b' }],
});

test('replaces unmodified managed files from an older version', async () => {
  const root = await project();
  const current = readFileSync(join(root, STATUS_CMD), 'utf8');
  setVersion(root, '0.0.9');
  writeFileSync(join(root, STATUS_CMD), 'old');
  const man = readManifest(root)!;
  writeManifest(root, { ...man, files: { ...man.files, [STATUS_CMD]: hash('old') } });
  const ctx = testCtx({ cwd: root });
  await upgrade(ctx, { yes: true, migrations: [], changelog: '' });
  expect(readFileSync(join(root, STATUS_CMD), 'utf8')).toBe(current);
  expect(ctx.outText()).not.toContain('⚠');
  expect(readConfig(root).toolVersion).toBe('0.1.0');
});

test('keeps locally modified files and writes .new', async () => {
  const root = await project();
  setVersion(root, '0.0.9');
  writeFileSync(join(root, STATUS_CMD), 'my edit');
  const ctx = testCtx({ cwd: root });
  await upgrade(ctx, { yes: true, migrations: [], changelog: '' });
  expect(readFileSync(join(root, STATUS_CMD), 'utf8')).toBe('my edit');
  expect(readFileSync(join(root, STATUS_CMD + '.new'), 'utf8')).toContain('Run `dnw status`');
  expect(ctx.outText()).toContain(`⚠ ${STATUS_CMD} was modified locally; new version written to ${STATUS_CMD}.new`);
});

test('docs are untouched without migrations', async () => {
  const root = await project();
  writeFileSync(join(root, 'docs/architecture/notes.md'), 'mine');
  const snapshot = (dir: string) => readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile()).map((e) => readFileSync(join(e.parentPath, e.name), 'utf8')).join('|');
  const before = snapshot(join(root, 'docs'));
  setVersion(root, '0.0.9');
  await upgrade(testCtx({ cwd: root }), { yes: true, migrations: [], changelog: '' });
  expect(snapshot(join(root, 'docs'))).toBe(before);
});

test('declined migration leaves file and version', async () => {
  const root = await project();
  writeFileSync(join(root, 'docs/specs/x.md'), 'a');
  setVersion(root, '0.0.9');
  const ctx = testCtx({ cwd: root, confirm: async () => false });
  await upgrade(ctx, { migrations: [m('0.1.0')], changelog: '' });
  expect(readFileSync(join(root, 'docs/specs/x.md'), 'utf8')).toBe('a');
  expect(readConfig(root).toolVersion).toBe('0.0.9');
  expect(ctx.outText()).toContain('Skipped 0.1.0');
});

test('accepted migration is applied', async () => {
  const root = await project();
  writeFileSync(join(root, 'docs/specs/x.md'), 'a');
  setVersion(root, '0.0.9');
  await upgrade(testCtx({ cwd: root }), { yes: true, migrations: [m('0.1.0')], changelog: '' });
  expect(readFileSync(join(root, 'docs/specs/x.md'), 'utf8')).toBe('b');
  expect(readConfig(root).toolVersion).toBe('0.1.0');
});

test('already up to date', async () => {
  const root = await project();
  const ctx = testCtx({ cwd: root });
  await upgrade(ctx, { migrations: [], changelog: '' });
  expect(ctx.outText()).toContain('Already up to date (0.1.0)');
});

test('project newer than installed is rejected', async () => {
  const root = await project();
  setVersion(root, '9.0.0');
  await expect(upgrade(testCtx({ cwd: root }), { migrations: [], changelog: '' })).rejects.toThrow(
    expect.objectContaining({
      next: 'npm i -g https://github.com/DevNickole/DevNickole-AI-Workflow/archive/refs/tags/v9.0.0.tar.gz',
    }),
  );
});

test('pendingMigrations selects (from, to]', () =>
  expect(pendingMigrations('0.0.9', '0.2.0', [m('0.3.0'), m('0.1.0'), m('0.2.0')]).map((x) => x.version)).toEqual(['0.1.0', '0.2.0']));

test('changelogBetween returns sections in range', () => {
  const log = '# Changelog\n\n## 0.3.0\n\n- three\n\n## 0.2.0\n\n- two\n\n## 0.1.0\n\n- one\n';
  const out = changelogBetween(log, '0.1.0', '0.2.0');
  expect(out).toContain('- two');
  expect(out).not.toContain('- one');
  expect(out).not.toContain('- three');
});

test('CLI warns when project version differs', async () => {
  const root = await project();
  setVersion(root, '0.0.9');
  const ctx = testCtx({ cwd: root });
  expect(await main(['node', 'dnw', 'status'], ctx)).toBe(0);
  expect(ctx.errText()).toContain('⚠ This project uses dnw 0.0.9; installed is 0.1.0. Run: dnw upgrade');
});
