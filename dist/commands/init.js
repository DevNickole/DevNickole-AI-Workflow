import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { adapterFiles, superpowersSteps } from '../adapters/index.js';
import { configPath, DEFAULT_DOCS, writeConfig, } from '../core/config.js';
import { findRoot } from '../core/context.js';
import { detectAiTools, detectDnwCommand, detectDocs } from '../core/detect.js';
import { DnwError } from '../core/errors.js';
import { managedWarnings, writeManagedFiles, writeManifest } from '../core/manifest.js';
import { detectStack, detectTestSetup } from '../core/stack.js';
import { readTemplate } from '../core/templates.js';
import { packageVersion } from '../core/version.js';
const STACKS = [
    { value: 'nextjs', name: 'Next.js / React' },
    { value: 'node-api', name: 'Node API' },
    { value: 'flutter', name: 'Flutter / Dart' },
    { value: 'go', name: 'Go' },
    { value: 'python', name: 'Python' },
    { value: 'other', name: 'Other' },
];
const TOOLS = [
    { value: 'claude', name: 'Claude Code' },
    { value: 'antigravity', name: 'Antigravity' },
    { value: 'codex', name: 'ChatGPT (Codex)' },
];
const DOCS = [
    { key: 'architecture', label: 'Architecture docs', template: 'architecture' },
    { key: 'products', label: 'Product docs', template: 'products' },
    { key: 'designSystem', label: 'Design system', template: 'design-system' },
];
const SPECS_DIR = 'docs/specs/';
/** Forward slashes; folders keep their trailing "/". */
function normalizePath(p) {
    return p.trim().split('\\').join('/').replace(/^\.\//, '');
}
/** Creates a doc location that does not exist yet: a folder with a README, or a single Markdown file. */
function createDoc(root, path, template) {
    const abs = join(root, path);
    if (existsSync(abs))
        return false;
    const content = readTemplate(`docs-readme/${template}.md`);
    if (path.endsWith('/')) {
        mkdirSync(abs, { recursive: true });
        writeFileSync(join(abs, 'README.md'), content);
    }
    else {
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, content);
    }
    return true;
}
function enclosingProject(root) {
    const parent = dirname(resolve(root));
    if (parent === resolve(root))
        return null;
    try {
        return findRoot(parent);
    }
    catch {
        return null;
    }
}
export async function init(ctx, opts) {
    const root = ctx.cwd;
    if (existsSync(configPath(root)))
        throw new DnwError('This project is already initialized', 'dnw upgrade');
    const outer = enclosingProject(root);
    if (outer)
        throw new DnwError(`This folder is inside the dnw project at ${outer}`, `run dnw from anywhere in ${outer}`);
    const detected = detectStack(root);
    const stack = opts.stack ?? (opts.yes ? detected : await ctx.select('Tech stack?', STACKS, detected));
    const rec = detectTestSetup(root, stack);
    if (rec.framework)
        ctx.out(`Test framework: ${rec.framework}\n`);
    if (opts.yes && stack === 'other' && !(opts.testCommand && opts.testFileCommand)) {
        throw new DnwError('Stack "other" needs --test-command and --test-file-command');
    }
    const testCommand = opts.testCommand ?? (opts.yes ? rec.testCommand : await ctx.input('Full test suite command:', rec.testCommand));
    const testFileCommand = opts.testFileCommand ??
        (opts.yes ? rec.testFileCommand : await ctx.input('Single test command ({file} = test path, {dir} = its folder):', rec.testFileCommand));
    const found = detectDocs(root);
    const docs = { ...DEFAULT_DOCS };
    for (const d of DOCS) {
        const guess = found[d.key] ?? DEFAULT_DOCS[d.key];
        const answer = opts.yes ? guess : await ctx.input(`${d.label} (a file, or a folder ending in /):`, guess);
        docs[d.key] = normalizePath(answer) || guess;
    }
    const existingTools = detectAiTools(root);
    const aiTools = opts.ai ??
        (opts.yes
            ? existingTools
            : await ctx.checkbox('Which AI tools does the team use? (none is fine)', TOOLS.map((t) => ({ ...t, checked: existingTools.includes(t.value) }))));
    const superpowers = aiTools.length > 0 &&
        (opts.superpowers ?? (opts.yes ? true : await ctx.confirm('Install superpowers (brainstorming, TDD, debugging skills)?')));
    const created = [];
    for (const d of DOCS)
        if (createDoc(root, docs[d.key], d.template))
            created.push(docs[d.key]);
    if (createDoc(root, SPECS_DIR, 'specs'))
        created.push(SPECS_DIR);
    const cfg = {
        toolVersion: packageVersion(),
        stack,
        testCommand,
        testFileCommand,
        aiTools,
        superpowers,
        docs,
        command: detectDnwCommand(root),
    };
    writeConfig(root, cfg);
    const result = writeManagedFiles(root, adapterFiles(cfg), null, cfg.toolVersion);
    writeManifest(root, result.manifest);
    ctx.out(`✓ Initialized dnw ${cfg.toolVersion}\n`);
    const mapped = DOCS.filter((d) => !created.includes(docs[d.key])).map((d) => `${d.label}: ${docs[d.key]} (existing)`);
    for (const line of mapped)
        ctx.out(`  ${line}\n`);
    for (const p of [...created, '.dnw/config.json', ...result.written])
        ctx.out(`  ${p}\n`);
    for (const line of managedWarnings(result))
        ctx.out(`${line}\n`);
    if (superpowers && result.written.includes('.claude/settings.json')) {
        ctx.out('✓ superpowers enabled in .claude/settings.json (teammates are prompted to install it)\n');
    }
    for (const step of superpowersSteps(cfg)) {
        if (step.manual) {
            ctx.out(`Codex: ${step.manual}\n`);
            continue;
        }
        const cmd = step.command;
        const hasAgy = ctx.run('agy --version', root).exitCode === 0;
        if (hasAgy && (opts.yes || (await ctx.confirm(`Run: ${cmd}?`)))) {
            const r = ctx.run(cmd, root);
            ctx.out(r.exitCode === 0 ? '✓ superpowers installed for Antigravity\n' : `⚠ Failed; run manually: ${cmd}\n`);
        }
        else {
            ctx.out(`Run: ${cmd}\n`);
        }
    }
    ctx.out('Next: dnw spec new "<title>" --type api\n');
}
