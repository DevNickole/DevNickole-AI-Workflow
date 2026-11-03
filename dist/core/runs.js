import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
function runsPath(root) {
    return join(root, '.dnw', 'runs.json');
}
export function runKey(ref, taskId) {
    return `${ref}/${taskId}`;
}
export function readRuns(root) {
    const path = runsPath(root);
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
}
export function recordRun(root, key, kind, exitCode, at) {
    const runs = readRuns(root);
    runs[key] = { ...runs[key], [kind]: { at, exitCode } };
    mkdirSync(join(root, '.dnw'), { recursive: true });
    writeFileSync(runsPath(root), JSON.stringify(runs, null, 2) + '\n');
}
