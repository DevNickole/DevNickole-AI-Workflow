import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpProject } from './helpers.js';

const repo = fileURLToPath(new URL('..', import.meta.url));
const bin = join(repo, 'dist', 'bin.js');

beforeAll(() => {
  const r = spawnSync('npx', ['tsc', '-p', '.'], { cwd: repo, shell: true, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`build failed:\n${r.stdout}${r.stderr}`);
}, 120_000);

/** Runs dnw with its output closed straight away, like `dnw ... | head -1`. */
function runWithClosedOutput(cwd: string, ...args: string[]): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('node', [bin, ...args], { cwd });
    child.stdout.destroy();
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => resolve({ code, stderr }));
  });
}

describe('when whatever reads the output stops early', () => {
  test('dnw finishes the work and exits cleanly', async () => {
    const cwd = tmpProject();
    spawnSync('node', [bin, 'init', '--yes', '--stack', 'node-api', '--ai', 'claude', '--no-superpowers'], { cwd });
    const source = mkdtempSync(join(tmpdir(), 'dnw-pipe-'));
    writeFileSync(join(source, 'SKILL.md'), '---\nname: piped\ndescription: Use when testing.\n---\n');

    const { code, stderr } = await runWithClosedOutput(cwd, 'skill', 'add', source, '--yes');
    rmSync(source, { recursive: true, force: true });

    expect(stderr).not.toContain('EPIPE');
    expect(code).toBe(0);
    expect(existsSync(join(cwd, '.claude', 'skills', 'piped', 'SKILL.md'))).toBe(true);
    expect(JSON.parse(readFileSync(join(cwd, '.dnw', 'skills.json'), 'utf8')).piped.origin.source).toBe(source);
  }, 60_000);

  test('a failing command still reports failure', async () => {
    const cwd = tmpProject();
    spawnSync('node', [bin, 'init', '--yes', '--stack', 'node-api', '--ai', 'none'], { cwd });
    const { code, stderr } = await runWithClosedOutput(cwd, 'spec', 'review', '0009.api');
    expect(code).toBe(1);
    expect(stderr).toContain('✗');
  }, 60_000);
});

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
