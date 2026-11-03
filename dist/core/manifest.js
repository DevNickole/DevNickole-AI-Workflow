import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
const START = '<!-- dnw:start -->';
const END = '<!-- dnw:end -->';
export function hash(content) {
    return createHash('sha256').update(content.replace(/\r\n/g, '\n')).digest('hex');
}
/** Inserts or replaces the dnw block. Returns null when the markers are broken, so user text is never guessed at. */
export function applyMarkerBlock(existing, block) {
    const wrapped = `${START}\n${block.trimEnd()}\n${END}`;
    if (existing === null)
        return wrapped + '\n';
    const s = existing.indexOf(START);
    const e = existing.indexOf(END);
    if (s === -1 && e === -1)
        return existing.trimEnd() + '\n\n' + wrapped + '\n';
    if (s === -1 || e < s)
        return null;
    return existing.slice(0, s) + wrapped + existing.slice(e + END.length);
}
/** Warning lines for files writeManagedFiles could not update. */
export function managedWarnings(r) {
    return [
        ...r.conflicts.map((p) => `⚠ ${p} was modified locally; new version written to ${p}.new`),
        ...r.invalid.map((p) => `⚠ ${p} is not valid JSON and was left unchanged; fix it, then run dnw upgrade`),
    ];
}
function manifestPath(root) {
    return join(root, '.dnw', 'manifest.json');
}
export function readManifest(root) {
    const p = manifestPath(root);
    return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}
export function writeManifest(root, m) {
    mkdirSync(join(root, '.dnw'), { recursive: true });
    writeFileSync(manifestPath(root), JSON.stringify(m, null, 2) + '\n');
}
function isObject(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
export function deepMerge(base, patch) {
    if (!isObject(base) || !isObject(patch))
        return patch;
    const out = { ...base };
    for (const [k, v] of Object.entries(patch))
        out[k] = deepMerge(base[k], v);
    return out;
}
export function writeManagedFiles(root, files, prev, toolVersion) {
    const manifest = { toolVersion, files: {} };
    const written = [];
    /** kept as-is; the new version is in <path>.new */
    const conflicts = [];
    /** existing JSON could not be parsed; left untouched, nothing written */
    const invalid = [];
    for (const f of files) {
        const abs = join(root, f.path);
        const current = existsSync(abs) ? readFileSync(abs, 'utf8') : null;
        const write = (path, content) => {
            mkdirSync(dirname(path), { recursive: true });
            writeFileSync(path, content);
        };
        manifest.files[f.path] = hash(f.content);
        if (f.mode === 'marker') {
            const merged = applyMarkerBlock(current, f.content);
            if (merged === null) {
                write(`${abs}.new`, applyMarkerBlock(null, f.content));
                conflicts.push(f.path);
            }
            else {
                write(abs, merged);
                written.push(f.path);
            }
        }
        else if (f.mode === 'json-merge') {
            let base = {};
            if (current !== null) {
                try {
                    base = JSON.parse(current);
                }
                catch {
                    invalid.push(f.path);
                    continue;
                }
            }
            write(abs, JSON.stringify(deepMerge(base, JSON.parse(f.content)), null, 2) + '\n');
            written.push(f.path);
        }
        else if (current === null || hash(current) === hash(f.content) || prev?.files[f.path] === hash(current)) {
            write(abs, f.content);
            written.push(f.path);
        }
        else {
            write(`${abs}.new`, f.content);
            conflicts.push(f.path);
        }
    }
    return { manifest, written, conflicts, invalid };
}
