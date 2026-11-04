import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { adapterFiles, superpowersSteps } from '../adapters/index.js';
import {
  configPath,
  DEFAULT_DOCS,
  writeConfig,
  type AiTool,
  type DnwConfig,
  type DocsPaths,
  type ExistingWorkflow,
  type StackId,
} from '../core/config.js';
import { findRoot, type Ctx } from '../core/context.js';
import { commandName, detectAiTools, detectDnwCommand, detectDocs, detectExistingWorkflow, type DetectedWorkflow } from '../core/detect.js';
import { createDoc, DOC_KINDS } from '../core/docs.js';
import { DnwError } from '../core/errors.js';
import { managedWarnings, writeManagedFiles, writeManifest } from '../core/manifest.js';
import { detectStack, detectTestSetup, type Recommendation } from '../core/stack.js';
import { skillWarnings, syncSkills } from '../core/skills.js';
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
  { value: 'laravel', name: 'Laravel' },
  { value: 'php', name: 'PHP (other)' },
  { value: 'flutter', name: 'Flutter / Dart' },
  { value: 'go', name: 'Go' },
  { value: 'python', name: 'Python' },
  { value: 'other', name: 'Other' },
];

const TOOLS: { value: AiTool; name: string }[] = [
  { value: 'claude', name: 'Claude Code' },
  { value: 'antigravity', name: 'Antigravity' },
  { value: 'codex', name: 'ChatGPT (Codex)' },
];

const DOCS = DOC_KINDS;

const SPECS_DIR = 'docs/specs/';

