import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DnwError } from './errors.js';

export type StackId = 'nextjs' | 'node-api' | 'go' | 'python' | 'other';
export type AiTool = 'claude' | 'codex' | 'antigravity';

export interface DnwConfig {
  toolVersion: string;
  stack: StackId;
  testCommand: string;
  testFileCommand: string;
  aiTools: AiTool[];
  superpowers: boolean;
}

export function configPath(root: string): string {
  return join(root, '.dnw', 'config.json');
}

export function readConfig(root: string): DnwConfig {
  const path = configPath(root);
  if (!existsSync(path)) throw new DnwError('No .dnw/config.json in this project', 'dnw init');
  return JSON.parse(readFileSync(path, 'utf8')) as DnwConfig;
}

export function writeConfig(root: string, cfg: DnwConfig): void {
  mkdirSync(join(root, '.dnw'), { recursive: true });
  writeFileSync(configPath(root), JSON.stringify(cfg, null, 2) + '\n');
}
