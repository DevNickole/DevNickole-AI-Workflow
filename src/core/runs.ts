import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface RunRecord {
  at: string;
  exitCode: number;
}

export interface RunEvidence {
  red?: RunRecord;
  green?: RunRecord;
}

function runsPath(root: string): string {
  return join(root, '.dnw', 'runs.json');
}

export function runKey(ref: string, taskId: string): string {
  return `${ref}/${taskId}`;
}

export function readRuns(root: string): Record<string, RunEvidence> {
  const path = runsPath(root);
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
}

export function recordRun(root: string, key: string, kind: 'red' | 'green', exitCode: number, at: string): void {
  const runs = readRuns(root);
  runs[key] = { ...runs[key], [kind]: { at, exitCode } };
  mkdirSync(join(root, '.dnw'), { recursive: true });
  writeFileSync(runsPath(root), JSON.stringify(runs, null, 2) + '\n');
}
