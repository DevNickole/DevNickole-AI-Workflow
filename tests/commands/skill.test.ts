import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse } from 'yaml';
import { initProject, testCtx, tmpProject } from '../helpers.js';
import { skillEdit, skillList, skillNew, skillRemove, skillSync } from '../../src/commands/skill.js';
import { init } from '../../src/commands/init.js';
import { status } from '../../src/commands/status.js';
import { upgrade } from '../../src/commands/upgrade.js';
import { hashDir, readSkillRecords, sharedSkillNames, validateSkill, writeSkillRecords, sharedSkillsDir } from '../../src/core/skills.js';
import { renderInstructions } from '../../src/adapters/instructions.js';
import { adapterFiles } from '../../src/adapters/index.js';
import { main } from '../../src/cli.js';
import type { DnwConfig } from '../../src/core/config.js';

const CLAUDE = '.claude/skills';
const AGENTS = '.agents/skills';
const STARTER = 'dnw-spec-writing';

const put = (root: string, path: string, content: string | Buffer) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
};
const read = (root: string, path: string) => readFileSync(join(root, path), 'utf8');
const has = (root: string, path: string) => existsSync(join(root, path));
const project = (over: Partial<DnwConfig> = {}) => initProject({ aiTools: ['claude', 'codex'], ...over });
const frontmatter = (md: string) => parse(md.split('---')[1]) as Record<string, string>;
const skillMd = (name: string, description = 'Use when testing.') => `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\n`;

async function newSkill(root: string, name = 'api-style') {
  await skillNew(testCtx({ cwd: root }), name, { description: 'Use when writing APIs.' });
}

describe('shared skills', () => {
  test('every shipped skill is valid and prefixed', () => {
    expect(sharedSkillNames()).toContain(STARTER);
    for (const name of sharedSkillNames()) {
      expect(name.startsWith('dnw-')).toBe(true);
      expect(() => validateSkill(join(sharedSkillsDir(), name), name)).not.toThrow();
    }
  });

  test('skills ship in the package', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    expect(pkg.files).toContain('skills');
  });

  test('init installs them for each chosen AI tool', async () => {
    const root = tmpProject();
    await init(testCtx({ cwd: root }), { yes: true, stack: 'node-api', ai: ['claude', 'codex'] });
    expect(has(root, `${CLAUDE}/${STARTER}/SKILL.md`)).toBe(true);
    expect(has(root, `${AGENTS}/${STARTER}/SKILL.md`)).toBe(true);
    expect(readSkillRecords(root)[STARTER].source).toBe('shared');
  });

  test('no AI tools, no skill folders', async () => {
    const root = tmpProject();
    await init(testCtx({ cwd: root }), { yes: true, stack: 'node-api', ai: [] });
    expect(has(root, CLAUDE)).toBe(false);
    expect(has(root, AGENTS)).toBe(false);
  });

  test('Antigravity and Codex share one folder', async () => {
    const root = tmpProject();
    await init(testCtx({ cwd: root, run: () => ({ exitCode: 1, output: '' }) }), { yes: true, stack: 'node-api', ai: ['antigravity', 'codex'], superpowers: false });
    expect(has(root, `${AGENTS}/${STARTER}/SKILL.md`)).toBe(true);
    expect(has(root, CLAUDE)).toBe(false);
  });

  test('upgrade installs them into older projects', async () => {
    const root = initProject({ toolVersion: '0.0.9', aiTools: ['claude'] });
    await upgrade(testCtx({ cwd: root }), { yes: true, migrations: [], changelog: '' });
    expect(has(root, `${CLAUDE}/${STARTER}/SKILL.md`)).toBe(true);
  });

  test('upgrade replaces an untouched copy', async () => {
    const root = project();
    await skillSync(testCtx({ cwd: root }));
    put(root, `${CLAUDE}/${STARTER}/SKILL.md`, skillMd(STARTER, 'Old version.'));
    writeSkillRecords(root, { [STARTER]: { source: 'shared', hash: hashDir(join(root, CLAUDE, STARTER)) } });
    await upgrade(testCtx({ cwd: root }), { migrations: [], changelog: '' });
    expect(read(root, `${CLAUDE}/${STARTER}/SKILL.md`)).toBe(readFileSync(join(sharedSkillsDir(), STARTER, 'SKILL.md'), 'utf8'));
  });

  test('upgrade keeps a hand-edited copy and writes .new beside it', async () => {
    const root = project();
    await skillSync(testCtx({ cwd: root }));
    put(root, `${CLAUDE}/${STARTER}/SKILL.md`, skillMd(STARTER, 'My edit.'));
    const ctx = testCtx({ cwd: root });
    await upgrade(ctx, { migrations: [], changelog: '' });
    expect(read(root, `${CLAUDE}/${STARTER}/SKILL.md`)).toContain('My edit.');
    expect(has(root, `${CLAUDE}/${STARTER}/SKILL.md.new`)).toBe(true);
    expect(ctx.outText()).toContain(`⚠ ${CLAUDE}/${STARTER}/ was edited directly`);
  });

  test('a later release dropping a shared skill removes its untouched copies', async () => {
    const root = project();
    put(root, `${CLAUDE}/dnw-retired/SKILL.md`, skillMd('dnw-retired'));
    writeSkillRecords(root, { 'dnw-retired': { source: 'shared', hash: hashDir(join(root, CLAUDE, 'dnw-retired')) } });
    await skillSync(testCtx({ cwd: root }));
    expect(has(root, `${CLAUDE}/dnw-retired`)).toBe(false);
    expect(readSkillRecords(root)['dnw-retired']).toBeUndefined();
  });
});

