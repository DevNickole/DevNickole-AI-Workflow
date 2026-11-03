// Regression tests for findings from the final whole-branch review.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { initProject, testCtx, tmpProject } from './helpers.js';
import { parseSpec, serializeSpec } from '../src/core/spec-file.js';
import { readTemplate, render } from '../src/core/templates.js';
import { specActivate, specDone, specNew, specReview } from '../src/commands/spec.js';
import { taskStart } from '../src/commands/task.js';
import { status } from '../src/commands/status.js';
import { init } from '../src/commands/init.js';
import { upgrade } from '../src/commands/upgrade.js';
import { findSpec } from '../src/core/spec-store.js';
import { applyMarkerBlock, writeManagedFiles } from '../src/core/manifest.js';
import { adapterFiles } from '../src/adapters/index.js';
import { renderInstructions } from '../src/adapters/instructions.js';
import { recordRun } from '../src/core/runs.js';

const fillProse = (path: string) => {
  // fill every section except Tasks, leaving the template's task hint comment in place
  const text = readFileSync(path, 'utf8');
  const [before, tasks] = text.split('## Tasks');
  writeFileSync(path, before.replace(/<!--[\s\S]*?-->/g, 'Filled.') + '## Tasks' + tasks);
};
const appendTasks = (path: string, lines: string[]) =>
  writeFileSync(path, readFileSync(path, 'utf8').trimEnd() + '\n' + lines.join('\n') + '\n');

describe('C1: task examples inside HTML comments are not tasks', () => {
  test('template hint is ignored', () => {
    const d = parseSpec(render(readTemplate('spec.api.md'), { id: '0001', title: 'X' }), 'x.md');
    expect(d.tasks).toEqual([]);
  });

  test('review rejects a spec whose only task is the template hint', async () => {
    const root = initProject();
    const doc = await specNew(testCtx({ cwd: root }), 'Login', { type: 'api' });
    fillProse(doc.path);
    await expect(specReview(testCtx({ cwd: root }), '0001.api')).rejects.toThrow(/has no tasks/);
  });

  test('task appended below the untouched hint is the one started', async () => {
    const root = initProject();
    const ctx = testCtx({ cwd: root });
    const doc = await specNew(ctx, 'Login', { type: 'api' });
    fillProse(doc.path);
    appendTasks(doc.path, ['- [ ] T1: Returns token (test: tests/login.test.ts)']);
    await specReview(ctx, '0001.api');
    await specActivate(ctx, '0001.api');
    await taskStart(ctx, '0001.api', 'T1');
    const text = readFileSync(doc.path, 'utf8');
    expect(text).toContain('- [~] T1: Returns token (test: tests/login.test.ts)');
    expect(text).toContain('- [ ] T1: <what this task delivers>');
    expect(ctx.outText()).toContain('Write the test at tests/login.test.ts');
  });

  test('duplicate task ids are a file:line error', () => {
    const text = '---\nid: "0001"\ntype: api\ntitle: X\nstatus: draft\n---\n## Tasks\n- [ ] T1: a (test: a)\n- [ ] T1: b (test: b)\n';
    expect(() => parseSpec(text, 'x.md')).toThrow(/x\.md:9: duplicate task id T1/);
  });
});

describe('C2: long titles', () => {
  const long = 'Allow administrators to bulk import users from a CSV file with validation and a dry run preview step';

  test('a 100+ character title stays on one frontmatter line and round-trips', async () => {
    const root = initProject();
    const doc = await specNew(testCtx({ cwd: root }), long, { type: 'api' });
    expect(findSpec(root, '0001.api').meta.title).toBe(long);
    expect(basename(doc.path).length).toBeLessThanOrEqual(64);
  });
});

describe('I3: unknown frontmatter keys survive writes', () => {
  test('owner and tags are kept', () => {
    const text = '---\nid: "0001"\ntype: api\ntitle: X\nstatus: draft\ndependsOn: null\napprovedBy: null\nsupersededBy: null\nowner: alice\ntags:\n  - auth\n---\n## Goal\nx\n';
    const d = parseSpec(text, 'x.md');
    d.meta.status = 'review';
    const again = parseSpec(serializeSpec(d), 'x.md');
    expect(again.extra).toEqual({ owner: 'alice', tags: ['auth'] });
    expect(again.meta.status).toBe('review');
  });
});