/** Forward slashes; folders keep their trailing "/". */
function normalizePath(p: string): string {
  return p.trim().split('\\').join('/').replace(/^\.\//, '');
}

interface Found {
  stack: StackId;
  tests: Recommendation;
  docs: DocsPaths;
  tools: AiTool[];
  workflow: DetectedWorkflow;
}

const DOC_SHORT: Record<string, string> = { architecture: 'architecture', products: 'products', designSystem: 'design system' };

function printSummary(ctx: Ctx, root: string, f: Found): void {
  const row = (label: string, value: string) => ctx.out(`  ${label.padEnd(15)}${value}\n`);
  ctx.out('Found in this project:\n');
  const tests = f.tests.testFileCommand ? `${f.tests.testFileCommand}${f.tests.framework ? ` (${f.tests.framework})` : ''}` : 'not detected';
  row('Stack', `${f.stack} · tests: ${tests}`);
  DOCS.forEach((d, i) => {
    const path = f.docs[d.key];
    const state = existsSync(join(root, path)) ? 'existing' : 'new';
    row(i === 0 ? 'Docs' : '', `${DOC_SHORT[d.key].padEnd(14)}→ ${path} (${state})`);
  });
  row('AI tools', f.tools.length ? f.tools.map((t) => TOOLS.find((x) => x.value === t)!.name).join(', ') : 'none found');
  const { commands, taskDirs } = f.workflow;
  if (commands.length || taskDirs.length) {
    const parts: string[] = [];
    if (commands.length) parts.push(`commands: ${commands.map(commandName).join(', ')}`);
    if (taskDirs.length) parts.push(`task docs: ${taskDirs.map((t) => `${t.path} (${t.files} file${t.files === 1 ? '' : 's'})`).join(', ')}`);
    row('Workflow', parts.join(' · '));
  }
}

function enclosingProject(root: string): string | null {
  const parent = dirname(resolve(root));
  if (parent === resolve(root)) return null;
  try {
    return findRoot(parent);
  } catch {
    return null;
  }
}

export async function init(ctx: Ctx, opts: InitOptions): Promise<void> {
  const root = ctx.cwd;
  if (existsSync(configPath(root))) throw new DnwError('This project is already initialized', 'dnw upgrade');
  const outer = enclosingProject(root);
  if (outer) throw new DnwError(`This folder is inside the dnw project at ${outer}`, `run dnw from anywhere in ${outer}`);

  // read the whole project first, so the user sees everything before answering anything
  const found: Found = {
    stack: opts.stack ?? detectStack(root),
    tests: { framework: '', testCommand: '', testFileCommand: '' },
    docs: { ...DEFAULT_DOCS },
    tools: detectAiTools(root),
    workflow: detectExistingWorkflow(root),
  };
  found.tests = detectTestSetup(root, found.stack);
  const foundDocs = detectDocs(root);
  for (const d of DOCS) found.docs[d.key] = foundDocs[d.key] ?? DEFAULT_DOCS[d.key];
  printSummary(ctx, root, found);

  const testsKnown = Boolean(found.tests.testCommand && found.tests.testFileCommand);
  // accepting the summary skips the per-setting questions; without test commands there is nothing to accept
  const accept = opts.yes || (testsKnown && (await ctx.confirm('Use these settings?')));

  const stack = opts.stack ?? (accept ? found.stack : await ctx.select('Tech stack?', STACKS, found.stack));
  const rec = stack === found.stack ? found.tests : detectTestSetup(root, stack);
  if (rec.framework) ctx.out(`Test framework: ${rec.framework}\n`);
  if (opts.yes && stack === 'other' && !(opts.testCommand && opts.testFileCommand)) {
    throw new DnwError('Stack "other" needs --test-command and --test-file-command');
  }
  const testCommand = opts.testCommand ?? (accept ? rec.testCommand : await ctx.input('Full test suite command:', rec.testCommand));
  const testFileCommand =
    opts.testFileCommand ??
    (accept ? rec.testFileCommand : await ctx.input('Single test command ({file} = test path, {dir} = its folder):', rec.testFileCommand));

  const docs = { ...DEFAULT_DOCS } as DocsPaths;
  for (const d of DOCS) {
    const guess = found.docs[d.key];
    const answer = accept ? guess : await ctx.input(`${d.label} (a file, or a folder ending in /):`, guess);
    docs[d.key] = normalizePath(answer) || guess;
  }

  const aiTools =
    opts.ai ??
    (accept
      ? found.tools
      : await ctx.checkbox(
          'Which AI tools does the team use? (none is fine)',
          TOOLS.map((t) => ({ ...t, checked: found.tools.includes(t.value) })),
        ));

  const { commands, taskDirs } = found.workflow;
  let existingWorkflow: ExistingWorkflow | undefined;
  if (commands.length || taskDirs.length) {
    const names = [...commands.map(commandName), ...taskDirs.map((t) => t.path)].join(', ');
    const mode = opts.yes
      ? 'alongside'
      : await ctx.select<ExistingWorkflow['mode']>(
          `How should dnw treat ${names}?`,
          [
            { value: 'alongside', name: 'Keep it alongside dnw (the AI is told about both)' },
            { value: 'convert', name: 'Convert open tasks into dnw draft specs during onboarding' },
          ],
          'alongside',
        );
    existingWorkflow = { mode, commands, taskDirs: taskDirs.map((t) => t.path) };
  }

  const superpowers =
    aiTools.length > 0 &&
    (opts.superpowers ?? (opts.yes ? true : await ctx.confirm('Install superpowers (brainstorming, TDD, debugging skills)?')));

  const created: string[] = [];
  for (const d of DOCS) if (createDoc(root, docs[d.key], d.kind)) created.push(docs[d.key]);
  if (createDoc(root, SPECS_DIR, 'specs')) created.push(SPECS_DIR);

  const cfg: DnwConfig = {
    toolVersion: packageVersion(),
    stack,
    testCommand,
    testFileCommand,
    aiTools,
    superpowers,
    docs,
    command: detectDnwCommand(root),
    ...(existingWorkflow && { existingWorkflow }),
    onboarded: false,
  };
  writeConfig(root, cfg);
  const result = writeManagedFiles(root, adapterFiles(cfg), null, cfg.toolVersion);
  writeManifest(root, result.manifest);
  const skills = syncSkills(root, cfg);

  ctx.out(`✓ Initialized dnw ${cfg.toolVersion}\n`);
  const mapped = DOCS.filter((d) => !created.includes(docs[d.key])).map((d) => `${d.label}: ${docs[d.key]} (existing)`);
  for (const line of mapped) ctx.out(`  ${line}\n`);
  for (const p of [...created, '.dnw/config.json', ...result.written, ...skills.written]) ctx.out(`  ${p}\n`);
  for (const line of [...managedWarnings(result), ...skillWarnings(skills)]) ctx.out(`${line}\n`);

  if (superpowers && result.written.includes('.claude/settings.json')) {
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
