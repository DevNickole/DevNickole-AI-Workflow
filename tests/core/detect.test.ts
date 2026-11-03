import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpProject } from '../helpers.js';
import { detectStack, detectTestSetup } from '../../src/core/stack.js';
import { detectAiTools, detectDnwCommand, detectDocs } from '../../src/core/detect.js';

function project(files: Record<string, string>): string {
  const root = tmpProject();
  for (const [path, content] of Object.entries(files)) {
    const abs = join(root, path);
    mkdirSync(path.endsWith('/') ? abs : dirname(abs), { recursive: true });
    if (!path.endsWith('/')) writeFileSync(abs, content);
  }
  return root;
}

const pkg = (p: object) => JSON.stringify(p);

describe('stack and test setup', () => {
  test('pubspec.yaml is flutter, even with a package.json for tooling', () =>
    expect(detectStack(project({ 'pubspec.yaml': 'name: x', 'package.json': pkg({}) }))).toBe('flutter'));

  test('flutter uses flutter test', () =>
    expect(detectTestSetup(project({ 'pubspec.yaml': '' }), 'flutter')).toEqual({
      framework: 'flutter_test',
      testCommand: 'flutter test',
      testFileCommand: 'flutter test {file}',
    }));

  test('existing jest with pnpm', () =>
    expect(detectTestSetup(project({ 'package.json': pkg({ scripts: { test: 'jest' } }), 'pnpm-lock.yaml': '' }), 'node-api')).toEqual({
      framework: 'Jest (existing)',
      testCommand: 'pnpm test',
      testFileCommand: 'npx jest {file}',
    }));

  test('existing vitest with yarn', () =>
    expect(detectTestSetup(project({ 'package.json': pkg({ scripts: { test: 'vitest run' } }), 'yarn.lock': '' }), 'nextjs')).toEqual({
      framework: 'Vitest (existing)',
      testCommand: 'yarn test',
      testFileCommand: 'npx vitest run {file}',
    }));

  test('existing mocha with bun', () =>
    expect(detectTestSetup(project({ 'package.json': pkg({ scripts: { test: 'mocha' } }), 'bun.lock': '' }), 'node-api')).toMatchObject({
      testCommand: 'bun test',
      testFileCommand: 'npx mocha {file}',
    }));

  test('unknown existing runner passes the file through the test script', () =>
    expect(detectTestSetup(project({ 'package.json': pkg({ scripts: { test: 'node --test' } }) }), 'node-api')).toEqual({
      framework: 'existing test script',
      testCommand: 'npm test',
      testFileCommand: 'npm test -- {file}',
    }));

  test('npm placeholder test script counts as no test setup', () =>
    expect(
      detectTestSetup(project({ 'package.json': pkg({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }) }), 'node-api'),
    ).toEqual({ framework: 'Vitest', testCommand: 'npm test', testFileCommand: 'npx vitest run {file}' }));

  test('go keeps its recommendation', () =>
    expect(detectTestSetup(project({ 'go.mod': '' }), 'go').testFileCommand).toBe('go test ./{dir}'));
});

describe('docs', () => {
  test('maps existing files and folders', () =>
    expect(detectDocs(project({ 'docs/architecture.md': '#', 'docs/mvp.md': '#', 'lib/theme/app_theme.dart': '' }))).toEqual({
      architecture: 'docs/architecture.md',
      products: 'docs/mvp.md',
      designSystem: 'lib/theme/',
    }));

  test('prefers the dnw folder when both exist', () =>
    expect(detectDocs(project({ 'docs/architecture/': '', 'docs/architecture.md': '#' })).architecture).toBe('docs/architecture/'));

  test('nothing found', () =>
    expect(detectDocs(tmpProject())).toEqual({ architecture: null, products: null, designSystem: null }));
});

describe('AI tools', () => {
  test('claude and antigravity from CLAUDE.md and .agents', () =>
    expect(detectAiTools(project({ 'CLAUDE.md': '#', '.agents/skills/': '' }))).toEqual(['claude', 'antigravity']));
  test('codex from AGENTS.md', () => expect(detectAiTools(project({ 'AGENTS.md': '#' }))).toEqual(['codex']));
  test('none', () => expect(detectAiTools(tmpProject())).toEqual([]));
});

describe('dnw command', () => {
  test('devDependency uses npx --no-install', () =>
    expect(detectDnwCommand(project({ 'package.json': pkg({ devDependencies: { 'dev-nickole-workflow': '^0.1.0' } }) }))).toBe(
      'npx --no-install dnw',
    ));
  test('package.json without dnw uses dnw', () => expect(detectDnwCommand(project({ 'package.json': pkg({}) }))).toBe('dnw'));
  test('no package.json uses dnw', () => expect(detectDnwCommand(tmpProject())).toBe('dnw'));
});
