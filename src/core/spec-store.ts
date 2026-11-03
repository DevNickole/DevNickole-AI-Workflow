import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { DnwError } from './errors.js';
import { formatRef, parseRef, parseSpec, serializeSpec, type SpecDoc, type SpecType } from './spec-file.js';

export function specsDir(root: string): string {
  return join(root, 'docs', 'specs');
}

export function listSpecs(root: string): SpecDoc[] {
  const dir = specsDir(root);
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => /\.(api|ui)\.md$/.test(f)).sort();
  const seen = new Map<string, SpecDoc>();
  for (const f of files) {
    const path = join(dir, f);
    const doc = parseSpec(readFileSync(path, 'utf8'), path);
    const ref = formatRef(doc.meta);
    const prev = seen.get(ref);
    if (prev) throw new DnwError(`Duplicate spec ${ref}: ${basename(prev.path)} and ${f}. Keep one.`);
    seen.set(ref, doc);
  }
  return [...seen.values()].sort((a, b) => a.meta.id.localeCompare(b.meta.id) || a.meta.type.localeCompare(b.meta.type));
}

export function findSpecOrNull(root: string, ref: string): SpecDoc | null {
  const { id, type } = parseRef(ref);
  return listSpecs(root).find((d) => d.meta.id === id && d.meta.type === type) ?? null;
}

export function findSpec(root: string, ref: string): SpecDoc {
  const doc = findSpecOrNull(root, ref);
  if (!doc) throw new DnwError(`Spec ${ref} not found`, 'dnw status');
  return doc;
}

export function writeSpec(doc: SpecDoc): void {
  writeFileSync(doc.path, serializeSpec(doc));
}

export function nextId(root: string): string {
  const max = listSpecs(root).reduce((m, d) => Math.max(m, Number(d.meta.id)), 0);
  return String(max + 1).padStart(4, '0');
}

export function slugify(title: string): string {
  return (title.toLowerCase().match(/[a-z0-9]+/g) ?? ['spec']).join('-');
}

export function specFileName(id: string, title: string, type: SpecType): string {
  return `${id}-${slugify(title)}.${type}.md`;
}
