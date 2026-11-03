import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AdapterFile } from '../adapters/index.js';

export interface Manifest {
  toolVersion: string;
  /** managed path -> sha256 of the content dnw last wrote there */
  files: Record<string, string>;
}

const START = '<!-- dnw:start -->';
const END = '<!-- dnw:end -->';

export function hash(content: string): string {
  return createHash('sha256').update(content.replace(/\r\n/g, '\n')).digest('hex');
}

export function applyMarkerBlock(existing: string | null, block: string): string {
  const wrapped = `${START}\n${block.trimEnd()}\n${END}`;
  if (existing === null) return wrapped + '\n';
  const s = existing.indexOf(START);
  const e = existing.indexOf(END);
  if (s !== -1 && e > s) return existing.slice(0, s) + wrapped + existing.slice(e + END.length);
  return existing.trimEnd() + '\n\n' + wrapped + '\n';
}

function manifestPath(root: string): string {
  return join(root, '.dnw', 'manifest.json');
}

export function readManifest(root: string): Manifest | null {
  const p = manifestPath(root);
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as Manifest) : null;
}

export function writeManifest(root: string, m: Manifest): void {
  mkdirSync(join(root, '.dnw'), { recursive: true });
  writeFileSync(manifestPath(root), JSON.stringify(m, null, 2) + '\n');
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function deepMerge(base: unknown, patch: unknown): unknown {
  if (!isObject(base) || !isObject(patch)) return patch;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) out[k] = deepMerge(base[k], v);
  return out;
}

export function writeManagedFiles(
  root: string,
  files: AdapterFile[],
  prev: Manifest | null,
  toolVersion: string,
): { manifest: Manifest; written: string[]; conflicts: string[] } {
  const manifest: Manifest = { toolVersion, files: {} };
  const written: string[] = [];
  const conflicts: string[] = [];

  for (const f of files) {
    const abs = join(root, f.path);
    const current = existsSync(abs) ? readFileSync(abs, 'utf8') : null;
    const write = (path: string, content: string) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
    };
    manifest.files[f.path] = hash(f.content);

    if (f.mode === 'marker') {
      write(abs, applyMarkerBlock(current, f.content));
      written.push(f.path);
    } else if (f.mode === 'json-merge') {
      let base: unknown = {};
      if (current !== null) {
        try {
          base = JSON.parse(current);
        } catch {
          conflicts.push(f.path);
          continue;
        }
      }
      write(abs, JSON.stringify(deepMerge(base, JSON.parse(f.content)), null, 2) + '\n');
      written.push(f.path);
    } else if (current === null || hash(current) === hash(f.content) || prev?.files[f.path] === hash(current)) {
      write(abs, f.content);
      written.push(f.path);
    } else {
      write(`${abs}.new`, f.content);
      conflicts.push(f.path);
    }
  }
  return { manifest, written, conflicts };
}
