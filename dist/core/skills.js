import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { DnwError } from './errors.js';
import { SpecParseError } from './spec-file.js';
export const PROJECT_SKILLS = '.dnw/skills/';
const SKILL_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export function assertSkillName(name) {
    if (!SKILL_NAME.test(name)) {
        throw new DnwError(`Invalid skill name "${name}": use lowercase letters, numbers and hyphens, e.g. api-style`);
    }
}
/** Skill folders each chosen AI tool loads. Codex and Antigravity share one. */
export function skillTargets(cfg) {
    const targets = [];
    if (cfg.aiTools.includes('claude'))
        targets.push('.claude/skills/');
    if (cfg.aiTools.includes('codex') || cfg.aiTools.includes('antigravity'))
        targets.push('.agents/skills/');
    return targets;
}
export function sharedSkillsDir() {
    return fileURLToPath(new URL('../../skills/', import.meta.url));
}
/** Sub-folders of dir, including links to folders: tools like `npx skills` link one AI tool's folder to another's. */
function folderNames(dir) {
    if (!existsSync(dir))
        return [];
    return readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory() || (e.isSymbolicLink() && existsSync(join(dir, e.name)) && statSync(join(dir, e.name)).isDirectory()))
        .map((e) => e.name)
        .sort();
}
export function sharedSkillNames() {
    return folderNames(sharedSkillsDir());
}
export function projectSkillNames(root) {
    return folderNames(join(root, PROJECT_SKILLS));
}
/** Folders in a tool's skill directory, whoever put them there. */
export function installedSkillNames(root, target) {
    return folderNames(join(root, target));
}
function recordsPath(root) {
    return join(root, '.dnw', 'skills.json');
}
export function readSkillRecords(root) {
    const path = recordsPath(root);
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
}
export function writeSkillRecords(root, records) {
    mkdirSync(dirname(recordsPath(root)), { recursive: true });
    writeFileSync(recordsPath(root), JSON.stringify(records, null, 2) + '\n');
}
/** Every file in a skill folder, relative and with forward slashes. Links inside it are skipped. */
export function listFiles(dir, prefix = '') {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const rel = `${prefix}${e.name}`;
        if (e.isSymbolicLink())
            return [];
        return e.isDirectory() ? listFiles(join(dir, e.name), `${rel}/`) : [rel];
    });
}
/** Refuses a skill with links inside: a link could pull a private file into the skill. */
export function assertNoSymlinks(dir, shown = dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isSymbolicLink())
            throw new DnwError(`${shown}/${e.name} is a symlink; skills with symlinks are refused`);
        if (e.isDirectory())
            assertNoSymlinks(join(dir, e.name), `${shown}/${e.name}`);
    }
}
/** Hash of every file in a skill folder, as raw bytes. `.new` files left by dnw are ignored. */
export function hashDir(dir) {
    const hash = createHash('sha256');
    for (const rel of listFiles(dir).filter((f) => !f.endsWith('.new')).sort()) {
        hash.update(rel).update('\0').update(readFileSync(join(dir, rel))).update('\0');
    }
    return hash.digest('hex');
}
/** Parses a SKILL.md's frontmatter. `lineOf` gives a key's line for error messages. */
export function readSkillMeta(file) {
    if (!existsSync(file) || !statSync(file).isFile())
        throw new SpecParseError(file, 1, 'SKILL.md is missing');
    const lines = readFileSync(file, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n').split('\n');
    if (lines[0] !== '---')
        throw new SpecParseError(file, 1, 'missing frontmatter (expected "---" on line 1)');
    const end = lines.indexOf('---', 1);
    if (end === -1)
        throw new SpecParseError(file, 1, 'frontmatter is not closed with "---"');
    const fm = lines.slice(1, end);
    const lineOf = (key) => {
        const i = fm.findIndex((l) => l.startsWith(`${key}:`));
        return i === -1 ? 1 : i + 2;
    };
    let meta;
    try {
        meta = (parse(fm.join('\n')) ?? {});
    }
    catch (e) {
        throw new SpecParseError(file, 1, `invalid frontmatter: ${e.message}`);
    }
    return { meta, lineOf };
}
/** Checks a skill folder: a SKILL.md whose name matches the folder, and a description. */
export function validateSkill(dir, name) {
    const file = join(dir, 'SKILL.md');
    const { meta, lineOf } = readSkillMeta(file);
    if (meta.name !== name)
        throw new SpecParseError(file, lineOf('name'), `name must match the folder name "${name}"`);
    if (typeof meta.description !== 'string' || !meta.description.trim()) {
        throw new SpecParseError(file, lineOf('description'), 'description is required: say what the skill does and when to use it');
    }
}
/** What should be installed: shared skills, with a project skill of the same name taking over. */
function desiredSkills(root) {
    const desired = new Map();
    for (const name of sharedSkillNames())
        desired.set(name, { source: 'shared', dir: join(sharedSkillsDir(), name) });
    for (const name of projectSkillNames(root))
        desired.set(name, { source: 'project', dir: join(root, PROJECT_SKILLS, name) });
    return desired;
}
function replaceFolder(source, dest) {
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(source, dest, { recursive: true });
}
/** Brings every AI tool's skill folders in line with the sources. Never overwrites a copy edited by hand. */
export function syncSkills(root, cfg) {
    const result = { written: [], removed: [], conflicts: [] };
    const records = readSkillRecords(root);
    const next = {};
    const targets = skillTargets(cfg);
    const desired = desiredSkills(root);
    for (const [name, { source, dir }] of desired) {
        const hash = hashDir(dir);
        for (const target of targets) {
            const dest = join(root, target, name);
            const copy = existsSync(dest) ? hashDir(dest) : null;
            if (copy === hash)
                continue;
            if (copy === null || copy === records[name]?.hash) {
                replaceFolder(dir, dest);
                result.written.push(`${target}${name}/`);
            }
            else {
                writeFileSync(join(dest, 'SKILL.md.new'), readFileSync(join(dir, 'SKILL.md')));
                result.conflicts.push(`${target}${name}/`);
            }
        }
        const origin = source === 'project' ? records[name]?.origin : undefined;
        next[name] = { source, hash, ...(origin && { origin }) };
    }
    // no longer wanted: a removed project skill, or a shared skill a later release dropped
    for (const [name, record] of Object.entries(records)) {
        if (desired.has(name))
            continue;
        for (const target of targets) {
            const dest = join(root, target, name);
            if (!existsSync(dest))
                continue;
            if (hashDir(dest) === record.hash) {
                rmSync(dest, { recursive: true, force: true });
                result.removed.push(`${target}${name}/`);
            }
            else {
                result.conflicts.push(`${target}${name}/`);
            }
        }
    }
    writeSkillRecords(root, next);
    return result;
}
/** Project skills whose source differs from a tool's copy, so a sync is due. */
export function staleSkills(root, cfg) {
    const targets = skillTargets(cfg);
    return projectSkillNames(root).filter((name) => {
        const hash = hashDir(join(root, PROJECT_SKILLS, name));
        return targets.some((t) => {
            const dest = join(root, t, name);
            return !existsSync(dest) || hashDir(dest) !== hash;
        });
    });
}
export function skillWarnings(result) {
    return result.conflicts.map((p) => `⚠ ${p} was edited directly, so dnw left it as it is (any new version is in SKILL.md.new)`);
}
