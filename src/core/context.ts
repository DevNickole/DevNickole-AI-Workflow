import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { checkbox, confirm, input, select } from '@inquirer/prompts';
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
  select<T extends string>(message: string, choices: Choice<T>[], def?: T): Promise<T>;
  checkbox<T extends string>(message: string, choices: Choice<T>[]): Promise<T[]>;
  input(message: string, def: string): Promise<string>;
}

export interface Choice<T extends string> {
  value: T;
  name: string;
  /** preselected in a checkbox prompt */
  checked?: boolean;
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
    select: (message, choices, def) => select({ message, choices, default: def }),
    checkbox: (message, choices) => checkbox({ message, choices }),
    input: (message, def) => input({ message, default: def }),
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
