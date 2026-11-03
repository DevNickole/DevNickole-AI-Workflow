import { join, relative, sep } from 'node:path';
import { findRoot, type Ctx } from '../core/context.js';
import { DnwError, guard } from '../core/errors.js';
import {
  assertCanActivate,
  assertCanReview,
  assertCanSpecDone,
  assertCanSupersede,
} from '../core/lifecycle.js';
import { readRuns } from '../core/runs.js';
import { formatRef, parseSpec, type SpecDoc, type SpecType } from '../core/spec-file.js';
import { findSpec, findSpecOrNull, nextId, specFileName, specsDir, writeSpec } from '../core/spec-store.js';
import { readTemplate, render } from '../core/templates.js';

const other = (t: SpecType): SpecType => (t === 'api' ? 'ui' : 'api');

function rel(root: string, path: string): string {
  return relative(root, path).split(sep).join('/');
}

export async function specNew(ctx: Ctx, title: string, opts: { type: SpecType; id?: string }): Promise<SpecDoc> {
  const root = findRoot(ctx.cwd);
  const { type } = opts;
  let id: string;
  if (opts.id !== undefined) {
    if (!/^\d{1,4}$/.test(opts.id)) throw new DnwError(`Invalid id "${opts.id}": expected a number like 0001`);
    id = opts.id.padStart(4, '0');
    if (findSpecOrNull(root, `${id}.${type}`)) throw new DnwError(`${id}.${type} already exists`, 'dnw status');
    if (!findSpecOrNull(root, `${id}.${other(type)}`)) {
      throw new DnwError(`No spec ${id} exists to pair with`, `dnw spec new "${title}" --type ${type}`);
    }
  } else {
    id = nextId(root);
  }
  const dependsOn = type === 'ui' && findSpecOrNull(root, `${id}.api`) ? `"${id}.api"` : 'null';
  const vars: Record<string, string> = { id, title: JSON.stringify(title) };
  if (type === 'ui') vars.dependsOn = dependsOn;
  const path = join(specsDir(root), specFileName(id, title, type));
  const doc = parseSpec(render(readTemplate(`spec.${type}.md`), vars), path);
  writeSpec(doc);
  ctx.out(`✓ Created ${rel(root, path)} (draft)\n`);
  return doc;
}

export async function specReview(ctx: Ctx, ref: string): Promise<void> {
  const doc = findSpec(findRoot(ctx.cwd), ref);
  guard('review', ref, () => assertCanReview(doc));
  doc.meta.status = 'review';
  writeSpec(doc);
  ctx.out(`✓ ${ref} → review\n  Next: a human runs dnw spec activate ${ref}\n`);
}

export async function specActivate(ctx: Ctx, ref: string): Promise<void> {
  const root = findRoot(ctx.cwd);
  const doc = findSpec(root, ref);
  const pair = doc.meta.type === 'ui' ? findSpecOrNull(root, `${doc.meta.id}.api`) : null;
  guard('activate', ref, () => assertCanActivate(doc, pair, ctx.isTTY));
  if (!(await ctx.confirm(`Approve ${ref} "${doc.meta.title}" and set it active?`))) {
    throw new DnwError('Activation cancelled');
  }
  doc.meta.status = 'active';
  doc.meta.approvedBy = ctx.gitUser();
  writeSpec(doc);
  const first = doc.tasks.find((t) => t.state === 'todo');
  ctx.out(`✓ ${ref} → active (approved by ${doc.meta.approvedBy})\n`);
  if (first) ctx.out(`  Next: dnw task start ${ref} ${first.id}\n`);
}

export async function specDone(ctx: Ctx, ref: string): Promise<void> {
  const root = findRoot(ctx.cwd);
  const doc = findSpec(root, ref);
  guard('finish', ref, () => assertCanSpecDone(doc, readRuns(root)));
  doc.meta.status = 'done';
  writeSpec(doc);
  ctx.out(`✓ ${ref} → done\n`);
}

export async function specSupersede(ctx: Ctx, ref: string, by: string): Promise<void> {
  const root = findRoot(ctx.cwd);
  const doc = findSpec(root, ref);
  const replacement = findSpec(root, by);
  guard('supersede', ref, () => assertCanSupersede(doc, replacement));
  doc.meta.status = 'superseded';
  doc.meta.supersededBy = formatRef(replacement.meta);
  writeSpec(doc);
  ctx.out(`✓ ${ref} → superseded by ${doc.meta.supersededBy}\n`);
}
