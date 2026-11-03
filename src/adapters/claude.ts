import type { DnwConfig } from '../core/config.js';
import type { AdapterFile } from './index.js';
import { renderInstructions } from './instructions.js';

const COMMANDS: { name: string; description: string; run: string; then: string }[] = [
  {
    name: 'spec-new',
    description: 'Create a draft dnw spec. Args: "<title>" --type api|ui [--id <id>]',
    run: 'npx dnw spec new $ARGUMENTS',
    then: 'Open the created file and fill every section and the task list, using docs/architecture, docs/products and docs/design-system. Then run /dnw-spec-review.',
  },
  {
    name: 'spec-review',
    description: 'Move a dnw spec from draft to review. Args: <ref>',
    run: 'npx dnw spec review $ARGUMENTS',
    then: 'Tell the user the spec is ready for a human to approve with `dnw spec activate <ref>`. Do not run activate yourself.',
  },
  {
    name: 'task-start',
    description: 'Start a task of an active spec. Args: <ref> <taskId>',
    run: 'npx dnw task start $ARGUMENTS',
    then: "Write the task's test from the spec's acceptance criteria, then run /dnw-task-red.",
  },
  {
    name: 'task-red',
    description: "Record that the task's test fails. Args: <ref> <taskId>",
    run: 'npx dnw task red $ARGUMENTS',
    then: 'Implement the minimum code to make the test pass, then run /dnw-task-done.',
  },
  {
    name: 'task-done',
    description: 'Finish a task: task test and full suite must pass. Args: <ref> <taskId>',
    run: 'npx dnw task done $ARGUMENTS',
    then: 'If it fails, fix the code (not the test) and run it again. If it passes, continue with the next step it prints.',
  },
  {
    name: 'status',
    description: 'Show dnw specs and the next allowed command',
    run: 'npx dnw status',
    then: 'Follow the Next: command for the spec the user is working on.',
  },
];

export function claudeFiles(cfg: DnwConfig): AdapterFile[] {
  const files: AdapterFile[] = [{ path: 'CLAUDE.md', content: renderInstructions(cfg), mode: 'marker' }];
  for (const c of COMMANDS) {
    files.push({
      path: `.claude/commands/dnw-${c.name}.md`,
      mode: 'whole',
      content: `---\ndescription: ${c.description}\n---\nRun \`${c.run}\` and show the output.\n\n${c.then}\n`,
    });
  }
  if (cfg.superpowers) {
    files.push({
      path: '.claude/settings.json',
      mode: 'json-merge',
      content: JSON.stringify({ enabledPlugins: { 'superpowers@claude-plugins-official': true } }),
    });
  }
  return files;
}
