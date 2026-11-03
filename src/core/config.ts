import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DnwError } from './errors.js';

export type StackId = 'nextjs' | 'node-api' | 'laravel' | 'php' | 'flutter' | 'go' | 'python' | 'other';
export type AiTool = 'claude' | 'codex' | 'antigravity';
export type DocKey = 'architecture' | 'products' | 'designSystem';

/** Where the project keeps each kind of context doc. A path ending in "/" is a folder. */
export type DocsPaths = Record<DocKey, string>;

export interface DnwConfig {
  toolVersion: string;
  stack: StackId;
  testCommand: string;
  testFileCommand: string;
  aiTools: AiTool[];
  superpowers: boolean;
  /** absent in configs written before dnw adopted existing docs */
  docs?: DocsPaths;
  /** how generated instructions invoke dnw; absent in older configs */
  command?: string;
  /** a workflow the project had before dnw, and how dnw treats it */
  existingWorkflow?: ExistingWorkflow;
  /** false until the AI onboarding is done; absent in older configs, which are not reminded */
  onboarded?: boolean;
}

export interface ExistingWorkflow {
  /** alongside: both stay in use; convert: open tasks become dnw draft specs during onboarding */
  mode: 'alongside' | 'convert';
  /** custom AI command files, e.g. .claude/commands/dm.md */
  commands: string[];
  /** folders of task or plan docs, e.g. docs/tasks/ */
  taskDirs: string[];
}

export const DEFAULT_DOCS: DocsPaths = {
  architecture: 'docs/architecture/',
  products: 'docs/products/',
  designSystem: 'docs/design-system/',
};

export const DEFAULT_COMMAND = 'npx --no-install dnw';

export function docsPaths(cfg: DnwConfig): DocsPaths {
  return { ...DEFAULT_DOCS, ...cfg.docs };
}

export function dnwCommand(cfg: DnwConfig): string {
  return cfg.command ?? DEFAULT_COMMAND;
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
