// dnw init on a Laravel project with Pest, Inertia/React and its own AI guidelines.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { testCtx, tmpProject } from '../helpers.js';
import { init } from '../../src/commands/init.js';
import { readConfig } from '../../src/core/config.js';

const LARAVEL: Record<string, string> = {
  artisan: '#!/usr/bin/env php\n',
  'composer.json': JSON.stringify({ require: { 'laravel/framework': '^12.0' }, 'require-dev': { 'pestphp/pest': '^3.0' } }),
  'package.json': JSON.stringify({
    private: true,
    devDependencies: { vite: '^6', 'laravel-vite-plugin': '^1', react: '^19', 'dev-nickole-workflow': 'github:DevNickole/DevNickole-AI-Workflow#v0.1.1' },
  }),
  'resources/js/components/button.tsx': 'export {}\n',
  'tests/Feature/ExampleTest.php': '<?php\n',
  'AGENTS.md': '# Laravel Boost guidelines\n',
};

test('init --yes sets up a Laravel project', async () => {
  const root = tmpProject();
  rmSync(join(root, 'docs'), { recursive: true });
  for (const [p, c] of Object.entries(LARAVEL)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), c);
  }
  const ctx = testCtx({ cwd: root });
  await init(ctx, { yes: true });
  expect(readConfig(root)).toMatchObject({
    stack: 'laravel',
    testCommand: 'php artisan test',
    testFileCommand: 'php artisan test {file}',
    aiTools: ['codex'],
    docs: { designSystem: 'resources/js/components/' },
    command: 'npx --no-install dnw',
  });
  expect(ctx.outText()).toContain('Test framework: Pest');
});
