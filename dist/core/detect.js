import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readPackageJson } from './stack.js';
/** Where existing projects commonly keep each doc, most specific first. Folders end in "/". */
const DOC_CANDIDATES = {
    architecture: ['docs/architecture/', 'docs/architecture.md', 'docs/ARCHITECTURE.md', 'ARCHITECTURE.md'],
    products: ['docs/products/', 'docs/product/', 'docs/product.md', 'docs/mvp.md', 'docs/prd.md', 'docs/PRD.md', 'PRD.md'],
    designSystem: [
        'docs/design-system/',
        'docs/design-system.md',
        'lib/theme/',
        'src/theme/',
        'src/design-system/',
        'src/components/ui/',
        // Laravel: React/Vue starter kits, Breeze-style Inertia, then Blade components
        'resources/js/components/',
        'resources/js/Components/',
        'resources/views/components/',
    ],
};
function exists(root, candidate) {
    const abs = join(root, candidate);
    if (!existsSync(abs))
        return false;
    return candidate.endsWith('/') ? statSync(abs).isDirectory() : statSync(abs).isFile();
}
export function detectDocs(root) {
    const found = (key) => DOC_CANDIDATES[key].find((c) => exists(root, c)) ?? null;
    return { architecture: found('architecture'), products: found('products'), designSystem: found('designSystem') };
}
export function detectAiTools(root) {
    const has = (...paths) => paths.some((p) => existsSync(join(root, p)));
    const tools = [];
    if (has('CLAUDE.md', '.claude'))
        tools.push('claude');
    if (has('AGENTS.md'))
        tools.push('codex');
    if (has('.agents', '.agent', 'GEMINI.md'))
        tools.push('antigravity');
    return tools;
}
/** `npx --no-install dnw` when the project pins dnw as a dependency, else a global `dnw`. */
export function detectDnwCommand(root) {
    const pkg = readPackageJson(root);
    const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
    return 'dev-nickole-workflow' in deps ? 'npx --no-install dnw' : 'dnw';
}
/** Folders that hold custom AI commands; dnw's own `dnw-*` commands are skipped. */
const COMMAND_DIRS = ['.claude/commands/', '.agents/workflows/', '.agent/workflows/'];
/** Folders other workflows keep task, plan or spec docs in. dnw's own docs/specs/ is not one of them. */
const TASK_DIRS = ['docs/tasks/', 'docs/plans/', 'docs/superpowers/specs/', 'docs/superpowers/plans/', 'specs/', '.kiro/specs/', 'tasks/'];
function markdownFiles(root, dir, recursive) {
    const abs = join(root, dir);
    if (!existsSync(abs) || !statSync(abs).isDirectory())
        return [];
    return readdirSync(abs, { recursive, withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith('.md'))
        .map((e) => e.name);
}
/** A workflow the project already had before dnw: custom AI commands and folders of task or plan docs. */
export function detectExistingWorkflow(root) {
    const commands = COMMAND_DIRS.flatMap((dir) => markdownFiles(root, dir, false)
        .filter((f) => !f.startsWith('dnw-'))
        .sort()
        .map((f) => dir + f));
    const taskDirs = TASK_DIRS.map((path) => ({ path, files: markdownFiles(root, path, true).length })).filter((d) => d.files > 0);
    return { commands, taskDirs };
}
/** How a command file is invoked in chat, e.g. .claude/commands/dm.md → /dm. */
export function commandName(path) {
    return '/' + path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '');
}
