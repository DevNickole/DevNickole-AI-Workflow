import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { stringify } from 'yaml';
import { readConfig, type DnwConfig } from '../core/config.js';
import { findRoot, type Ctx } from '../core/context.js';
import { DnwError } from '../core/errors.js';
import { fetchSource, findSkills, type FoundSkill } from '../core/skill-source.js';
import {
  assertNoSymlinks,
  assertSkillName,
  hashDir,
  installedSkillNames,
  listFiles,
  PROJECT_SKILLS,
  projectSkillNames,
  readSkillMeta,
  readSkillRecords,
  sharedSkillNames,
  sharedSkillsDir,
  skillTargets,
  skillWarnings,
  syncSkills,
  validateSkill,
  writeSkillRecords,
  type SkillSyncResult,
} from '../core/skills.js';
import { readTemplate, render } from '../core/templates.js';

function report(ctx: Ctx, result: SkillSyncResult): void {
  for (const p of result.written) ctx.out(`  ${p}\n`);
  for (const p of result.removed) ctx.out(`  removed ${p}\n`);
  for (const line of skillWarnings(result)) ctx.out(`${line}\n`);
}

function context(ctx: Ctx): { root: string; cfg: DnwConfig } {
  const root = findRoot(ctx.cwd);
  return { root, cfg: readConfig(root) };
}

function otherSkillNames(root: string, cfg: DnwConfig): string[] {
  const records = readSkillRecords(root);
  const managed = new Set([...sharedSkillNames(), ...projectSkillNames(root), ...Object.keys(records)]);
  const names = skillTargets(cfg).flatMap((t) => installedSkillNames(root, t)).filter((n) => !managed.has(n));
  return [...new Set(names)].sort();
}

function assertAvailableName(root: string, cfg: DnwConfig, name: string): void {
  assertSkillName(name);
  if (name.startsWith('dnw-')) throw new DnwError('The dnw- prefix is reserved for skills that ship with dnw');
  const taken =
    projectSkillNames(root).includes(name) ||
    sharedSkillNames().includes(name) ||
    skillTargets(cfg).some((t) => existsSync(join(root, t, name)));
  if (taken) throw new DnwError(`Skill ${name} already exists`, 'dnw skill list');
}

export async function skillNew(ctx: Ctx, name: string, opts: { description?: string }): Promise<void> {
  const { root, cfg } = context(ctx);
  assertAvailableName(root, cfg, name);
  if (opts.description === undefined && !ctx.isTTY) throw new DnwError('A skill needs a description: pass --description "..."');
  const description = (opts.description ?? (await ctx.input('When should the AI use this skill?', ''))).trim();
  if (!description) throw new DnwError('A skill needs a description: say what it does and when to use it');

  const dir = join(root, PROJECT_SKILLS, name);
  mkdirSync(dir, { recursive: true });
  const frontmatter = stringify({ name, description }, { lineWidth: 0 });
  writeFileSync(join(dir, 'SKILL.md'), `---\n${frontmatter}---\n${render(readTemplate('skill.md'), { name })}`);
  ctx.out(`✓ Created ${PROJECT_SKILLS}${name}/SKILL.md\n`);
  ctx.out('  Write it yourself, or ask your AI to help (the dnw-skill-writing skill guides it). Then run: dnw skill sync\n');
  report(ctx, syncSkills(root, cfg));
}

export async function skillEdit(ctx: Ctx, name: string): Promise<void> {
  assertSkillName(name);
  const { root, cfg } = context(ctx);
  const path = `${PROJECT_SKILLS}${name}/SKILL.md`;
  if (!projectSkillNames(root).includes(name)) {
    if (sharedSkillNames().includes(name)) {
      cpSync(join(sharedSkillsDir(), name), join(root, PROJECT_SKILLS, name), { recursive: true });
      ctx.out(`✓ Made a project copy of shared skill ${name}. dnw upgrade will no longer replace it.\n`);
    } else if (otherSkillNames(root, cfg).includes(name)) {
      throw new DnwError(`Skill ${name} is not managed by dnw; edit it where it is`);
    } else {
      throw new DnwError(`Skill ${name} not found`, 'dnw skill list');
    }
  }
  ctx.out(`Edit ${path}, then run: dnw skill sync\n`);
}

