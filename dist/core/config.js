import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DnwError } from './errors.js';
export const DEFAULT_DOCS = {
    architecture: 'docs/architecture/',
    products: 'docs/products/',
    designSystem: 'docs/design-system/',
};
export const DEFAULT_COMMAND = 'npx --no-install dnw';
export function docsPaths(cfg) {
    return { ...DEFAULT_DOCS, ...cfg.docs };
}
export function dnwCommand(cfg) {
    return cfg.command ?? DEFAULT_COMMAND;
}
export function configPath(root) {
    return join(root, '.dnw', 'config.json');
}
export function readConfig(root) {
    const path = configPath(root);
    if (!existsSync(path))
        throw new DnwError('No .dnw/config.json in this project', 'dnw init');
    return JSON.parse(readFileSync(path, 'utf8'));
}
export function writeConfig(root, cfg) {
    mkdirSync(join(root, '.dnw'), { recursive: true });
    writeFileSync(configPath(root), JSON.stringify(cfg, null, 2) + '\n');
}
