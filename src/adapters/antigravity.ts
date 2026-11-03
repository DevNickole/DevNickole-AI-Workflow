import type { DnwConfig } from '../core/config.js';
import type { AdapterFile } from './index.js';
import { renderInstructions } from './instructions.js';

// Antigravity reads workspace rules from .agents/rules/*.md; each needs a `trigger` in frontmatter.
export function antigravityFiles(cfg: DnwConfig): AdapterFile[] {
  const frontmatter = '---\ntrigger: always_on\ndescription: dnw spec-driven + TDD workflow rules for this project\n---\n';
  return [{ path: '.agents/rules/dnw.md', content: frontmatter + renderInstructions(cfg), mode: 'whole' }];
}
