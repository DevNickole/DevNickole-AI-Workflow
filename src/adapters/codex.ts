import type { DnwConfig } from '../core/config.js';
import type { AdapterFile } from './index.js';
import { renderInstructions } from './instructions.js';

export function codexFiles(cfg: DnwConfig): AdapterFile[] {
  return [{ path: 'AGENTS.md', content: renderInstructions(cfg), mode: 'marker' }];
}
