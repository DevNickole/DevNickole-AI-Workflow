import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { StackId } from './config.js';

export interface Recommendation {
  framework: string;
  testCommand: string;
  testFileCommand: string;
}

const RECOMMENDATIONS: Record<StackId, Recommendation> = {
  nextjs: { framework: 'Vitest + Playwright', testCommand: 'npm test', testFileCommand: 'npx vitest run {file}' },
  'node-api': { framework: 'Vitest', testCommand: 'npm test', testFileCommand: 'npx vitest run {file}' },
  go: { framework: 'go test', testCommand: 'go test ./...', testFileCommand: 'go test ./{dir}' },
  python: { framework: 'pytest', testCommand: 'pytest', testFileCommand: 'pytest {file}' },
  other: { framework: '', testCommand: '', testFileCommand: '' },
};

export function recommend(stack: StackId): Recommendation {
  return { ...RECOMMENDATIONS[stack] };
}

export function detectStack(root: string): StackId {
  const pkgPath = join(root, 'package.json');
  if (existsSync(pkgPath)) {
    let deps: Record<string, unknown> = {};
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      deps = { ...pkg.dependencies, ...pkg.devDependencies };
    } catch {
      // unreadable package.json still means a Node project
    }
    return 'next' in deps || 'react' in deps ? 'nextjs' : 'node-api';
  }
  if (existsSync(join(root, 'go.mod'))) return 'go';
  if (existsSync(join(root, 'pyproject.toml')) || existsSync(join(root, 'requirements.txt'))) return 'python';
  return 'other';
}