export async function skillSync(ctx: Ctx): Promise<void> {
  const { root, cfg } = context(ctx);
  // check everything first, so one broken skill never leaves the tools half updated
  for (const name of projectSkillNames(root)) validateSkill(join(root, PROJECT_SKILLS, name), name);
  const result = syncSkills(root, cfg);
  if (result.written.length + result.removed.length + result.conflicts.length === 0) {
    ctx.out('✓ Skills are in sync\n');
    return;
  }
  ctx.out('✓ Synced skills\n');
  report(ctx, result);
}

export async function skillList(ctx: Ctx): Promise<void> {
  const { root, cfg } = context(ctx);
  const project = projectSkillNames(root);
  const shared = sharedSkillNames().filter((n) => !project.includes(n));
  const other = otherSkillNames(root, cfg);
  const records = readSkillRecords(root);
  const group = (title: string, names: string[]) => {
    if (!names.length) return;
    ctx.out(`${title}\n`);
    for (const n of names) {
      const origin = records[n]?.origin;
      ctx.out(`  ${n}${origin ? `  (from ${origin.source})` : ''}\n`);
    }
  };
  group('SHARED', shared);
  group('PROJECT', project);
  group('OTHER (not managed by dnw)', other);
}

export async function skillRemove(ctx: Ctx, name: string, opts: { yes?: boolean }): Promise<void> {
  assertSkillName(name);
  const { root, cfg } = context(ctx);
  if (!projectSkillNames(root).includes(name)) {
    if (sharedSkillNames().includes(name)) throw new DnwError(`Skill ${name} ships with dnw, so it cannot be removed from a project`);
    throw new DnwError(`Skill ${name} is not a project skill`, 'dnw skill list');
  }
  if (!opts.yes) {
    if (!ctx.isTTY) throw new DnwError('Removing a skill needs confirmation: run it in a terminal, or pass --yes');
    if (!(await ctx.confirm(`Remove skill ${name} and its copies?`))) throw new DnwError('Removal cancelled');
  }
  rmSync(join(root, PROJECT_SKILLS, name), { recursive: true, force: true });
  ctx.out(`✓ Removed skill ${name}\n`);
  report(ctx, syncSkills(root, cfg));
}

function chooseSkills(ctx: Ctx, found: FoundSkill[], source: string, opts: SkillAddOptions): Promise<FoundSkill[]> | FoundSkill[] {
  const names = found.map((s) => s.name ?? s.path);
  if (opts.skill) {
    const match = found.filter((s) => s.name === opts.skill);
    if (!match.length) throw new DnwError(`No skill ${opts.skill} in ${source}. It has: ${names.join(', ')}`);
    return match;
  }
  if (found.length === 1) return found;
  if (opts.yes || !ctx.isTTY) throw new DnwError(`${source} has ${found.length} skills: ${names.join(', ')}. Pick with --skill <name>`);
  return ctx
    .checkbox(`Which skills from ${source}?`, found.map((s) => ({ value: s.path, name: s.name ?? s.path })))
    .then((paths) => {
      if (!paths.length) throw new DnwError('Nothing chosen, so adding was cancelled');
      return found.filter((s) => paths.includes(s.path));
    });
}

/** Text from a download goes to the terminal, so control characters are removed first. */
function printable(text: string): string {
  return text.replace(/\p{Cc}+/gu, ' ').trim();
}

function printSkill(ctx: Ctx, skill: FoundSkill, source: string, commit: string | null): void {
  const files = listFiles(skill.dir).filter((f) => !f.startsWith('.git/'));
  const description = String(readSkillMeta(join(skill.dir, 'SKILL.md')).meta.description);
  ctx.out(`Skill: ${printable(skill.name!)}\n`);
  ctx.out(`  ${printable(description)}\n`);
  ctx.out(`  From: ${printable(source)}${commit ? ` @ ${commit.slice(0, 7)}` : ''}\n`);
  const shown = files.slice(0, 20).map(printable).join(', ');
  ctx.out(`  Files (${files.length}): ${shown}${files.length > 20 ? ', ...' : ''}\n`);
  const unusual = files.filter((f) => !/\.mdx?$/i.test(f)).map(printable);
  if (unusual.length) ctx.out(`  ⚠ Not Markdown, review before trusting: ${unusual.join(', ')}\n`);
}

