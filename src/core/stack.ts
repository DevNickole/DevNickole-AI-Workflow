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
  flutter: { framework: 'flutter_test', testCommand: 'flutter test', testFileCommand: 'flutter test {file}' },
  go: { framework: 'go test', testCommand: 'go test ./...', testFileCommand: 'go test ./{dir}' },
  python: { framework: 'pytest', testCommand: 'pytest', testFileCommand: 'pytest {file}' },
  other: { framework: '', testCommand: '', testFileCommand: '' },
};

/** Recommendation for a project with no test setup yet. */
export function recommend(stack: StackId): Recommendation {
  return { ...RECOMMENDATIONS[stack] };
}

interface PackageJson {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export function readPackageJson(root: string): PackageJson | null {
  const path = join(root, 'package.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as PackageJson;
  } catch {
    // unreadable package.json still means a Node project
    return {};
  }
}

export function detectStack(root: string): StackId {
  // before package.json: Flutter repos often carry one for tooling such as `npx supabase`
  if (existsSync(join(root, 'pubspec.yaml'))) return 'flutter';
  const pkg = readPackageJson(root);
  if (pkg) {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    return 'next' in deps || 'react' in deps ? 'nextjs' : 'node-api';
  }
  if (existsSync(join(root, 'go.mod'))) return 'go';
  if (existsSync(join(root, 'pyproject.toml')) || existsSync(join(root, 'requirements.txt'))) return 'python';
  return 'other';
}

function packageManager(root: string): string {
  if (existsSync(join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(root, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(root, 'bun.lock')) || existsSync(join(root, 'bun.lockb'))) return 'bun';
  return 'npm';
}

const RUNNERS: { match: RegExp; framework: string; fileCommand: string }[] = [
  { match: /\bvitest\b/, framework: 'Vitest', fileCommand: 'npx vitest run {file}' },
  { match: /\bjest\b/, framework: 'Jest', fileCommand: 'npx jest {file}' },
  { match: /\bmocha\b/, framework: 'Mocha', fileCommand: 'npx mocha {file}' },
];

/** Test commands for this project: its existing setup when it has one, otherwise the stack's recommendation. */
export function detectTestSetup(root: string, stack: StackId): Recommendation {
  if (stack !== 'nextjs' && stack !== 'node-api') return recommend(stack);
  const pm = packageManager(root);
  const script = readPackageJson(root)?.scripts?.test;
  if (script === undefined || /no test specified/.test(script)) return { ...recommend(stack), testCommand: `${pm} test` };
  const runner = RUNNERS.find((r) => r.match.test(script));
  if (!runner) return { framework: 'existing test script', testCommand: `${pm} test`, testFileCommand: `${pm} test -- {file}` };
  return { framework: `${runner.framework} (existing)`, testCommand: `${pm} test`, testFileCommand: runner.fileCommand };
}
