// dnw init on an existing project shaped like a real Flutter repo with its own docs and AI setup.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { initProject, testCtx, tmpProject } from '../helpers.js';
import { init } from '../../src/commands/init.js';
import { readConfig } from '../../src/core/config.js';
import type { Choice } from '../../src/core/context.js';
import { packageVersion } from '../../src/core/version.js';

const EXISTING: Record<string, string> = {
  'pubspec.yaml': 'name: catipunan\n',
  'docs/architecture.md': '# Architecture\n',
  'docs/mvp.md': '# MVP\n',
  'docs/tasks/2026-08-20-feature-auth.md': '# Auth task\n',
  'lib/theme/app_theme.dart': '// theme\n',
  'CLAUDE.md': '# CLAUDE.md\n\nMine.\n',
  '.claude/commands/dm.md': '---\ndescription: plan\n---\nmy workflow\n',
  '.agents/skills/supabase/SKILL.md': 'skill\n',
};

function existingProject(): string {
  const root = tmpProject();
  rmSync(join(root, 'docs'), { recursive: true }); // the real repo has no docs/specs yet
  for (const [p, c] of Object.entries(EXISTING)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), c);
  }
  return root;
}

const read = (root: string, p: string) => readFileSync(join(root, p), 'utf8');
const noAgy = () => ({ exitCode: 1, output: '' });

test('--yes adopts the existing layout', async () => {
  const root = existingProject();
  await init(testCtx({ cwd: root, run: noAgy }), { yes: true });

  expect(readConfig(root)).toEqual({
    toolVersion: packageVersion(),
    stack: 'flutter',
    testCommand: 'flutter test',
    testFileCommand: 'flutter test {file}',
    aiTools: ['claude', 'antigravity'],
    superpowers: true,
    docs: { architecture: 'docs/architecture.md', products: 'docs/mvp.md', designSystem: 'lib/theme/' },
    command: 'dnw',
    existingWorkflow: { mode: 'alongside', commands: ['.claude/commands/dm.md'], taskDirs: ['docs/tasks/'] },
    onboarded: false,
  });

  // no duplicate doc locations; specs folder added
  for (const d of ['docs/architecture', 'docs/products', 'docs/design-system']) expect(existsSync(join(root, d))).toBe(false);
  expect(existsSync(join(root, 'docs/specs/README.md'))).toBe(true);

  // existing files untouched
  for (const p of ['pubspec.yaml', 'docs/architecture.md', 'docs/mvp.md', 'docs/tasks/2026-08-20-feature-auth.md', '.claude/commands/dm.md', '.agents/skills/supabase/SKILL.md']) {
    expect(read(root, p)).toBe(EXISTING[p]);
  }
  expect(read(root, 'CLAUDE.md').startsWith('# CLAUDE.md\n\nMine.\n')).toBe(true);

  // instructions point at the mapped docs and the right command
  const claude = read(root, 'CLAUDE.md');
  expect(claude).toContain('`docs/architecture.md`');
  expect(claude).toContain('`docs/mvp.md`');
  expect(claude).toContain('`lib/theme/`');
  expect(claude).toContain('`dnw <command>`');
  expect(claude).toContain('flutter test {file}');
  expect(read(root, '.claude/commands/dnw-status.md')).toContain('Run `dnw status`');
  expect(read(root, '.agents/rules/dnw.md')).toContain('`docs/mvp.md`');
});

test('interactive init preselects detected tools and suggests detected docs', async () => {
  const root = existingProject();
  const inputs: [string, string][] = [];
  let toolChoices: Choice<string>[] = [];
  const ctx = testCtx({
    cwd: root,
    run: noAgy,
    confirm: async (m) => !m.startsWith('Use these settings'),
    select: async (_m, _c, def) => def as never,
    input: async (m, def) => (inputs.push([m, def]), def),
    checkbox: async (_m, choices) => ((toolChoices = choices), choices.filter((c) => c.checked).map((c) => c.value)) as never,
  });
  await init(ctx, {});
  expect(inputs.map(([, d]) => d)).toEqual(['flutter test', 'flutter test {file}', 'docs/architecture.md', 'docs/mvp.md', 'lib/theme/']);
  expect(toolChoices.filter((c) => c.checked).map((c) => c.value)).toEqual(['claude', 'antigravity']);
  expect(readConfig(root).aiTools).toEqual(['claude', 'antigravity']);
});

test('a mapped doc path that does not exist yet is created', async () => {
  const root = tmpProject();
  await init(
    testCtx({ cwd: root, answers: ['node-api', 'npm test', 'npx vitest run {file}', 'docs/ARCH.md', 'docs/products/', 'src/ui/', []] }),
    {},
  );
  expect(read(root, 'docs/ARCH.md')).toContain('# Architecture');
  expect(existsSync(join(root, 'docs/products/README.md'))).toBe(true);
  expect(existsSync(join(root, 'src/ui/README.md'))).toBe(true);
});

test('init inside an existing dnw project is refused', async () => {
  const root = initProject();
  const sub = join(root, 'packages', 'app');
  mkdirSync(sub, { recursive: true });
  await expect(init(testCtx({ cwd: sub }), { yes: true })).rejects.toThrow(/inside the dnw project at/);
  expect(existsSync(join(sub, '.dnw'))).toBe(false);
});
