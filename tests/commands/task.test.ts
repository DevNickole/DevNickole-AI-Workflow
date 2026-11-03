import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fillSpec, initProject, testCtx } from '../helpers.js';
import { specActivate, specNew, specReview } from '../../src/commands/spec.js';
import { taskDone, taskRed, taskStart } from '../../src/commands/task.js';
import { findSpec } from '../../src/core/spec-store.js';
import { readRuns } from '../../src/core/runs.js';

async function activeProject(tasks = ['- [ ] T1: Returns token (test: tests/login.test.ts)', '- [ ] T2: Locks (test: tests/lock.test.ts)']) {
  const root = initProject();
  const ctx = testCtx({ cwd: root });
  const doc = await specNew(ctx, 'User login', { type: 'api' });
  fillSpec(doc.path, tasks);
  await specReview(ctx, '0001.api');
  await specActivate(ctx, '0001.api');
  return root;
}

function stub(exitCodes: number[]) {
  const calls: string[] = [];
  const run = (cmd: string) => {
    calls.push(cmd);
    return { exitCode: exitCodes.shift() ?? 0, output: `ran ${cmd}` };
  };
  return { calls, run };
}

function writeTest(root: string, path = 'tests/login.test.ts') {
  mkdirSync(join(root, 'tests'), { recursive: true });
  writeFileSync(join(root, path), '// test');
}

const state = (root: string, id: string) => findSpec(root, '0001.api').tasks.find((t) => t.id === id)!.state;

test('start marks task in progress and blocks a second one', async () => {
  const root = await activeProject();
  const ctx = testCtx({ cwd: root });
  await taskStart(ctx, '0001.api', 'T1');
  expect(state(root, 'T1')).toBe('in_progress');
  expect(ctx.outText()).toContain('dnw task red 0001.api T1');
  await expect(taskStart(ctx, '0001.api', 'T2')).rejects.toThrow(/T1 is already in progress/);
});

test('red rejects a missing test file and records nothing', async () => {
  const root = await activeProject();
  await taskStart(testCtx({ cwd: root }), '0001.api', 'T1');
  await expect(taskRed(testCtx({ cwd: root }), '0001.api', 'T1')).rejects.toThrow(/tests\/login\.test\.ts does not exist/);
  expect(readRuns(root)).toEqual({});
});

test('red rejects a passing test', async () => {
  const root = await activeProject();
  writeTest(root);
  await taskStart(testCtx({ cwd: root }), '0001.api', 'T1');
  const s = stub([0]);
  await expect(taskRed(testCtx({ cwd: root, run: s.run }), '0001.api', 'T1')).rejects.toThrow(/must fail first/);
  expect(readRuns(root)).toEqual({});
});

test('red records a failing run', async () => {
  const root = await activeProject();
  writeTest(root);
  await taskStart(testCtx({ cwd: root }), '0001.api', 'T1');
  const s = stub([1]);
  await taskRed(testCtx({ cwd: root, run: s.run }), '0001.api', 'T1');
  expect(s.calls).toEqual(['npx vitest run tests/login.test.ts']);
  expect(readRuns(root)['0001.api/T1'].red).toEqual({ at: '2026-01-01T00:00:00.000Z', exitCode: 1 });
});

test('done without red points to task red', async () => {
  const root = await activeProject();
  writeTest(root);
  await taskStart(testCtx({ cwd: root }), '0001.api', 'T1');
  await expect(taskDone(testCtx({ cwd: root, run: stub([0, 0]).run }), '0001.api', 'T1')).rejects.toThrow(
    expect.objectContaining({ next: 'dnw task red 0001.api T1' }),
  );
});

test('done rejects when the full suite fails', async () => {
  const root = await activeProject();
  writeTest(root);
  await taskStart(testCtx({ cwd: root }), '0001.api', 'T1');
  await taskRed(testCtx({ cwd: root, run: stub([1]).run }), '0001.api', 'T1');
  const before = readFileSync(findSpec(root, '0001.api').path, 'utf8');
  await expect(taskDone(testCtx({ cwd: root, run: stub([0, 1]).run }), '0001.api', 'T1')).rejects.toThrow(/Full test suite fails/);
  expect(state(root, 'T1')).toBe('in_progress');
  expect(readFileSync(findSpec(root, '0001.api').path, 'utf8')).toBe(before);
});

test('done happy path marks task done and points to spec done on the last task', async () => {
  const root = await activeProject(['- [ ] T1: Returns token (test: tests/login.test.ts)']);
  writeTest(root);
  await taskStart(testCtx({ cwd: root }), '0001.api', 'T1');
  await taskRed(testCtx({ cwd: root, run: stub([1]).run }), '0001.api', 'T1');
  const s = stub([0, 0]);
  const ctx = testCtx({ cwd: root, run: s.run });
  await taskDone(ctx, '0001.api', 'T1');
  expect(s.calls).toEqual(['npx vitest run tests/login.test.ts', 'npm test']);
  expect(state(root, 'T1')).toBe('done');
  expect(readRuns(root)['0001.api/T1'].green).toEqual({ at: '2026-01-01T00:00:00.000Z', exitCode: 0 });
  expect(ctx.outText()).toContain('Next: dnw spec done 0001.api');
});

test('done points to the next todo task', async () => {
  const root = await activeProject();
  writeTest(root);
  await taskStart(testCtx({ cwd: root }), '0001.api', 'T1');
  await taskRed(testCtx({ cwd: root, run: stub([1]).run }), '0001.api', 'T1');
  const ctx = testCtx({ cwd: root, run: stub([0, 0]).run });
  await taskDone(ctx, '0001.api', 'T1');
  expect(ctx.outText()).toContain('Next: dnw task start 0001.api T2');
});
