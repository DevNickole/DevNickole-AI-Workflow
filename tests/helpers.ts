import type { Ctx } from '../src/core/context.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { writeConfig, type DnwConfig } from '../src/core/config.js';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

export function tmpProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'dnw-'));
  mkdirSync(join(root, 'docs', 'specs'), { recursive: true });
  dirs.push(root);
  return root;
}

export type TestCtx = Ctx & { outText(): string; errText(): string };

/** `answers` are consumed in order by select / checkbox / input prompts. */
export function testCtx(over: Partial<Ctx> & { answers?: unknown[] } = {}): TestCtx {
  const out: string[] = [];
  const err: string[] = [];
  const { answers = [], ...rest } = over;
  const next = async <T>(message: string): Promise<T> => {
    if (!answers.length) throw new Error(`no scripted answer for prompt: ${message}`);
    return answers.shift() as T;
  };
  return {
    cwd: process.cwd(),
    isTTY: true,
    out: (s) => void out.push(s),
    err: (s) => void err.push(s),
    confirm: async () => true,
    gitUser: () => 'Tester',
    now: () => '2026-01-01T00:00:00.000Z',
    run: () => {
      throw new Error('no run stub');
    },
    select: (message) => next(message),
    checkbox: (message) => next(message),
    input: (message) => next(message),
    ...rest,
    outText: () => out.join(''),
    errText: () => err.join(''),
  };
}

export function initProject(over: Partial<DnwConfig> = {}): string {
  const root = tmpProject();
  writeConfig(root, {
    toolVersion: '0.1.0',
    stack: 'node-api',
    testCommand: 'npm test',
    testFileCommand: 'npx vitest run {file}',
    aiTools: [],
    superpowers: false,
    ...over,
  });
  return root;
}

/** Replace every template hint with content and add tasks, like an AI filling a draft. */
export function fillSpec(path: string, tasks = ['- [ ] T1: Does the thing (test: tests/t1.test.ts)']): void {
  const text = readFileSync(path, 'utf8').replace(/<!--[\s\S]*?-->/g, 'Filled.');
  writeFileSync(path, text.trimEnd() + '\n' + tasks.join('\n') + '\n');
}
