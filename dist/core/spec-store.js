import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { DnwError } from './errors.js';
import { formatRef, parseRef, parseSpec, serializeSpec } from './spec-file.js';
export function specsDir(root) {
    return join(root, 'docs', 'specs');
}
export function listSpecs(root) {
    const dir = specsDir(root);
    if (!existsSync(dir))
        return [];
    const files = readdirSync(dir).filter((f) => /\.(api|ui)\.md$/.test(f)).sort();
    const seen = new Map();
    for (const f of files) {
        const path = join(dir, f);
        const doc = parseSpec(readFileSync(path, 'utf8'), path);
        const ref = formatRef(doc.meta);
        const prev = seen.get(ref);
        if (prev)
            throw new DnwError(`Duplicate spec ${ref}: ${basename(prev.path)} and ${f}. Keep one.`);
        seen.set(ref, doc);
    }
    return [...seen.values()].sort((a, b) => a.meta.id.localeCompare(b.meta.id) || a.meta.type.localeCompare(b.meta.type));
}
export function findSpecOrNull(root, ref) {
    const { id, type } = parseRef(ref);
    return listSpecs(root).find((d) => d.meta.id === id && d.meta.type === type) ?? null;
}
export function findSpec(root, ref) {
    const doc = findSpecOrNull(root, ref);
    if (!doc)
        throw new DnwError(`Spec ${ref} not found`, 'dnw status');
    return doc;
}
export function writeSpec(doc) {
    writeFileSync(doc.path, serializeSpec(doc));
}
export function nextId(root) {
    const max = listSpecs(root).reduce((m, d) => Math.max(m, Number(d.meta.id)), 0);
    return String(max + 1).padStart(4, '0');
}
export function slugify(title) {
    const slug = (title.toLowerCase().match(/[a-z0-9]+/g) ?? ['spec']).join('-');
    // keep file names short enough for Windows paths
    return slug.slice(0, 50).replace(/-+$/, '');
}
export function specFileName(id, title, type) {
    return `${id}-${slugify(title)}.${type}.md`;
}
