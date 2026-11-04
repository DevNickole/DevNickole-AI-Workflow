import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { initProject, testCtx } from '../helpers.js';
import { skillAdd, skillAdopt, skillList, skillRemove, skillSync } from '../../src/commands/skill.js';
import { readSkillRecords } from '../../src/core/skills.js';
import { cloneUrl } from '../../src/core/skill-source.js';
import { renderInstructions } from '../../src/adapters/instructions.js';
import { adapterFiles } from '../../src/adapters/index.js';
import { main } from '../../src/cli.js';
import type { DnwConfig } from '../../src/core/config.js';

const CLAUDE = '.claude/skills';
const AGENTS = '.agents/skills';
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

const skillMd = (name: string, description = 'Use when testing.') => `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\n`;
const put = (root: string, path: string, content: string) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
};
const has = (root: string, path: string) => existsSync(join(root, path));
const read = (root: string, path: string) => readFileSync(join(root, path), 'utf8');
const project = () => initProject({ aiTools: ['claude', 'codex'] });

function folder(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'dnw-source-'));
  dirs.push(dir);
  for (const [p, c] of Object.entries(files)) put(dir, p, c);
  return dir;
}

/** A real git repository, cloned through a file:// URL just like a GitHub one. */
function repo(files: Record<string, string>): string {
  const dir = folder(files);
  const git = (...args: string[]) => {
    const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: dir, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(r.stderr);
    return r.stdout.trim();
  };
  git('init', '-q');
  git('add', '-A');
  git('commit', '-qm', 'skills');
  return pathToFileURL(dir).href;
}

const headCommit = (url: string) =>
  spawnSync('git', ['rev-parse', 'HEAD'], { cwd: new URL(url), encoding: 'utf8' }).stdout.trim();

describe('sources', () => {
  test('owner/repo means GitHub', () => expect(cloneUrl('supabase/agent-skills')).toBe('https://github.com/supabase/agent-skills.git'));
  test('git URLs are kept', () => expect(cloneUrl('https://github.com/a/b')).toBe('https://github.com/a/b'));
  test.each(['-upload-pack=x', 'ext::sh -c evil', 'just-a-word', 'a/b/c d'])('refuses %j', (s) => expect(cloneUrl(s)).toBeNull());
});

