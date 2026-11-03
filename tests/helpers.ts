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
