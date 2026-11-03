import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tmpProject } from '../helpers.js';
import { readConfig, writeConfig, type DnwConfig } from '../../src/core/config.js';
import { findRoot } from '../../src/core/context.js';

const cfg: DnwConfig = {
  toolVersion: '0.1.0',
  stack: 'nextjs',
  testCommand: 'npm test',
  testFileCommand: 'npx vitest run {file}',
  aiTools: ['claude'],
  superpowers: true,
};

test('config round-trips', () => {
  const root = tmpProject();
  writeConfig(root, cfg);
  expect(readConfig(root)).toEqual(cfg);
});

test('missing config points to init', () =>
  expect(() => readConfig(tmpProject())).toThrow(expect.objectContaining({ next: 'dnw init' })));

test('findRoot walks up from a subdirectory', () => {
  const root = tmpProject();
  writeConfig(root, cfg);
  const sub = join(root, 'src', 'components');
  mkdirSync(sub, { recursive: true });
  expect(findRoot(sub)).toBe(root);
});

test('findRoot outside a project fails', () =>
  expect(() => findRoot(mkdtempSync(join(tmpdir(), 'nodnw-')))).toThrow(/Not a dnw project/));