describe('dnw skill add', () => {
  test('a local folder becomes a project skill for every AI tool', async () => {
    const root = project();
    const src = folder({ 'SKILL.md': skillMd('api-style'), 'references/rules.md': '# Rules\n' });
    await skillAdd(testCtx({ cwd: root }), src, { yes: true });
    expect(read(root, '.dnw/skills/api-style/references/rules.md')).toBe('# Rules\n');
    expect(has(root, `${CLAUDE}/api-style/SKILL.md`)).toBe(true);
    expect(has(root, `${AGENTS}/api-style/SKILL.md`)).toBe(true);
    expect(readSkillRecords(root)['api-style'].origin).toEqual({ source: src, path: '.', commit: null });
  });

  test('downloads one skill from a git repo and records where it came from', async () => {
    const root = project();
    const url = repo({ 'skills/alpha/SKILL.md': skillMd('alpha'), 'skills/beta/SKILL.md': skillMd('beta'), 'README.md': '# Repo\n' });
    await skillAdd(testCtx({ cwd: root }), url, { yes: true, skill: 'alpha' });
    expect(has(root, `${CLAUDE}/alpha/SKILL.md`)).toBe(true);
    expect(has(root, `${CLAUDE}/beta`)).toBe(false);
    expect(has(root, '.dnw/skills/alpha/.git')).toBe(false);
    expect(readSkillRecords(root).alpha.origin).toEqual({ source: url, path: 'skills/alpha', commit: headCommit(url) });
  });

  test('a skill at the root of a repo leaves .git behind', async () => {
    const root = project();
    await skillAdd(testCtx({ cwd: root }), repo({ 'SKILL.md': skillMd('rooted') }), { yes: true });
    expect(has(root, '.dnw/skills/rooted/SKILL.md')).toBe(true);
    expect(has(root, '.dnw/skills/rooted/.git')).toBe(false);
  });

  test('the folder is named by the skill, not the repo folder', async () => {
    const root = project();
    await skillAdd(testCtx({ cwd: root }), folder({ 'nested/whatever/SKILL.md': skillMd('real-name') }), { yes: true });
    expect(has(root, '.dnw/skills/real-name/SKILL.md')).toBe(true);
  });

  test('a repo with several skills lets you choose in a terminal', async () => {
    const root = project();
    const url = repo({ 'a/SKILL.md': skillMd('alpha'), 'b/SKILL.md': skillMd('beta'), 'c/SKILL.md': skillMd('gamma') });
    await skillAdd(testCtx({ cwd: root, answers: [['a', 'c']] }), url, {});
    expect(has(root, '.dnw/skills/alpha')).toBe(true);
    expect(has(root, '.dnw/skills/beta')).toBe(false);
    expect(has(root, '.dnw/skills/gamma')).toBe(true);
  });

  test('choosing nothing cancels', async () => {
    const url = repo({ 'a/SKILL.md': skillMd('alpha'), 'b/SKILL.md': skillMd('beta') });
    await expect(skillAdd(testCtx({ cwd: project(), answers: [[]] }), url, {})).rejects.toThrow(/cancelled/);
  });

  test('without a terminal, several skills must be named', async () => {
    const url = repo({ 'a/SKILL.md': skillMd('alpha'), 'b/SKILL.md': skillMd('beta') });
    await expect(skillAdd(testCtx({ cwd: project(), isTTY: false }), url, { yes: true })).rejects.toThrow(/alpha, beta.*--skill/);
  });

  test('an unknown --skill lists what exists', async () => {
    const src = folder({ 'a/SKILL.md': skillMd('alpha') });
    await expect(skillAdd(testCtx({ cwd: project() }), src, { yes: true, skill: 'nope' })).rejects.toThrow(/nope.*alpha/);
  });

  test('shows what is being installed and flags anything that is not Markdown', async () => {
    const root = project();
    const src = folder({ 'SKILL.md': skillMd('risky'), 'scripts/run.sh': 'echo hi', 'references/a.md': 'x' });
    const ctx = testCtx({ cwd: root });
    await skillAdd(ctx, src, { yes: true });
    const out = ctx.outText();
    expect(out).toContain('Skill: risky');
    expect(out).toContain('Use when testing.');
    expect(out).toContain('references/a.md');
    expect(out).toContain('⚠ Not Markdown, review before trusting: scripts/run.sh');
  });

  test('control characters cannot reach the terminal', async () => {
    const root = project();
    const src = folder({ 'SKILL.md': '---\nname: sneaky\ndescription: "hide\\e[2Jthis"\n---\n' });
    const ctx = testCtx({ cwd: root });
    await skillAdd(ctx, src, { yes: true });
    expect(ctx.outText()).not.toContain('\u001b');
  });

  test('without a terminal it prints the details, then needs --yes', async () => {
    const root = project();
    const ctx = testCtx({ cwd: root, isTTY: false });
    await expect(skillAdd(ctx, folder({ 'SKILL.md': skillMd('careful') }), {})).rejects.toThrow(/--yes/);
    expect(ctx.outText()).toContain('Skill: careful');
    expect(has(root, '.dnw/skills/careful')).toBe(false);
  });

  test('declining installs nothing', async () => {
    const root = project();
    await expect(skillAdd(testCtx({ cwd: root, confirm: async () => false }), folder({ 'SKILL.md': skillMd('nope') }), {})).rejects.toThrow(/cancelled/);
    expect(has(root, '.dnw/skills/nope')).toBe(false);
  });

  test('nothing is installed unless every chosen skill passes', async () => {
    const root = project();
    const src = folder({ 'a/SKILL.md': skillMd('good'), 'b/SKILL.md': '---\nname: bad\n---\n' });
    await expect(skillAdd(testCtx({ cwd: root, answers: [['a', 'b']] }), src, { yes: false })).rejects.toThrow(/description/);
    expect(has(root, '.dnw/skills/good')).toBe(false);
  });

  test('a skill without a name is refused', async () =>
    expect(skillAdd(testCtx({ cwd: project() }), folder({ 'SKILL.md': '---\ndescription: x\n---\n' }), { yes: true })).rejects.toThrow(/no name/));

  test('dnw- names are reserved', async () =>
    expect(skillAdd(testCtx({ cwd: project() }), folder({ 'SKILL.md': skillMd('dnw-fake') }), { yes: true })).rejects.toThrow(/reserved/));

  test('a name that is not safe as a folder is refused', async () =>
    expect(skillAdd(testCtx({ cwd: project() }), folder({ 'SKILL.md': skillMd('../../evil') }), { yes: true })).rejects.toThrow(/lowercase/));

  test('a name already taken is refused and the other skill is untouched', async () => {
    const root = project();
    put(root, `${CLAUDE}/supabase/SKILL.md`, 'mine');
    await expect(skillAdd(testCtx({ cwd: root }), folder({ 'SKILL.md': skillMd('supabase') }), { yes: true })).rejects.toThrow(/already exists/);
    expect(read(root, `${CLAUDE}/supabase/SKILL.md`)).toBe('mine');
  });

  test('a skill containing a symlink is refused', async () => {
    const root = project();
    const secret = folder({ 'id_rsa': 'private' });
    const src = folder({ 'SKILL.md': skillMd('linked') });
    symlinkSync(secret, join(src, 'keys'), 'junction');
    await expect(skillAdd(testCtx({ cwd: root }), src, { yes: true })).rejects.toThrow(/symlink/);
    expect(has(root, '.dnw/skills/linked')).toBe(false);
  });

  test('a source with no skills says so', async () =>
    expect(skillAdd(testCtx({ cwd: project() }), folder({ 'README.md': 'x' }), { yes: true })).rejects.toThrow(/No SKILL\.md/));

  test('a failed download explains itself', async () => {
    const url = pathToFileURL(join(tmpdir(), 'dnw-no-such-repo')).href;
    await expect(skillAdd(testCtx({ cwd: project(), isTTY: false }), url, { yes: true })).rejects.toThrow(/Could not download/);
  });

  test('an unusable source is refused before anything runs', async () =>
    expect(skillAdd(testCtx({ cwd: project() }), '--upload-pack=evil', { yes: true })).rejects.toThrow(/owner\/repo/));

  test('list shows where a skill came from', async () => {
    const root = project();
    await skillAdd(testCtx({ cwd: root }), repo({ 'SKILL.md': skillMd('rooted') }), { yes: true });
    const ctx = testCtx({ cwd: root });
    await skillList(ctx);
    expect(ctx.outText()).toMatch(/rooted\s+\(from file:/);
  });

  test('later syncs keep the record of where it came from', async () => {
    const root = project();
    const src = folder({ 'SKILL.md': skillMd('kept') });
    await skillAdd(testCtx({ cwd: root }), src, { yes: true });
    put(root, '.dnw/skills/kept/SKILL.md', skillMd('kept', 'Changed.'));
    await skillSync(testCtx({ cwd: root }));
    expect(readSkillRecords(root).kept.origin?.source).toBe(src);
  });

  test('works from the CLI', async () => {
    const root = project();
    const ctx = testCtx({ cwd: root });
    const src = folder({ 'a/SKILL.md': skillMd('alpha'), 'b/SKILL.md': skillMd('beta') });
    expect(await main(['node', 'dnw', 'skill', 'add', src, '--skill', 'beta', '--yes'], ctx)).toBe(0);
    expect(has(root, `${CLAUDE}/beta/SKILL.md`)).toBe(true);
  });
});

describe('dnw skill adopt', () => {
  test('an existing skill comes under dnw and reaches every AI tool', async () => {
    const root = project();
    put(root, `${CLAUDE}/supabase/SKILL.md`, skillMd('supabase'));
    put(root, `${CLAUDE}/supabase/references/a.md`, 'x');
    await skillAdopt(testCtx({ cwd: root }), 'supabase');
    expect(read(root, '.dnw/skills/supabase/references/a.md')).toBe('x');
    expect(read(root, `${AGENTS}/supabase/SKILL.md`)).toBe(skillMd('supabase'));
    expect(readSkillRecords(root).supabase.source).toBe('project');
    const ctx = testCtx({ cwd: root });
    await skillList(ctx);
    expect(ctx.outText()).toMatch(/PROJECT\n(\s+.*\n)*\s+supabase/);
  });

  test('a tool folder that links to the other copy, like npx skills makes', async () => {
    const root = project();
    put(root, `${AGENTS}/supabase/SKILL.md`, skillMd('supabase'));
    mkdirSync(join(root, CLAUDE), { recursive: true });
    symlinkSync(join(root, AGENTS, 'supabase'), join(root, CLAUDE, 'supabase'), 'junction');
    const list = testCtx({ cwd: root });
    await skillList(list);
    expect(list.outText()).toMatch(/OTHER[^\n]*\n\s+supabase/);
    await skillAdopt(testCtx({ cwd: root }), 'supabase');
    expect(has(root, '.dnw/skills/supabase/SKILL.md')).toBe(true);
    put(root, '.dnw/skills/supabase/SKILL.md', skillMd('supabase', 'Changed.'));
    await skillSync(testCtx({ cwd: root }));
    expect(read(root, `${CLAUDE}/supabase/SKILL.md`)).toContain('Changed.');
    expect(read(root, `${AGENTS}/supabase/SKILL.md`)).toContain('Changed.');
  });

  test('a skill only present as a link is listed', async () => {
    const root = initProject({ aiTools: ['claude'] });
    const elsewhere = folder({ 'SKILL.md': skillMd('linked') });
    mkdirSync(join(root, CLAUDE), { recursive: true });
    symlinkSync(elsewhere, join(root, CLAUDE, 'linked'), 'junction');
    const ctx = testCtx({ cwd: root });
    await skillList(ctx);
    expect(ctx.outText()).toMatch(/OTHER[^\n]*\n\s+linked/);
  });

  test('removing an adopted skill that was linked removes both', async () => {
    const root = project();
    put(root, `${AGENTS}/supabase/SKILL.md`, skillMd('supabase'));
    mkdirSync(join(root, CLAUDE), { recursive: true });
    symlinkSync(join(root, AGENTS, 'supabase'), join(root, CLAUDE, 'supabase'), 'junction');
    await skillAdopt(testCtx({ cwd: root }), 'supabase');
    await skillRemove(testCtx({ cwd: root }), 'supabase', { yes: true });
    expect(existsSync(join(root, CLAUDE, 'supabase'))).toBe(false);
    expect(has(root, `${AGENTS}/supabase`)).toBe(false);
  });

  test('copies that differ stop it, naming both', async () => {
    const root = project();
    put(root, `${CLAUDE}/supabase/SKILL.md`, skillMd('supabase', 'One.'));
    put(root, `${AGENTS}/supabase/SKILL.md`, skillMd('supabase', 'Two.'));
    await expect(skillAdopt(testCtx({ cwd: root }), 'supabase')).rejects.toThrow(/differ.*\.claude.*\.agents/);
    expect(has(root, '.dnw/skills/supabase')).toBe(false);
  });

  test('an invalid skill is refused', async () => {
    const root = project();
    put(root, `${CLAUDE}/broken/SKILL.md`, '---\nname: other-name\ndescription: x\n---\n');
    await expect(skillAdopt(testCtx({ cwd: root }), 'broken')).rejects.toThrow(/must match/);
  });

  test('warns when another tool also tracks it', async () => {
    const root = project();
    put(root, `${CLAUDE}/supabase/SKILL.md`, skillMd('supabase'));
    put(root, 'skills-lock.json', JSON.stringify({ skills: { supabase: { source: 'supabase/agent-skills' } } }));
    const ctx = testCtx({ cwd: root });
    await skillAdopt(ctx, 'supabase');
    expect(ctx.outText()).toContain('⚠ skills-lock.json also tracks supabase');
  });

  test('skills dnw already manages are refused', async () => {
    const root = project();
    await skillSync(testCtx({ cwd: root }));
    await expect(skillAdopt(testCtx({ cwd: root }), 'dnw-spec-writing')).rejects.toThrow(/already managed/);
  });

  test('an unknown skill points to the list', async () =>
    expect(skillAdopt(testCtx({ cwd: project() }), 'nope')).rejects.toThrow(expect.objectContaining({ next: 'dnw skill list' })));

  test('a bad name is refused', async () =>
    expect(skillAdopt(testCtx({ cwd: project() }), '../x')).rejects.toThrow(/lowercase/));
});

describe('AI instructions', () => {
  const cfg: DnwConfig = { toolVersion: '0', stack: 'node-api', testCommand: 't', testFileCommand: 't {file}', aiTools: ['claude'], superpowers: false };

  test('only add downloaded skills when the user asks, and after they approve', () => {
    const text = renderInstructions(cfg);
    expect(text).toContain('dnw skill add');
    expect(text).toContain('only when the user asks');
    expect(text).toContain('--yes');
  });

  test('Claude gets /dnw-skill-add', () => expect(adapterFiles(cfg).map((f) => f.path)).toContain('.claude/commands/dnw-skill-add.md'));
});