describe('dnw skill new', () => {
  test('creates the source and copies it to every tool', async () => {
    const root = project();
    const ctx = testCtx({ cwd: root });
    await skillNew(ctx, 'api-style', { description: 'Use when writing APIs.' });
    expect(frontmatter(read(root, '.dnw/skills/api-style/SKILL.md'))).toEqual({ name: 'api-style', description: 'Use when writing APIs.' });
    expect(read(root, `${CLAUDE}/api-style/SKILL.md`)).toBe(read(root, '.dnw/skills/api-style/SKILL.md'));
    expect(read(root, `${AGENTS}/api-style/SKILL.md`)).toBe(read(root, '.dnw/skills/api-style/SKILL.md'));
    expect(readSkillRecords(root)['api-style'].source).toBe('project');
    expect(ctx.outText()).toContain('.dnw/skills/api-style/SKILL.md');
  });

  test('YAML-special descriptions round-trip on one line', async () => {
    const root = project();
    const description = 'Use when: "quotes" and a long line '.repeat(5).trim();
    await skillNew(testCtx({ cwd: root }), 'tricky', { description });
    expect(frontmatter(read(root, '.dnw/skills/tricky/SKILL.md')).description).toBe(description);
  });

  test.each(['Bad_Name', '../evil', 'a/b', 'trailing-', ''])('rejects the name %j', async (name) => {
    const root = project();
    await expect(skillNew(testCtx({ cwd: root }), name, { description: 'x' })).rejects.toThrow(/lowercase/);
    expect(has(root, '.dnw/skills')).toBe(false);
  });

  test('dnw- is reserved for shared skills', async () =>
    expect(skillNew(testCtx({ cwd: project() }), 'dnw-mine', { description: 'x' })).rejects.toThrow(/reserved/));

  test('empty description is rejected', async () =>
    expect(skillNew(testCtx({ cwd: project() }), 'x', { description: '  ' })).rejects.toThrow(/description/));

  test('a name already taken by another skill is refused, and that skill is untouched', async () => {
    const root = project();
    put(root, `${CLAUDE}/supabase/SKILL.md`, 'mine');
    await expect(skillNew(testCtx({ cwd: root }), 'supabase', { description: 'x' })).rejects.toThrow(/already exists/);
    expect(read(root, `${CLAUDE}/supabase/SKILL.md`)).toBe('mine');
    expect(has(root, '.dnw/skills/supabase')).toBe(false);
  });

  test('a shared name or existing project skill is refused', async () => {
    const root = project();
    await newSkill(root);
    await expect(skillNew(testCtx({ cwd: root }), 'api-style', { description: 'x' })).rejects.toThrow(/already exists/);
  });

  test('works from the CLI', async () => {
    const root = project();
    const ctx = testCtx({ cwd: root });
    expect(await main(['node', 'dnw', 'skill', 'new', 'api-style', '--description', 'Use when writing APIs.'], ctx)).toBe(0);
    expect(has(root, `${CLAUDE}/api-style/SKILL.md`)).toBe(true);
  });
});

describe('dnw skill edit', () => {
  test('points at the project source', async () => {
    const root = project();
    await newSkill(root);
    const ctx = testCtx({ cwd: root });
    await skillEdit(ctx, 'api-style');
    expect(ctx.outText()).toContain('.dnw/skills/api-style/SKILL.md');
    expect(ctx.outText()).toContain('dnw skill sync');
  });

  test('a shared skill gets a project copy that upgrades leave alone', async () => {
    const root = project();
    await skillSync(testCtx({ cwd: root }));
    await skillEdit(testCtx({ cwd: root }), STARTER);
    const source = read(root, `.dnw/skills/${STARTER}/SKILL.md`);
    put(root, `.dnw/skills/${STARTER}/SKILL.md`, source + '\nProject rule.\n');
    await skillSync(testCtx({ cwd: root }));
    await upgrade(testCtx({ cwd: root }), { migrations: [], changelog: '' });
    expect(read(root, `${CLAUDE}/${STARTER}/SKILL.md`)).toContain('Project rule.');
    expect(readSkillRecords(root)[STARTER].source).toBe('project');
  });

  test('a skill dnw does not manage is refused', async () => {
    const root = project();
    put(root, `${CLAUDE}/supabase/SKILL.md`, 'mine');
    await expect(skillEdit(testCtx({ cwd: root }), 'supabase')).rejects.toThrow(/not managed by dnw/);
  });

  test('an unknown skill points to the list', async () =>
    expect(skillEdit(testCtx({ cwd: project() }), 'nope')).rejects.toThrow(expect.objectContaining({ next: 'dnw skill list' })));
});