describe('I4: done tasks need dnw evidence', () => {
  async function activeWithHandTickedTask() {
    const root = initProject();
    const ctx = testCtx({ cwd: root });
    const doc = await specNew(ctx, 'Login', { type: 'api' });
    fillProse(doc.path);
    appendTasks(doc.path, ['- [ ] T1: a (test: tests/a.test.ts)']);
    await specReview(ctx, '0001.api');
    await specActivate(ctx, '0001.api');
    writeFileSync(doc.path, readFileSync(doc.path, 'utf8').replace('- [ ] T1: a', '- [x] T1: a'));
    return root;
  }

  test('spec done rejects a hand-ticked task', async () => {
    const root = await activeWithHandTickedTask();
    await expect(specDone(testCtx({ cwd: root }), '0001.api')).rejects.toThrow(/without dnw test evidence: T1/);
  });

  test('spec done accepts tasks with red and green evidence', async () => {
    const root = await activeWithHandTickedTask();
    recordRun(root, '0001.api/T1', 'red', 1, 'a');
    recordRun(root, '0001.api/T1', 'green', 0, 'b');
    await specDone(testCtx({ cwd: root }), '0001.api');
    expect(findSpec(root, '0001.api').meta.status).toBe('done');
  });

  test('status flags a hand-ticked task', async () => {
    const root = await activeWithHandTickedTask();
    const ctx = testCtx({ cwd: root });
    await status(ctx);
    expect(ctx.outText()).toContain('⚠ T1 done without dnw evidence');
  });
});

describe('I5: invalid .claude/settings.json', () => {
  test('init reports it honestly and upgrade applies it once fixed', async () => {
    const root = tmpProject();
    const settings = join(root, '.claude', 'settings.json');
    const { mkdirSync } = await import('node:fs');
    mkdirSync(join(root, '.claude'), { recursive: true });
    writeFileSync(settings, '{ // comment\n}');
    const ctx = testCtx({ cwd: root });
    await init(ctx, { yes: true, stack: 'node-api', ai: ['claude'] });
    expect(ctx.outText()).toContain('⚠ .claude/settings.json is not valid JSON');
    expect(ctx.outText()).not.toContain('✓ superpowers enabled');
    expect(ctx.outText()).not.toContain('settings.json.new');
    expect(existsSync(settings + '.new')).toBe(false);

    writeFileSync(settings, '{}');
    await upgrade(testCtx({ cwd: root }), { migrations: [], changelog: '' });
    expect(JSON.parse(readFileSync(settings, 'utf8')).enabledPlugins['superpowers@claude-plugins-official']).toBe(true);
  });
});

describe('I6: generated files never let npx fetch an unrelated package', () => {
  const cfg = { toolVersion: '0.1.0', stack: 'node-api' as const, testCommand: 'npm test', testFileCommand: 'x {file}', aiTools: ['claude' as const], superpowers: false };
  test('commands use npx --no-install', () => {
    const cmds = adapterFiles(cfg).filter((f) => f.path.startsWith('.claude/commands/'));
    for (const f of cmds) {
      expect(f.content).toContain('npx --no-install dnw');
      expect(f.content).not.toMatch(/npx dnw/);
    }
    expect(renderInstructions(cfg)).toContain('npx --no-install dnw');
  });
});

describe('I7: UTF-8 BOM', () => {
  test('a spec with a BOM parses and keeps its BOM', () => {
    const text = '﻿---\nid: "0001"\ntype: api\ntitle: X\nstatus: draft\ndependsOn: null\napprovedBy: null\nsupersededBy: null\n---\n## Goal\nx\n';
    const d = parseSpec(text, 'x.md');
    expect(d.meta.id).toBe('0001');
    expect(serializeSpec(d)).toBe(text);
  });
});

describe('UI cannot activate before its API half, whichever was created first', () => {
  test('api created second still gates the ui', async () => {
    const root = initProject();
    const ctx = testCtx({ cwd: root });
    const ui = await specNew(ctx, 'Login', { type: 'ui' });
    await specNew(ctx, 'Login', { type: 'api', id: '0001' });
    fillProse(ui.path);
    appendTasks(ui.path, ['- [ ] T1: a (test: a)']);
    await specReview(ctx, '0001.ui');
    await expect(specActivate(ctx, '0001.ui')).rejects.toThrow(/paired 0001\.api is still in draft/);
  });
});

describe('broken dnw markers never erase user text', () => {
  test('start marker without end marker is refused', () => {
    expect(applyMarkerBlock('# Mine\n<!-- dnw:start -->\nold\n\nUser notes\n', 'new')).toBeNull();
  });

  test('writeManagedFiles leaves the file and writes .new', () => {
    const root = tmpProject();
    const original = '# Mine\n<!-- dnw:start -->\nold\n\nUser notes\n';
    writeFileSync(join(root, 'CLAUDE.md'), original);
    const r = writeManagedFiles(root, [{ path: 'CLAUDE.md', content: 'new', mode: 'marker' }], null, '0.1.0');
    expect(r.conflicts).toEqual(['CLAUDE.md']);
    expect(readFileSync(join(root, 'CLAUDE.md'), 'utf8')).toBe(original);
    expect(existsSync(join(root, 'CLAUDE.md.new'))).toBe(true);
  });
});
