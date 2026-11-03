import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { adapterFiles, superpowersSteps } from '../adapters/index.js';
import { configPath, writeConfig, type AiTool, type DnwConfig, type StackId } from '../core/config.js';
import type { Ctx } from '../core/context.js';
import { DnwError } from '../core/errors.js';
import { writeManagedFiles, writeManifest } from '../core/manifest.js';
import { detectStack, recommend } from '../core/stack.js';
import { readTemplate } from '../core/templates.js';
import { packageVersion } from '../core/version.js';

export interface InitOptions {
  yes?: boolean;
  stack?: StackId;
  ai?: AiTool[];
  superpowers?: boolean;
  testCommand?: string;
  testFileCommand?: string;
}

const STACKS: { value: StackId; name: string }[] = [
  { value: 'nextjs', name: 'Next.js / React' },
  { value: 'node-api', name: 'Node API' },
  { value: 'go', name: 'Go' },
  { value: 'python', name: 'Python' },
  { value: 'other', name: 'Other' },
];

const TOOLS: { value: AiTool; name: string }[] = [
  { value: 'claude', name: 'Claude Code' },
  { value: 'antigravity', name: 'Antigravity' },
  { value: 'codex', name: 'ChatGPT (Codex)' },
];

const DOC_DIRS = ['design-system', 'architecture', 'products', 'specs'];

export async function init(ctx: Ctx, opts: InitOptions): Promise<void> {
  const root = ctx.cwd;
  if (existsSync(configPath(root))) throw new DnwError('This project is already initialized', 'dnw upgrade');

  const detected = detectStack(root);
  const stack = opts.stack ?? (opts.yes ? detected : await ctx.select('Tech stack?', STACKS, detected));
  const rec = recommend(stack);
  if (rec.framework) ctx.out(`Recommended test framework: ${rec.framework}\n`);
  if (opts.yes && stack === 'other' && !(opts.testCommand && opts.testFileCommand)) {
    throw new DnwError('Stack "other" needs --test-command and --test-file-command');
  }
  const testCommand = opts.testCommand ?? (opts.yes ? rec.testCommand : await ctx.input('Full test suite command:', rec.testCommand));
  const testFileCommand =
    opts.testFileCommand ??
    (opts.yes ? rec.testFileCommand : await ctx.input('Single test command ({file} = test path, {dir} = its folder):', rec.testFileCommand));
  const aiTools = opts.ai ?? (opts.yes ? [] : await ctx.checkbox('Which AI tools does the team use? (none is fine)', TOOLS));
  const superpowers =
    aiTools.length > 0 &&
    (opts.superpowers ?? (opts.yes ? true : await ctx.confirm('Install superpowers (brainstorming, TDD, debugging skills)?')));

  const created: string[] = [];
  for (const d of DOC_DIRS) {
    const dir = join(root, 'docs', d);
    if (existsSync(dir)) continue;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'README.md'), readTemplate(`docs-readme/${d}.md`));
    created.push(`docs/${d}/`);
  }

  const cfg: DnwConfig = { toolVersion: packageVersion(), stack, testCommand, testFileCommand, aiTools, superpowers };
  writeConfig(root, cfg);
  const { manifest, written, conflicts } = writeManagedFiles(root, adapterFiles(cfg), null, cfg.toolVersion);
  writeManifest(root, manifest);

  ctx.out(`✓ Initialized dnw ${cfg.toolVersion}\n`);
  for (const p of [...created, '.dnw/config.json', ...written]) ctx.out(`  ${p}\n`);
  for (const p of conflicts) ctx.out(`⚠ ${p} could not be updated; see ${p}.new or fix the file and run dnw upgrade\n`);

  if (superpowers && aiTools.includes('claude')) {
    ctx.out('✓ superpowers enabled in .claude/settings.json (teammates are prompted to install it)\n');
  }
  for (const step of superpowersSteps(cfg)) {
    if (step.manual) {
      ctx.out(`Codex: ${step.manual}\n`);
      continue;
    }
    const cmd = step.command!;
    const hasAgy = ctx.run('agy --version', root).exitCode === 0;
    if (hasAgy && (opts.yes || (await ctx.confirm(`Run: ${cmd}?`)))) {
      const r = ctx.run(cmd, root);
      ctx.out(r.exitCode === 0 ? '✓ superpowers installed for Antigravity\n' : `⚠ Failed; run manually: ${cmd}\n`);
    } else {
      ctx.out(`Run: ${cmd}\n`);
    }
  }
  ctx.out('Next: dnw spec new "<title>" --type api\n');
}