describe('dnw skill sync', () => {
  test('copies edits and supporting files byte for byte', async () => {
    const root = project();
    await newSkill(root);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x00, 0xff]);
    put(root, '.dnw/skills/api-style/assets/logo.png', png);
    put(root, '.dnw/skills/api-style/references/rules.md', '# Rules\n');
    await skillSync(testCtx({ cwd: root }));
    expect(readFileSync(join(root, AGENTS, 'api-style/assets/logo.png')).equals(png)).toBe(true);
    expect(read(root, `${CLAUDE}/api-style/references/rules.md`)).toBe('# Rules\n');
  });

  test('a removed supporting file disappears from the copies', async () => {
    const root = project();
    await newSkill(root);
    put(root, '.dnw/skills/api-style/references/old.md', 'x');
    await skillSync(testCtx({ cwd: root }));
    rmSync(join(root, '.dnw/skills/api-style/references'), { recursive: true });
    await skillSync(testCtx({ cwd: root }));
    expect(has(root, `${CLAUDE}/api-style/references`)).toBe(false);
  });

  test('one invalid skill stops the sync, with file and line', async () => {
    const root = project();
    await newSkill(root);
    await newSkill(root, 'other');
    const before = read(root, `${CLAUDE}/api-style/SKILL.md`);
    put(root, '.dnw/skills/api-style/SKILL.md', before + '\nchanged\n');
    put(root, '.dnw/skills/other/SKILL.md', '---\nname: other\n---\n');
    await expect(skillSync(testCtx({ cwd: root }))).rejects.toThrow(/other[\\/]SKILL\.md:1: .*description/);
    expect(read(root, `${CLAUDE}/api-style/SKILL.md`)).toBe(before);
  });

  test('a name that does not match its folder is rejected', async () => {
    const root = project();
    put(root, '.dnw/skills/wrong/SKILL.md', skillMd('right'));
    await expect(skillSync(testCtx({ cwd: root }))).rejects.toThrow(/wrong[\\/]SKILL\.md:2: .*must match/);
  });

  test('a missing SKILL.md is rejected', async () => {
    const root = project();
    mkdirSync(join(root, '.dnw/skills/empty'), { recursive: true });
    await expect(skillSync(testCtx({ cwd: root }))).rejects.toThrow(/empty[\\/]SKILL\.md/);
  });

  test('accepts CRLF and a byte-order mark', async () => {
    const root = project();
    put(root, '.dnw/skills/windows/SKILL.md', '﻿' + skillMd('windows').replace(/\n/g, '\r\n'));
    await skillSync(testCtx({ cwd: root }));
    expect(has(root, `${CLAUDE}/windows/SKILL.md`)).toBe(true);
  });

  test('a hand-edited project copy is kept', async () => {
    const root = project();
    await newSkill(root);
    put(root, `${AGENTS}/api-style/SKILL.md`, skillMd('api-style', 'Edited copy.'));
    put(root, '.dnw/skills/api-style/SKILL.md', skillMd('api-style', 'New source.'));
    const ctx = testCtx({ cwd: root });
    await skillSync(ctx);
    expect(read(root, `${AGENTS}/api-style/SKILL.md`)).toContain('Edited copy.');
    expect(read(root, `${AGENTS}/api-style/SKILL.md.new`)).toContain('New source.');
    expect(read(root, `${CLAUDE}/api-style/SKILL.md`)).toContain('New source.');
    expect(ctx.outText()).toContain(`⚠ ${AGENTS}/api-style/ was edited directly`);
  });

  test('a matching .new does not block later syncs', async () => {
    const root = project();
    await newSkill(root);
    put(root, `${CLAUDE}/api-style/SKILL.md.new`, 'leftover');
    const ctx = testCtx({ cwd: root });
    await skillSync(ctx);
    expect(ctx.outText()).not.toContain('was edited directly');
  });

  test('says when nothing changed', async () => {
    const root = project();
    await skillSync(testCtx({ cwd: root }));
    const ctx = testCtx({ cwd: root });
    await skillSync(ctx);
    expect(ctx.outText()).toContain('Skills are in sync');
  });
});

