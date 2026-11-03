import { adapterFiles, superpowersSteps } from '../src/adapters/index.js';
import { renderInstructions } from '../src/adapters/instructions.js';
import type { DnwConfig } from '../src/core/config.js';

const cfg = (over: Partial<DnwConfig> = {}): DnwConfig => ({
  toolVersion: '0.1.0',
  stack: 'nextjs',
  testCommand: 'npm test',
  testFileCommand: 'npx vitest run {file}',
  aiTools: ['claude', 'codex'],
  superpowers: false,
  ...over,
});

const paths = (c: DnwConfig) => adapterFiles(c).map((f) => f.path).sort();

test('claude + codex files', () => {
  const p = paths(cfg());
  expect(p).toContain('CLAUDE.md');
  expect(p).toContain('AGENTS.md');
  for (const c of ['spec-new', 'spec-review', 'task-start', 'task-red', 'task-done', 'status']) {
    expect(p).toContain(`.claude/commands/dnw-${c}.md`);
  }
  expect(p.some((x) => x.startsWith('.agents/'))).toBe(false);
});

test('antigravity writes an always-on rule', () => {
  const files = adapterFiles(cfg({ aiTools: ['antigravity'] }));
  const rule = files.find((f) => f.path === '.agents/rules/dnw.md')!;
  expect(rule.mode).toBe('whole');
  expect(rule.content.startsWith('---\ntrigger: always_on\ndescription: ')).toBe(true);
});

test('no tools, no files', () => expect(adapterFiles(cfg({ aiTools: [] }))).toEqual([]));

test('instructions carry config and the human-only rule', () => {
  const text = renderInstructions(cfg({ testCommand: 'pnpm vitest run' }));
  expect(text).toContain('pnpm vitest run');
  expect(text).toContain('Never run `dnw spec activate`');
  expect(text).not.toContain('{{');
});

test('superpowers off: no settings file, no superpowers section', () => {
  expect(paths(cfg())).not.toContain('.claude/settings.json');
  expect(renderInstructions(cfg()).toLowerCase()).not.toContain('superpowers');
});

test('superpowers on: settings merge and docs/specs override', () => {
  const files = adapterFiles(cfg({ superpowers: true }));
  const settings = files.find((f) => f.path === '.claude/settings.json')!;
  expect(settings.mode).toBe('json-merge');
  expect(JSON.parse(settings.content)).toEqual({ enabledPlugins: { 'superpowers@claude-plugins-official': true } });
  const text = renderInstructions(cfg({ superpowers: true }));
  expect(text).toContain('docs/superpowers/specs/');
  expect(text).toContain('docs/specs/');
});

test('superpowers steps per tool', () => {
  const steps = superpowersSteps(cfg({ aiTools: ['claude', 'codex', 'antigravity'], superpowers: true }));
  expect(steps).toHaveLength(2);
  expect(steps.find((s) => s.tool === 'antigravity')!.command).toBe('agy plugin install https://github.com/obra/superpowers');
  expect(steps.find((s) => s.tool === 'codex')!.manual).toContain('/plugins');
  expect(superpowersSteps(cfg({ aiTools: ['antigravity'], superpowers: false }))).toEqual([]);
});
