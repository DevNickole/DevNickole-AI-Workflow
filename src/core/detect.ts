import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { AiTool, DocKey } from './config.js';
import { readPackageJson } from './stack.js';

/** Where existing projects commonly keep each doc, most specific first. Folders end in "/". */
const DOC_CANDIDATES: Record<DocKey, string[]> = {
  architecture: ['docs/architecture/', 'docs/architecture.md', 'docs/ARCHITECTURE.md', 'ARCHITECTURE.md'],
  products: ['docs/products/', 'docs/product/', 'docs/product.md', 'docs/mvp.md', 'docs/prd.md', 'docs/PRD.md', 'PRD.md'],
  designSystem: [
    'docs/design-system/',
    'docs/design-system.md',
    'lib/theme/',
    'src/theme/',
    'src/design-system/',
    'src/components/ui/',
  ],
};

function exists(root: string, candidate: string): boolean {
  const abs = join(root, candidate);
  if (!existsSync(abs)) return false;
  return candidate.endsWith('/') ? statSync(abs).isDirectory() : statSync(abs).isFile();
}

export function detectDocs(root: string): Record<DocKey, string | null> {
  const found = (key: DocKey) => DOC_CANDIDATES[key].find((c) => exists(root, c)) ?? null;
  return { architecture: found('architecture'), products: found('products'), designSystem: found('designSystem') };
}

export function detectAiTools(root: string): AiTool[] {
  const has = (...paths: string[]) => paths.some((p) => existsSync(join(root, p)));
  const tools: AiTool[] = [];
  if (has('CLAUDE.md', '.claude')) tools.push('claude');
  if (has('AGENTS.md')) tools.push('codex');
  if (has('.agents', '.agent', 'GEMINI.md')) tools.push('antigravity');
  return tools;
}

/** `npx --no-install dnw` when the project pins dnw as a dependency, else a global `dnw`. */
export function detectDnwCommand(root: string): string {
  const pkg = readPackageJson(root);
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  return 'dev-nickole-workflow' in deps ? 'npx --no-install dnw' : 'dnw';
}