describe('dnw status', () => {
  test('warns until an edited skill is synced', async () => {
    const root = project();
    await newSkill(root);
    put(root, '.dnw/skills/api-style/SKILL.md', skillMd('api-style', 'Changed.'));
    const before = testCtx({ cwd: root });
    await status(before);
    expect(before.outText()).toContain('⚠ skill api-style changed; run dnw skill sync');
    await skillSync(testCtx({ cwd: root }));
    const after = testCtx({ cwd: root });
    await status(after);
    expect(after.outText()).not.toContain('skill api-style changed');
  });
});

describe('dnw skill list', () => {
  test('groups skills by who owns them', async () => {
    const root = project();
    await newSkill(root);
    put(root, `${CLAUDE}/supabase/SKILL.md`, 'mine');
    const ctx = testCtx({ cwd: root });
    await skillList(ctx);
    const out = ctx.outText();
    expect(out).toMatch(/SHARED\n\s+dnw-spec-writing/);
    expect(out).toMatch(/PROJECT\n\s+api-style/);
    expect(out).toMatch(/OTHER[^\n]*\n\s+supabase/);
  });
});

describe('dnw skill remove', () => {
  test('removes the source and its copies', async () => {
    const root = project();
    await newSkill(root);
    await skillRemove(testCtx({ cwd: root }), 'api-style', { yes: true });
    expect(has(root, '.dnw/skills/api-style')).toBe(false);
    expect(has(root, `${CLAUDE}/api-style`)).toBe(false);
    expect(has(root, `${AGENTS}/api-style`)).toBe(false);
    expect(readSkillRecords(root)['api-style']).toBeUndefined();
  });

  test('without --yes and without a terminal it refuses', async () => {
    const root = project();
    await newSkill(root);
    await expect(skillRemove(testCtx({ cwd: root, isTTY: false }), 'api-style', {})).rejects.toThrow(/--yes/);
    expect(has(root, '.dnw/skills/api-style')).toBe(true);
  });

  test('declining keeps it', async () => {
    const root = project();
    await newSkill(root);
    await expect(skillRemove(testCtx({ cwd: root, confirm: async () => false }), 'api-style', {})).rejects.toThrow(/cancelled/);
    expect(has(root, '.dnw/skills/api-style')).toBe(true);
  });

  test('a hand-edited copy is kept', async () => {
    const root = project();
    await newSkill(root);
    put(root, `${CLAUDE}/api-style/SKILL.md`, skillMd('api-style', 'Edited copy.'));
    const ctx = testCtx({ cwd: root });
    await skillRemove(ctx, 'api-style', { yes: true });
    expect(has(root, `${CLAUDE}/api-style/SKILL.md`)).toBe(true);
    expect(has(root, `${AGENTS}/api-style`)).toBe(false);
    expect(ctx.outText()).toContain(`⚠ ${CLAUDE}/api-style/ was edited directly`);
  });

  test('removing an override brings the shared skill back', async () => {
    const root = project();
    await skillSync(testCtx({ cwd: root }));
    await skillEdit(testCtx({ cwd: root }), STARTER);
    put(root, `.dnw/skills/${STARTER}/SKILL.md`, skillMd(STARTER, 'Override.'));
    await skillSync(testCtx({ cwd: root }));
    await skillRemove(testCtx({ cwd: root }), STARTER, { yes: true });
    expect(read(root, `${CLAUDE}/${STARTER}/SKILL.md`)).toBe(readFileSync(join(sharedSkillsDir(), STARTER, 'SKILL.md'), 'utf8'));
    expect(readSkillRecords(root)[STARTER].source).toBe('shared');
  });

  test('a shared skill without an override cannot be removed', async () =>
    expect(skillRemove(testCtx({ cwd: project() }), STARTER, { yes: true })).rejects.toThrow(/ships with dnw/));

  test('a bad name cannot escape the skills folder', async () => {
    const root = project();
    put(root, 'keep.txt', 'x');
    await expect(skillRemove(testCtx({ cwd: root }), '../..', { yes: true })).rejects.toThrow(/lowercase/);
    expect(has(root, 'keep.txt')).toBe(true);
  });
});

describe('AI instructions', () => {
  const cfg: DnwConfig = { toolVersion: '0', stack: 'node-api', testCommand: 't', testFileCommand: 't {file}', aiTools: ['claude'], superpowers: false };

  test('send skill changes through .dnw/skills', () => {
    const text = renderInstructions(cfg);
    expect(text).toContain('.dnw/skills/');
    expect(text).toContain('dnw skill sync');
  });

  test('Claude gets /dnw-skill-new', () => expect(adapterFiles(cfg).map((f) => f.path)).toContain('.claude/commands/dnw-skill-new.md'));
});
