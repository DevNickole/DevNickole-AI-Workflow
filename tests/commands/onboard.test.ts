// Adapting to an existing project: workflow detection, the init summary, and AI onboarding.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { initProject, testCtx, tmpProject } from '../helpers.js';
import { detectExistingWorkflow } from '../../src/core/detect.js';
import { init } from '../../src/commands/init.js';
import { onboard } from '../../src/commands/onboard.js';
import { status } from '../../src/commands/status.js';
import { readConfig } from '../../src/core/config.js';
import { renderInstructions } from '../../src/adapters/instructions.js';
import { adapterFiles } from '../../src/adapters/index.js';

const CATIPUNAN: Record<string, string> = {
  'pubspec.yaml': 'name: catipunan\n',
  'docs/architecture.md': '# Architecture\n',
  'docs/mvp.md': '# MVP\n',
  'docs/tasks/2026-08-18-feature-login.md': '# Login\n- **Status:** done\n',
  'docs/tasks/2026-08-20-feature-auth-backend.md': '# Auth backend\n- **Status:** planned\n',
  'lib/theme/app_theme.dart': '// theme\n',
  'lib/features/auth/login_screen.dart': '// screen\n',
  'CLAUDE.md': '# CLAUDE.md\n',
  '.claude/commands/dm.md': 'plan\n',
  '.claude/commands/generate-setup.md': 'setup\n',
  '.agents/skills/supabase/SKILL.md': 'skill\n',
};

function project(files: Record<string, string>): string {
  const root = tmpProject();
  rmSync(join(root, 'docs'), { recursive: true });
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), c);
  }
  return root;
}

const noAgy = () => ({ exitCode: 1, output: '' });

describe('existing workflow detection', () => {
  test('custom AI commands and task folders', () =>
    expect(detectExistingWorkflow(project(CATIPUNAN))).toEqual({
      commands: ['.claude/commands/dm.md', '.claude/commands/generate-setup.md'],
      taskDirs: [{ path: 'docs/tasks/', files: 2 }],
    }));

  test('dnw commands and empty folders are not an existing workflow', () =>
    expect(
      detectExistingWorkflow(project({ '.claude/commands/dnw-status.md': 'x', 'docs/plans/.gitkeep': '', 'specs/001-chat/spec.md': '# Chat\n' })),
    ).toEqual({ commands: [], taskDirs: [{ path: 'specs/', files: 1 }] }));

  test('Antigravity workflows count as commands', () =>
    expect(detectExistingWorkflow(project({ '.agents/workflows/release.md': 'x' })).commands).toEqual(['.agents/workflows/release.md']));
});

describe('init shows what it found and asks', () => {
  test('summary lists stack, docs, AI tools and the existing workflow', async () => {
    const root = project(CATIPUNAN);
    const ctx = testCtx({ cwd: root, run: noAgy, select: async () => 'alongside' as never });
    await init(ctx, {});
    const out = ctx.outText();
    expect(out).toContain('Found in this project:');
    expect(out).toMatch(/Stack\s+flutter · tests: flutter test \{file\} \(flutter_test\)/);
    expect(out).toMatch(/architecture\s+→ docs\/architecture\.md \(existing\)/);
    expect(out).toMatch(/products\s+→ docs\/mvp\.md \(existing\)/);
    expect(out).toMatch(/AI tools\s+Claude Code, Antigravity/);
    expect(out).toMatch(/Workflow\s+commands: \/dm, \/generate-setup · task docs: docs\/tasks\/ \(2 files\)/);
  });

  test('accepting the summary asks nothing else about settings', async () => {
    const root = project(CATIPUNAN);
    const asked: string[] = [];
    const ctx = testCtx({
      cwd: root,
      run: noAgy,
      confirm: async (m) => (asked.push(m), true),
      select: async (m) => (asked.push(m), 'alongside') as never,
      input: async (m) => (asked.push(m), '') as never,
      checkbox: async (m) => (asked.push(m), []) as never,
    });
    await init(ctx, {});
    expect(asked[0]).toBe('Use these settings?');
    expect(asked.some((m) => m.startsWith('Tech stack') || m.includes('test command') || m.startsWith('Which AI tools'))).toBe(false);
    expect(readConfig(root)).toMatchObject({ stack: 'flutter', aiTools: ['claude', 'antigravity'], onboarded: false });
  });

  test('declining the summary walks through each setting', async () => {
    const root = project(CATIPUNAN);
    const ctx = testCtx({
      cwd: root,
      run: noAgy,
      confirm: async (m) => !m.startsWith('Use these settings'),
      answers: ['go', 'go test ./...', 'go test ./{dir}', 'docs/architecture.md', 'docs/mvp.md', 'lib/theme/', ['codex'], 'convert'],
    });
    await init(ctx, {});
    expect(readConfig(root)).toMatchObject({ stack: 'go', aiTools: ['codex'], existingWorkflow: { mode: 'convert' } });
  });

  test('workflow choice is saved with what was found', async () => {
    const root = project(CATIPUNAN);
    await init(testCtx({ cwd: root, run: noAgy, select: async () => 'convert' as never }), {});
    expect(readConfig(root).existingWorkflow).toEqual({
      mode: 'convert',
      commands: ['.claude/commands/dm.md', '.claude/commands/generate-setup.md'],
      taskDirs: ['docs/tasks/'],
    });
  });

  test('--yes keeps an existing workflow alongside', async () => {
    const root = project(CATIPUNAN);
    await init(testCtx({ cwd: root, run: noAgy }), { yes: true });
    expect(readConfig(root).existingWorkflow?.mode).toBe('alongside');
  });

  test('no existing workflow, no question and nothing saved', async () => {
    const root = tmpProject();
    let workflowAsked = false;
    await init(testCtx({ cwd: root, select: async (m) => ((workflowAsked ||= m.startsWith('How should dnw treat')), 'other') as never, answers: [] }), {
      yes: true,
      stack: 'node-api',
    });
    expect(workflowAsked).toBe(false);
    expect(readConfig(root).existingWorkflow).toBeUndefined();
  });
});

