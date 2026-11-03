import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readConfig } from '../core/config.js';
import { findRoot, type Ctx } from '../core/context.js';
import { DnwError, guard } from '../core/errors.js';
import { assertCanStartTask, assertTaskInProgress } from '../core/lifecycle.js';
import { readRuns, recordRun, runKey } from '../core/runs.js';
import { findSpec, writeSpec } from '../core/spec-store.js';
import { renderFileCommand, tail } from '../core/test-runner.js';

export async function taskStart(ctx: Ctx, ref: string, taskId: string): Promise<void> {
  const doc = findSpec(findRoot(ctx.cwd), ref);
  const task = guard('start', `${ref} ${taskId}`, () => assertCanStartTask(doc, taskId));
  task.state = 'in_progress';
  writeSpec(doc);
  ctx.out(`✓ ${taskId} in progress. Write the test at ${task.testPath}, then: dnw task red ${ref} ${taskId}\n`);
}

export async function taskRed(ctx: Ctx, ref: string, taskId: string): Promise<void> {
  const root = findRoot(ctx.cwd);
  const doc = findSpec(root, ref);
  const task = guard('record red for', `${ref} ${taskId}`, () => assertTaskInProgress(doc, taskId));
  const testPath = task.testPath!;
  if (!existsSync(join(root, testPath))) throw new DnwError(`Test file ${testPath} does not exist. Write it first.`);
  const cfg = readConfig(root);
  const result = ctx.run(renderFileCommand(cfg.testFileCommand, testPath), root);
  if (result.exitCode === 0) {
    throw new DnwError('Test passed, but it must fail first. Write a test that fails for the missing behavior.');
  }
  recordRun(root, runKey(ref, taskId), 'red', result.exitCode, ctx.now());
  ctx.out(`✓ Red recorded. Implement, then: dnw task done ${ref} ${taskId}\n`);
}

export async function taskDone(ctx: Ctx, ref: string, taskId: string): Promise<void> {
  const root = findRoot(ctx.cwd);
  const doc = findSpec(root, ref);
  const task = guard('finish', `${ref} ${taskId}`, () => assertTaskInProgress(doc, taskId));
  const key = runKey(ref, taskId);
  if (!readRuns(root)[key]?.red) throw new DnwError('No failing run recorded for this task', `dnw task red ${ref} ${taskId}`);
  const cfg = readConfig(root);
  const file = ctx.run(renderFileCommand(cfg.testFileCommand, task.testPath!), root);
  if (file.exitCode !== 0) throw new DnwError(`Task test fails:\n${tail(file.output)}`);
  const suite = ctx.run(cfg.testCommand, root);
  if (suite.exitCode !== 0) throw new DnwError(`Full test suite fails:\n${tail(suite.output)}`);
  recordRun(root, key, 'green', 0, ctx.now());
  task.state = 'done';
  writeSpec(doc);
  const next = doc.tasks.find((t) => t.state === 'todo');
  ctx.out(`✓ ${taskId} done.\n  Next: ${next ? `dnw task start ${ref} ${next.id}` : `dnw spec done ${ref}`}\n`);
}
