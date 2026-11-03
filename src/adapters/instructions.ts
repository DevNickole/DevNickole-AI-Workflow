import { dnwCommand, docsPaths, type DnwConfig, type ExistingWorkflow } from '../core/config.js';
import { commandName } from '../core/detect.js';
import { readTemplate, render } from '../core/templates.js';

/** Tells the AI about a workflow the project had before dnw, so it knows when to use which. */
function workflowSection(wf: ExistingWorkflow | undefined): string {
  if (!wf) return '';
  const lines = ['', '## Existing workflow', ''];
  if (wf.commands.length) lines.push(`This project also has its own commands: ${wf.commands.map((c) => `\`${commandName(c)}\``).join(', ')}.`);
  if (wf.taskDirs.length) {
    const dirs = wf.taskDirs.map((d) => `\`${d}\``).join(', ');
    lines.push(
      wf.mode === 'convert'
        ? `Open tasks in ${dirs} are being converted into dnw specs during onboarding; migrated files say so at the top.`
        : `Task docs from before dnw live in ${dirs}. Read them for history and context.`,
    );
  }
  lines.push(
    'Plan and track new work as dnw specs in `docs/specs/`. If the user asks for one of the existing commands, follow it,',
    'but spec and task status still change only through `dnw` commands.',
    '',
  );
  return lines.join('\n');
}

export function renderInstructions(cfg: DnwConfig): string {
  const docs = docsPaths(cfg);
  return render(readTemplate('instructions.md'), {
    dnw: dnwCommand(cfg),
    architecture: docs.architecture,
    products: docs.products,
    designSystem: docs.designSystem,
    testCommand: cfg.testCommand,
    testFileCommand: cfg.testFileCommand,
    workflowSection: workflowSection(cfg.existingWorkflow),
    superpowersSection: cfg.superpowers ? readTemplate('superpowers.md') : '',
  }).trimEnd() + '\n';
}
