import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpProject } from './helpers.js';

const repo = fileURLToPath(new URL('..', import.meta.url));
const bin = join(repo, 'dist', 'bin.js');

beforeAll(() => {
  const r = spawnSync('npx', ['tsc', '-p', '.'], { cwd: repo, shell: true, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`build failed:\n${r.stdout}${r.stderr}`);
}, 120_000);

test('full lifecycle through the built binary', () => {
  const cwd = tmpProject();
  const dnw = (...args: string[]) => spawnSync('node', [bin, ...args], { cwd, encoding: 'utf8' });

  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'e2e', private: true, scripts: { test: 'node check.js' } }));
  writeFileSync(join(cwd, 'check.js'), "process.exit(require('fs').existsSync('src/ok.txt') ? 0 : 1);\n");

  let r = dnw('init', '--yes', '--stack', 'node-api', '--ai', 'claude', '--test-command', 'npm test', '--test-file-command', 'node check.js');
  expect(r.status, r.stderr).toBe(0);
  const settings = JSON.parse(readFileSync(join(cwd, '.claude', 'settings.json'), 'utf8'));
  expect(settings.enabledPlugins['superpowers@claude-plugins-official']).toBe(true);

  r = dnw('spec', 'new', 'Smoke', '--type', 'api');
  expect(r.status, r.stderr).toBe(0);
  const specPath = join(cwd, 'docs', 'specs', readdirSync(join(cwd, 'docs', 'specs')).find((f) => f.endsWith('.api.md'))!);
  const filled = readFileSync(specPath, 'utf8').replace(/<!--[\s\S]*?-->/g, 'Filled.');
  writeFileSync(specPath, filled.trimEnd() + '\n- [ ] T1: ok file (test: check.js)\n');

  r = dnw('spec', 'review', '0001.api');
  expect(r.status, r.stderr).toBe(0);

  r = dnw('spec', 'activate', '0001.api');
  expect(r.status).toBe(1);
  expect(r.stderr).toContain('interactive terminal');

  // a human approves (simulated, since this test has no TTY)
  writeFileSync(specPath, readFileSync(specPath, 'utf8').replace('status: review', 'status: active').replace('approvedBy: null', 'approvedBy: e2e'));

  for (const args of [['task', 'start', '0001.api', 'T1'], ['task', 'red', '0001.api', 'T1']]) {
    r = dnw(...args);
    expect(r.status, `${args.join(' ')}: ${r.stderr}`).toBe(0);
  }
  mkdirSync(join(cwd, 'src'), { recursive: true });
  writeFileSync(join(cwd, 'src', 'ok.txt'), 'ok');
  for (const args of [['task', 'done', '0001.api', 'T1'], ['spec', 'done', '0001.api']]) {
    r = dnw(...args);
    expect(r.status, `${args.join(' ')}: ${r.stderr}`).toBe(0);
  }

  r = dnw('status');
  expect(r.stdout).toContain('DONE');
  expect(r.stdout).toContain('0001.api');
}, 60_000);
