import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { readConfig, type DnwConfig } from '../core/config.js';
import { findRoot, type Ctx } from '../core/context.js';
import { DnwError } from '../core/errors.js';
import {
  assertSkillName,
  installedSkillNames,
  PROJECT_SKILLS,
  projectSkillNames,
  readSkillRecords,
  sharedSkillNames,
  sharedSkillsDir,
  skillTargets,
  skillWarnings,
  syncSkills,
  validateSkill,
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

export async function skillNew(ctx: Ctx, name: string, opts: { description: string }): Promise<void> {
  assertSkillName(name);
  if (name.startsWith('dnw-')) throw new DnwError('The dnw- prefix is reserved for skills that ship with dnw');
  const description = opts.description.trim();
  if (!description) throw new DnwError('A skill needs a description: say what it does and when to use it');
  const { root, cfg } = context(ctx);
  const taken =
    projectSkillNames(root).includes(name) ||
    sharedSkillNames().includes(name) ||
    skillTargets(cfg).some((t) => existsSync(join(root, t, name)));
  if (taken) throw new DnwError(`Skill ${name} already exists`, 'dnw skill list');

  const dir = join(root, PROJECT_SKILLS, name);
  mkdirSync(dir, { recursive: true });
  const frontmatter = stringify({ name, description }, { lineWidth: 0 });
  writeFileSync(join(dir, 'SKILL.md'), `---\n${frontmatter}---\n${render(readTemplate('skill.md'), { name })}`);
  ctx.out(`✓ Created ${PROJECT_SKILLS}${name}/SKILL.md. Fill it in, then run: dnw skill sync\n`);
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
  const group = (title: string, names: string[]) => {
    if (!names.length) return;
    ctx.out(`${title}\n`);
    for (const n of names) ctx.out(`  ${n}\n`);
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