export interface SkillAddOptions {
  skill?: string;
  yes?: boolean;
}

/** Downloads skills and makes them project skills. Nothing from a skill is ever run. */
export async function skillAdd(ctx: Ctx, source: string, opts: SkillAddOptions): Promise<void> {
  const { root, cfg } = context(ctx);
  const fetched = fetchSource(ctx.cwd, source, ctx.isTTY);
  try {
    const found = findSkills(fetched.dir);
    if (!found.length) throw new DnwError(`No SKILL.md found in ${source}`);
    const chosen = await chooseSkills(ctx, found, source, opts);

    // check everything first, so a bad skill never leaves the others half added
    for (const skill of chosen) {
      if (!skill.name) throw new DnwError(`${skill.path}/SKILL.md has no name in its frontmatter`);
      assertAvailableName(root, cfg, skill.name);
      validateSkill(skill.dir, skill.name);
      assertNoSymlinks(skill.dir, skill.path);
    }
    for (const skill of chosen) printSkill(ctx, skill, source, fetched.commit);
    if (!opts.yes) {
      if (!ctx.isTTY) throw new DnwError('Adding a skill needs confirmation: review the details above, then run it in a terminal or pass --yes');
      ctx.out('A skill is instructions your AI will follow. Only add ones you trust.\n');
      if (!(await ctx.confirm(`Add ${chosen.map((s) => s.name).join(', ')}?`))) throw new DnwError('Adding was cancelled');
    }

    for (const skill of chosen) {
      cpSync(skill.dir, join(root, PROJECT_SKILLS, skill.name!), { recursive: true, filter: (src) => basename(src) !== '.git' });
      ctx.out(`✓ Added ${skill.name} to ${PROJECT_SKILLS}\n`);
    }
    const result = syncSkills(root, cfg);
    const records = readSkillRecords(root);
    for (const skill of chosen) {
      records[skill.name!] = { ...records[skill.name!], origin: { source, path: skill.path, commit: fetched.commit } };
    }
    writeSkillRecords(root, records);
    report(ctx, result);
  } finally {
    fetched.cleanup();
  }
}

/** Brings a skill dnw did not create under dnw, so it reaches every AI tool. */
export async function skillAdopt(ctx: Ctx, name: string): Promise<void> {
  assertSkillName(name);
  const { root, cfg } = context(ctx);
  if (projectSkillNames(root).includes(name) || sharedSkillNames().includes(name)) {
    throw new DnwError(`Skill ${name} is already managed by dnw`);
  }
  if (!otherSkillNames(root, cfg).includes(name)) throw new DnwError(`Skill ${name} not found`, 'dnw skill list');

  const copies = skillTargets(cfg).filter((t) => existsSync(join(root, t, name)));
  for (const t of copies) assertNoSymlinks(join(root, t, name), `${t}${name}`);
  if (new Set(copies.map((t) => hashDir(join(root, t, name)))).size > 1) {
    throw new DnwError(`Copies of ${name} differ: ${copies.map((t) => `${t}${name}/`).join(' and ')}. Make them match, then adopt it`);
  }
  const source = join(root, copies[0], name);
  validateSkill(source, name);

  cpSync(source, join(root, PROJECT_SKILLS, name), { recursive: true, dereference: true });
  ctx.out(`✓ Adopted ${name} into ${PROJECT_SKILLS}${name}/\n`);
  report(ctx, syncSkills(root, cfg));

  const lock = join(root, 'skills-lock.json');
  if (existsSync(lock) && name in (JSON.parse(readFileSync(lock, 'utf8')).skills ?? {})) {
    ctx.out(`⚠ skills-lock.json also tracks ${name}. Updates from that tool will count as hand edits, so dnw will keep them and warn you.\n`);
  }
}
