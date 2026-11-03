import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fillSpec, initProject, testCtx } from '../helpers.js';
import { specActivate, specNew, specReview, specSupersede } from '../../src/commands/spec.js';
import { findSpec, specFileName } from '../../src/core/spec-store.js';
import { main } from '../../src/cli.js';

test('spec new assigns sequential ids', async () => {
  const root = initProject();
  const ctx = testCtx({ cwd: root });
  const a = await specNew(ctx, 'User login', { type: 'api' });
  const b = await specNew(ctx, 'Payments', { type: 'api' });
  expect([a.meta.id, b.meta.id]).toEqual(['0001', '0002']);
  expect(basename(a.path)).toBe(specFileName('0001', 'User login', 'api'));
  expect(ctx.outText()).toContain('✓ Created docs/specs/0001-user-login.api.md (draft)');
});

test('ui half of a pair depends on the api half', async () => {
  const root = initProject();
  const ctx = testCtx({ cwd: root });
  await specNew(ctx, 'User login', { type: 'api' });
  const ui = await specNew(ctx, 'User login', { type: 'ui', id: '0001' });
  expect(ui.meta.dependsOn).toBe('0001.api');
});

test('--id for an existing type is rejected', async () => {
  const root = initProject();
  const ctx = testCtx({ cwd: root });
  await specNew(ctx, 'User login', { type: 'api' });
  await expect(specNew(ctx, 'Again', { type: 'api', id: '0001' })).rejects.toThrow(/already exists/);
});

test('--id for an unknown id is rejected', async () => {
  const ctx = testCtx({ cwd: initProject() });
  await expect(specNew(ctx, 'X', { type: 'ui', id: '0005' })).rejects.toThrow(/No spec 0005 exists/);
});

test('draft → review → active records approver', async () => {
  const root = initProject();
  const ctx = testCtx({ cwd: root });
  const doc = await specNew(ctx, 'User login', { type: 'api' });
  fillSpec(doc.path);
  await specReview(ctx, '0001.api');
  await specActivate(ctx, '0001.api');
  expect(findSpec(root, '0001.api').meta).toMatchObject({ status: 'active', approvedBy: 'Tester' });
});

test('activate without a TTY leaves the file unchanged', async () => {
  const root = initProject();
  const doc = await specNew(testCtx({ cwd: root }), 'User login', { type: 'api' });
  fillSpec(doc.path);
  await specReview(testCtx({ cwd: root }), '0001.api');
  const before = readFileSync(doc.path, 'utf8');
  await expect(specActivate(testCtx({ cwd: root, isTTY: false }), '0001.api')).rejects.toThrow(/interactive terminal/);
  expect(readFileSync(doc.path, 'utf8')).toBe(before);
});

test('declined confirmation cancels activation', async () => {
  const root = initProject();
  const doc = await specNew(testCtx({ cwd: root }), 'User login', { type: 'api' });
  fillSpec(doc.path);
  await specReview(testCtx({ cwd: root }), '0001.api');
  const before = readFileSync(doc.path, 'utf8');
  await expect(specActivate(testCtx({ cwd: root, confirm: async () => false }), '0001.api')).rejects.toThrow(/cancelled/);
  expect(readFileSync(doc.path, 'utf8')).toBe(before);
});

test('CLI prints reason and next step when pair is still draft', async () => {
  const root = initProject();
  const ctx = testCtx({ cwd: root });
  await specNew(ctx, 'User login', { type: 'api' });
  const ui = await specNew(ctx, 'User login', { type: 'ui', id: '0001' });
  fillSpec(ui.path);
  await specReview(ctx, '0001.ui');
  const cli = testCtx({ cwd: root });
  expect(await main(['node', 'dnw', 'spec', 'activate', '0001.ui'], cli)).toBe(1);
  expect(cli.errText()).toContain('✗ Cannot activate 0001.ui: paired 0001.api is still in draft');
  expect(cli.errText()).toContain('Next: dnw spec review 0001.api');
});

test('CLI spec new works end to end', async () => {
  const root = initProject();
  const cli = testCtx({ cwd: root });
  expect(await main(['node', 'dnw', 'spec', 'new', 'User login', '--type', 'api'], cli)).toBe(0);
  expect(findSpec(root, '0001.api').meta.title).toBe('User login');
});

test('supersede links old to new', async () => {
  const root = initProject();
  const ctx = testCtx({ cwd: root });
  await specNew(ctx, 'Old login', { type: 'api' });
  await specNew(ctx, 'New login', { type: 'api' });
  await specSupersede(ctx, '0001.api', '0002.api');
  expect(findSpec(root, '0001.api').meta).toMatchObject({ status: 'superseded', supersededBy: '0002.api' });
});
