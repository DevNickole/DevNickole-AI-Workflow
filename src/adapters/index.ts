import type { AiTool, DnwConfig } from '../core/config.js';
import { antigravityFiles } from './antigravity.js';
import { claudeFiles } from './claude.js';
import { codexFiles } from './codex.js';

export interface AdapterFile {
  path: string;
  content: string;
  /** whole: dnw owns the file; marker: dnw owns a marked block; json-merge: content is a JSON patch merged into the file */
  mode: 'whole' | 'marker' | 'json-merge';
}

export interface SuperpowersStep {
  tool: AiTool;
  command?: string;
  manual?: string;
}

const ADAPTERS: Record<AiTool, (cfg: DnwConfig) => AdapterFile[]> = {
  claude: claudeFiles,
  codex: codexFiles,
  antigravity: antigravityFiles,
};

export function adapterFiles(cfg: DnwConfig): AdapterFile[] {
  const byPath = new Map<string, AdapterFile>();
  for (const tool of cfg.aiTools) {
    for (const f of ADAPTERS[tool](cfg)) byPath.set(f.path, f);
  }
  return [...byPath.values()];
}

export function superpowersSteps(cfg: DnwConfig): SuperpowersStep[] {
  if (!cfg.superpowers) return [];
  const steps: SuperpowersStep[] = [];
  if (cfg.aiTools.includes('antigravity')) {
    steps.push({ tool: 'antigravity', command: 'agy plugin install https://github.com/obra/superpowers' });
  }
  if (cfg.aiTools.includes('codex')) {
    steps.push({ tool: 'codex', manual: 'In Codex run /plugins, search "superpowers", select Install Plugin.' });
  }
  return steps;
}
