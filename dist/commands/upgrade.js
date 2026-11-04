import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import semver from 'semver';
import { adapterFiles } from '../adapters/index.js';
import { dnwCommand, readConfig, writeConfig } from '../core/config.js';
import { findRoot } from '../core/context.js';
import { DnwError } from '../core/errors.js';
import { managedWarnings, readManifest, writeManagedFiles, writeManifest } from '../core/manifest.js';
import { skillWarnings, syncSkills } from '../core/skills.js';
import { installCommand, packageVersion } from '../core/version.js';
import { changelogBetween, migrations as allMigrations, pendingMigrations } from '../migrations/index.js';
function diff(before, after) {
    const minus = before.split('\n').map((l) => `  - ${l}`);
    const plus = after.split('\n').map((l) => `  + ${l}`);
    return [...minus, ...plus].join('\n');
}
export async function upgrade(ctx, opts) {
    const root = findRoot(ctx.cwd);
    const cfg = readConfig(root);
    const from = cfg.toolVersion;
    const to = packageVersion();
    if (semver.gt(from, to)) {
        throw new DnwError(`Project uses dnw ${from}, newer than installed ${to}`, installCommand(dnwCommand(cfg), from));
    }
    // managed files are refreshed even when versions match, e.g. after fixing a file dnw could not update
    const result = writeManagedFiles(root, adapterFiles(cfg), readManifest(root), to);
    const { manifest } = result;
    for (const line of [...managedWarnings(result), ...skillWarnings(syncSkills(root, cfg))])
        ctx.out(`${line}\n`);
    if (from === to) {
        writeManifest(root, manifest);
        ctx.out(`Already up to date (${to}); managed files refreshed\n`);
        return;
    }
    let reached = from;
    let skipped = false;
    for (const m of pendingMigrations(from, to, opts.migrations ?? allMigrations)) {
        const changes = m.plan(root);
        ctx.out(`Migration ${m.version}: ${m.description}\n`);
        for (const c of changes)
            ctx.out(`  ${c.file}\n${diff(c.before, c.after)}\n`);
        if (!(opts.yes || (await ctx.confirm('Apply?')))) {
            ctx.out(`Skipped ${m.version}. Run dnw upgrade again to apply it.\n`);
            skipped = true;
            break;
        }
        for (const c of changes)
            writeFileSync(join(root, c.file), c.after);
        reached = m.version;
    }
    cfg.toolVersion = skipped ? reached : to;
    writeConfig(root, cfg);
    writeManifest(root, manifest);
    ctx.out(`✓ Upgraded ${from} → ${cfg.toolVersion}\n`);
    const changelog = opts.changelog ?? readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf8');
    const notes = changelogBetween(changelog, from, to);
    if (notes)
        ctx.out(`\n${notes}\n`);
}
