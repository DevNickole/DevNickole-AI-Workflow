import type { DnwConfig } from '../core/config.js';
import { readTemplate, render } from '../core/templates.js';

export function renderInstructions(cfg: DnwConfig): string {
  return render(readTemplate('instructions.md'), {
    testCommand: cfg.testCommand,
    testFileCommand: cfg.testFileCommand,
    superpowersSection: cfg.superpowers ? readTemplate('superpowers.md') : '',
  }).trimEnd() + '\n';
}
