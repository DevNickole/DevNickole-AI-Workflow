import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpProject, testCtx } from '../helpers.js';
import { init } from '../../src/commands/init.js';
import { readConfig } from '../../src/core/config.js';
import { readManifest } from '../../src/core/manifest.js';

const read = (root: string, p: string) => readFileSync(join(root, p), 'utf8');

test('--yes with nextjs and claude', async () => {
  const root = tmpProject();
  await init(testCtx({ cwd: root }), { yes: true, stack: 'nextjs', ai: ['claude'] });
  expect(readConfig(root)).toEqual({
    toolVersion: '0.1.0',
    stack: 'nextjs',
    testCommand: 'npm test',
    testFileCommand: 'npx vitest run {file}',
    aiTools: ['claude'],
    superpowers: true,
  });
  expect(existsSync(join(root, 'docs/specs/README.md'))).toBe(false); // docs/specs already existed in tmpProject
  expect(existsSync(join(root, 'docs/architecture/README.md'))).toBe(true);
  expect(existsSync(join(root, 'CLAUDE.md'))).toBe(true);
  expect(JSON.parse(read(root, '.claude/settings.json')).enabledPlugins['superpowers@claude-plugins-official']).toBe(true);
  expect(Object.keys(readManifest(root)!.files)).toContain('CLAUDE.md');
});

test('interactive go + codex + antigravity installs superpowers via agy', async () => {
  const root = tmpProject();
  const calls: string[] = [];
  const ctx = testCtx({
    cwd: root,
    answers: ['go', 'go test ./...', 'go test ./{dir}', ['codex', 'antigravity']],
    run: (cmd) => (calls.push(cmd), { exitCode: 0, output: '' }),
  });
  await init(ctx, {});
  expect(readConfig(root)).toMatchObject({ stack: 'go', testCommand: 'go test ./...', testFileCommand: 'go test ./{dir}', aiTools: ['codex', 'antigravity'], superpowers: true });
  expect(existsSync(join(root, 'AGENTS.md'))).toBe(true);
  expect(existsSync(join(root, '.agents/rules/dnw.md'))).toBe(true);
  expect(calls).toEqual(['agy --version', 'agy plugin install https://github.com/obra/superpowers']);
  expect(ctx.outText()).toContain('Codex: In Codex run /plugins');
  expect(ctx.outText()).toContain('Recommended test framework: go test');
});

test('missing agy prints the install command instead', async () => {
  const root = tmpProject();
  const calls: string[] = [];
  const ctx = testCtx({ cwd: root, run: (cmd) => (calls.push(cmd), { exitCode: 1, output: '' }) });
  await init(ctx, { yes: true, stack: 'node-api', ai: ['antigravity'] });
  expect(calls).toEqual(['agy --version']);
  expect(ctx.outText()).toContain('Run: agy plugin install https://github.com/obra/superpowers');
});

test('superpowers can be turned off', async () => {
  const root = tmpProject();
  await init(testCtx({ cwd: root }), { yes: true, stack: 'node-api', ai: ['claude'], superpowers: false });
  expect(readConfig(root).superpowers).toBe(false);
  expect(existsSync(join(root, '.claude/settings.json'))).toBe(false);
});

test('no AI tools means no superpowers and no question', async () => {
  const root = tmpProject();
  let asked = false;
  await init(testCtx({ cwd: root, confirm: async () => ((asked = true), true) }), { yes: true, stack: 'node-api', ai: [] });
  expect(readConfig(root).superpowers).toBe(false);
  expect(asked).toBe(false);
});

test('existing docs and CLAUDE.md are preserved', async () => {
  const root = tmpProject();
  mkdirSync(join(root, 'docs/architecture'), { recursive: true });
  writeFileSync(join(root, 'docs/architecture/notes.md'), 'mine');
  writeFileSync(join(root, 'CLAUDE.md'), '# Mine\n');
  await init(testCtx({ cwd: root }), { yes: true, stack: 'node-api', ai: ['claude'] });
  expect(read(root, 'docs/architecture/notes.md')).toBe('mine');
  expect(existsSync(join(root, 'docs/architecture/README.md'))).toBe(false);
  expect(read(root, 'CLAUDE.md').startsWith('# Mine')).toBe(true);
});

test('second init points to upgrade', async () => {
  const root = tmpProject();
  await init(testCtx({ cwd: root }), { yes: true, stack: 'node-api', ai: [] });
  await expect(init(testCtx({ cwd: root }), { yes: true, stack: 'node-api', ai: [] })).rejects.toThrow(
    expect.objectContaining({ next: 'dnw upgrade' }),
  );
});

test('--yes with stack other needs commands', async () => {
  await expect(init(testCtx({ cwd: tmpProject() }), { yes: true, stack: 'other', ai: [] })).rejects.toThrow(/needs --test-command/);
});
