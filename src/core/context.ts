import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { confirm } from '@inquirer/prompts';
import { DnwError } from './errors.js';

export interface RunResult {
  exitCode: number;
  output: string;
}

export interface Ctx {
  cwd: string;
  isTTY: boolean;
  out(s: string): void;
  err(s: string): void;
  confirm(message: string): Promise<boolean>;
  gitUser(): string;
  now(): string;
  run(cmd: string, cwd: string): RunResult;
}

export function defaultCtx(): Ctx {
  return {
    cwd: process.cwd(),
    isTTY: Boolean(process.stdin.isTTY),
    out: (s) => process.stdout.write(s),
    err: (s) => process.stderr.write(s),
    confirm: (message) => confirm({ message }),
    gitUser: () => {
      const r = spawnSync('git', ['config', 'user.name'], { encoding: 'utf8' });
      return r.status === 0 && r.stdout.trim() ? r.stdout.trim() : 'unknown';
    },
    now: () => new Date().toISOString(),
    run: (cmd, cwd) => {
      const r = spawnSync(cmd, { cwd, shell: true, encoding: 'utf8' });
      return { exitCode: r.status ?? 1, output: `${r.stdout ?? ''}${r.stderr ?? ''}` };
    },
  };
}

export function findRoot(cwd: string): string {
  let dir = resolve(cwd);
  for (;;) {
    if (existsSync(join(dir, '.dnw', 'config.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new DnwError('Not a dnw project (no .dnw/config.json found)', 'dnw init');
    dir = parent;
  }
}
