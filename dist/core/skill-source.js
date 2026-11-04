import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { DnwError } from './errors.js';
import { readSkillMeta } from './skills.js';
import { tail } from './test-runner.js';
/**
 * The URL to clone for a source, or null when it is not one.
 * Only these forms are allowed: an argument starting with "-", or a transport like ext::, must never reach git.
 */
export function cloneUrl(source) {
    if (/^[\w.-]+\/[\w.-]+$/.test(source))
        return `https://github.com/${source}.git`;
    return /^(https:\/\/|ssh:\/\/|git@|file:\/\/)\S+$/.test(source) ? source : null;
}
/** Makes a source available locally: a folder as it is, or a shallow clone in a temp folder. */
export function fetchSource(cwd, source, interactive) {
    const local = resolve(cwd, source);
    if (existsSync(local) && statSync(local).isDirectory())
        return { dir: local, commit: null, cleanup: () => { } };
    const url = cloneUrl(source);
    if (!url)
        throw new DnwError(`Cannot find "${source}": use owner/repo, a git URL, or a local folder`);
    const tmp = mkdtempSync(join(tmpdir(), 'dnw-skill-'));
    const cleanup = () => rmSync(tmp, { recursive: true, force: true });
    const dir = join(tmp, 'repo');
    const env = { ...process.env, GIT_TERMINAL_PROMPT: interactive ? '1' : '0' };
    // no shell: the URL can never be read as a command
    const clone = spawnSync('git', ['clone', '--quiet', '--depth', '1', '--', url, dir], { encoding: 'utf8', env });
    if (clone.error || clone.status !== 0) {
        cleanup();
        const reason = clone.error ? 'git is needed to download skills' : tail(clone.stderr ?? '', 3);
        throw new DnwError(`Could not download ${source}: ${reason}`);
    }
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' });
    return { dir, commit: head.status === 0 ? head.stdout.trim() : null, cleanup };
}
function skillName(dir) {
    try {
        const { name } = readSkillMeta(join(dir, 'SKILL.md')).meta;
        return typeof name === 'string' ? name : null;
    }
    catch {
        return null;
    }
}
/** Every skill in a folder tree. Folders inside a skill belong to it, so the search stops there. */
export function findSkills(root, dir = root) {
    const entries = readdirSync(dir, { withFileTypes: true });
    if (entries.some((e) => e.isFile() && e.name === 'SKILL.md')) {
        return [{ name: skillName(dir), dir, path: relative(root, dir).split(sep).join('/') || '.' }];
    }
    return entries
        .filter((e) => e.isDirectory() && e.name !== '.git' && e.name !== 'node_modules')
        .sort((a, b) => a.name.localeCompare(b.name))
        .flatMap((e) => findSkills(root, join(dir, e.name)));
}
