import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import semver from 'semver';
import { adapterFiles } from '../adapters/index.js';
import { readConfig, writeConfig } from '../core/config.js';
import { findRoot, type Ctx } from '../core/context.js';
import { DnwError } from '../core/errors.js';
import { readManifest, writeManagedFiles, writeManifest } from '../core/manifest.js';
import { packageVersion } from '../core/version.js';
import { changelogBetween, migrations as allMigrations, pendingMigrations, type Migration } from '../migrations/index.js';

export interface UpgradeOptions {
  yes?: boolean;
  migrations?: Migration[];
  changelog?: string;
}

function diff(before: string, after: string): string {
  const minus = before.split('\n').map((l) => `  - ${l}`);
  const plus = after.split('\n').map((l) => `  + ${l}`);
  return [...minus, ...plus].join('\n');
}

export async function upgrade(ctx: Ctx, opts: UpgradeOptions): Promise<void> {
  const root = findRoot(ctx.cwd);
  const cfg = readConfig(root);
  const from = cfg.toolVersion;
  const to = packageVersion();
  if (semver.gt(from, to)) {
    throw new DnwError(`Project uses dnw ${from}, newer than installed ${to}`, 'npm i -D dev-nickole-workflow@latest');
  }
  if (from === to) {
    ctx.out(`Already up to date (${to})\n`);
    return;
  }

  const { manifest, conflicts } = writeManagedFiles(root, adapterFiles(cfg), readManifest(root), to);
  for (const p of conflicts) ctx.out(`⚠ ${p} was modified locally; new version written to ${p}.new\n`);

  let reached = from;
  let skipped = false;
  for (const m of pendingMigrations(from, to, opts.migrations ?? allMigrations)) {
    const changes = m.plan(root);
    ctx.out(`Migration ${m.version}: ${m.description}\n`);
    for (const c of changes) ctx.out(`  ${c.file}\n${diff(c.before, c.after)}\n`);
    if (!(opts.yes || (await ctx.confirm('Apply?')))) {
      ctx.out(`Skipped ${m.version}. Run dnw upgrade again to apply it.\n`);
      skipped = true;
      break;
    }
    for (const c of changes) writeFileSync(join(root, c.file), c.after);
    reached = m.version;
  }

  cfg.toolVersion = skipped ? reached : to;
  writeConfig(root, cfg);
  writeManifest(root, manifest);
  ctx.out(`✓ Upgraded ${from} → ${cfg.toolVersion}\n`);

  const changelog = opts.changelog ?? readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf8');
  const notes = changelogBetween(changelog, from, to);
  if (notes) ctx.out(`\n${notes}\n`);
}