describe('dnw onboard', () => {
  async function initialized(mode: 'alongside' | 'convert') {
    const root = project(CATIPUNAN);
    await init(testCtx({ cwd: root, run: noAgy, select: async () => mode as never }), {});
    return root;
  }

  test('checklist is tailored to the project', async () => {
    const root = await initialized('alongside');
    const ctx = testCtx({ cwd: root });
    await onboard(ctx, {});
    const out = ctx.outText();
    expect(out).toContain('pubspec.yaml');
    expect(out).toContain('lib/');
    expect(out).toContain('CLAUDE.md');
    expect(out).toContain('docs/architecture.md (existing doc)');
    expect(out).toContain('docs/mvp.md (existing doc)');
    expect(out).toContain('one question at a time');
    expect(out).toContain('Kept alongside dnw: /dm, /generate-setup, docs/tasks/');
    expect(out).not.toContain('Migrated to dnw spec');
    expect(out).toContain('dnw onboard --done');
  });

  test('templates are drafted from the code, missing docs are added first', async () => {
    const root = initProject();
    const cfg = readConfig(root);
    mkdirSync(join(root, 'docs/products'), { recursive: true });
    writeFileSync(join(root, 'docs/products/README.md'), '# Products\n## Vision\n<!-- fill: x -->\n');
    void cfg;
    const ctx = testCtx({ cwd: root });
    await onboard(ctx, {});
    expect(ctx.outText()).toContain('docs/products/README.md (template, 1 section to fill)');
    expect(ctx.outText()).toContain('docs/architecture/ is missing: run dnw docs add architecture');
  });

  test('convert mode explains how to migrate open tasks', async () => {
    const root = await initialized('convert');
    const ctx = testCtx({ cwd: root });
    await onboard(ctx, {});
    expect(ctx.outText()).toContain('Convert open tasks in docs/tasks/');
    expect(ctx.outText()).toContain('> Migrated to dnw spec');
    expect(ctx.outText()).toContain('Never delete');
  });

  test('--done marks onboarding complete and status stops reminding', async () => {
    const root = await initialized('alongside');
    const before = testCtx({ cwd: root });
    await status(before);
    expect(before.outText()).toContain('⚠ Onboarding not done. Ask your AI to run: dnw onboard');
    await onboard(testCtx({ cwd: root }), { done: true });
    expect(readConfig(root).onboarded).toBe(true);
    const after = testCtx({ cwd: root });
    await status(after);
    expect(after.outText()).not.toContain('Onboarding not done');
  });

  test('older configs without the flag are not nagged', async () => {
    const root = initProject();
    const ctx = testCtx({ cwd: root });
    await status(ctx);
    expect(ctx.outText()).not.toContain('Onboarding');
  });
});

describe('AI instructions', () => {
  const base = { toolVersion: '0', stack: 'node-api' as const, testCommand: 't', testFileCommand: 't {file}', aiTools: ['claude' as const], superpowers: false };

  test('always tell the AI how to onboard', () => expect(renderInstructions(base)).toContain('dnw onboard'));

  test('alongside mode names the existing workflow', () => {
    const text = renderInstructions({ ...base, existingWorkflow: { mode: 'alongside', commands: ['.claude/commands/dm.md'], taskDirs: ['docs/tasks/'] } });
    expect(text).toContain('## Existing workflow');
    expect(text).toContain('/dm');
    expect(text).toContain('docs/tasks/');
  });

  test('no existing workflow, no section', () => expect(renderInstructions(base)).not.toContain('## Existing workflow'));

  test('Claude gets /dnw-onboard', () =>
    expect(adapterFiles(base).map((f) => f.path)).toContain('.claude/commands/dnw-onboard.md'));
});
