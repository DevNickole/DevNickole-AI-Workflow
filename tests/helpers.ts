import type { Ctx } from '../src/core/context.js';
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

export function testCtx(over: Partial<Ctx> = {}): TestCtx {
  const out: string[] = [];
  const err: string[] = [];
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
    ...over,
    outText: () => out.join(''),
    errText: () => err.join(''),
  };
}
