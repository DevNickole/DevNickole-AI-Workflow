import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { dnwCommand, docsPaths, type DnwConfig } from './config.js';
import { commandName } from './detect.js';
import { DOC_KINDS, docFile, fillHints } from './docs.js';

const MANIFESTS = ['package.json', 'composer.json', 'pubspec.yaml', 'go.mod', 'pyproject.toml', 'requirements.txt', 'Cargo.toml', 'Gemfile'];
const AI_FILES = ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md', '.cursorrules', '.github/copilot-instructions.md'];
/** Top-level folders that are dependencies, build output or tooling rather than the team's code. */
const NOT_SOURCE = new Set(['node_modules', 'vendor', 'build', 'dist', 'out', 'coverage', 'target', 'docs', 'storage', 'bootstrap']);

function sourceFolders(root: string): string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !NOT_SOURCE.has(e.name))
    .map((e) => `${e.name}/`)
    .sort();
}

function describeDoc(root: string, kind: string, path: string): string {
  const file = docFile(path);
  if (existsSync(join(root, file))) {
    const left = fillHints(readFileSync(join(root, file), 'utf8'));
    if (left > 0) {
      return `${file} (template, ${left} section${left === 1 ? '' : 's'} to fill): draft every section from what the code shows.`;
    }
    return `${file} (existing doc): read it and propose additions for anything the code shows that it misses. Do not rewrite it; ask before editing.`;
  }
  if (existsSync(join(root, path)) && statSync(join(root, path)).isDirectory()) {
    return `${path} (existing folder): read it; it is the source of truth for this doc.`;
  }
  return `${path} is missing: run dnw docs add ${kind}, then draft it from the code.`;
}

/** Step-by-step onboarding instructions for an AI agent, tailored to what this project contains. */
export function onboardingChecklist(root: string, cfg: DnwConfig): string {
  const dnw = dnwCommand(cfg);
  const docs = docsPaths(cfg);
  const has = (p: string) => existsSync(join(root, p));
  const lines: string[] = [
    `dnw onboarding for ${basename(root)}`,
    '',
    'Goal: give every future spec real context. Work through these steps with the user.',
    '',
    '1. Read the project',
  ];
  const manifests = MANIFESTS.filter(has);
  if (manifests.length) lines.push(`   - Manifests: ${manifests.join(', ')}`);
  const folders = sourceFolders(root);
  if (folders.length) lines.push(`   - Source folders: ${folders.join(', ')} (entry points, routes, models or migrations, components, theme)`);
  const ai = AI_FILES.filter(has);
  if (ai.length) lines.push(`   - Existing AI instructions: ${ai.join(', ')}`);

  lines.push('', '2. Write the project docs');
  for (const d of DOC_KINDS) lines.push(`   - ${describeDoc(root, d.kind, docs[d.key])}`);
  lines.push(
    '   - Only ask the user about what the code cannot tell you: vision, users, goals, and why decisions were made.',
    '     Ask one question at a time, write the answer in, and delete each <!-- fill: --> hint once its section is done.',
  );

  const wf = cfg.existingWorkflow;
  if (wf) {
    const names = [...wf.commands.map(commandName), ...wf.taskDirs].join(', ');
    lines.push('', '3. Existing workflow');
    if (wf.mode === 'alongside') {
      lines.push(
        `   - Kept alongside dnw: ${names}.`,
        '   - Read the task docs for history and context. Plan new work as dnw specs.',
      );
    } else {
      for (const dir of wf.taskDirs) {
        lines.push(
          `   - Convert open tasks in ${dir} into dnw draft specs. For each task doc that is not done:`,
          `     run ${dnw} spec new "<title>" --type api|ui, fill the spec from the task doc,`,
          '     then add this line at the top of the old file: > Migrated to dnw spec <ref>',
        );
      }
      lines.push(
        '   - Never delete the old files. Ask the user when a task is unclear: still open or done, api or ui.',
      );
      if (wf.commands.length) lines.push(`   - Commands kept as they are: ${wf.commands.map(commandName).join(', ')}.`);
    }
  }

  lines.push('', `${wf ? 4 : 3}. Finish`, `   - Summarize what you wrote and what is still open, then run: ${dnw} onboard --done`, '');
  return lines.join('\n');
}
