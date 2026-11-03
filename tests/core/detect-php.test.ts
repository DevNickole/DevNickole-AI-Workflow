import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpProject } from '../helpers.js';
import { detectStack, detectTestSetup, recommend } from '../../src/core/stack.js';
import { detectDocs } from '../../src/core/detect.js';

function project(files: Record<string, string>): string {
  const root = tmpProject();
  for (const [path, content] of Object.entries(files)) {
    const abs = join(root, path);
    mkdirSync(path.endsWith('/') ? abs : dirname(abs), { recursive: true });
    if (!path.endsWith('/')) writeFileSync(abs, content);
  }
  return root;
}

const composer = (requireDev: Record<string, string> = {}, require: Record<string, string> = {}) =>
  JSON.stringify({ require, 'require-dev': requireDev });
// Laravel ships a package.json for Vite; with React/Inertia it must not be mistaken for Next.js
const VITE_REACT = JSON.stringify({ devDependencies: { vite: '^6', 'laravel-vite-plugin': '^1', react: '^19' } });

describe('Laravel', () => {
  test('artisan + composer.json is laravel, even with a React package.json', () =>
    expect(detectStack(project({ artisan: '', 'composer.json': composer(), 'package.json': VITE_REACT }))).toBe('laravel'));

  test('laravel/framework in composer.json is laravel without artisan', () =>
    expect(detectStack(project({ 'composer.json': composer({}, { 'laravel/framework': '^12.0' }) }))).toBe('laravel'));

  test('Pest runs through artisan', () =>
    expect(detectTestSetup(project({ artisan: '', 'composer.json': composer({ 'pestphp/pest': '^3.0' }) }), 'laravel')).toEqual({
      framework: 'Pest',
      testCommand: 'php artisan test',
      testFileCommand: 'php artisan test {file}',
    }));

  test('PHPUnit runs through artisan', () =>
    expect(detectTestSetup(project({ artisan: '', 'composer.json': composer({ 'phpunit/phpunit': '^11.0' }) }), 'laravel')).toEqual({
      framework: 'PHPUnit',
      testCommand: 'php artisan test',
      testFileCommand: 'php artisan test {file}',
    }));

  test('recommendation without composer.json', () =>
    expect(recommend('laravel')).toEqual({ framework: 'PHPUnit', testCommand: 'php artisan test', testFileCommand: 'php artisan test {file}' }));
});

describe('plain PHP', () => {
  test('composer.json without Laravel is php', () =>
    expect(detectStack(project({ 'composer.json': composer({ 'phpunit/phpunit': '^11.0' }) }))).toBe('php'));

  test('Pest', () =>
    expect(detectTestSetup(project({ 'composer.json': composer({ 'pestphp/pest': '^3.0' }) }), 'php')).toEqual({
      framework: 'Pest',
      testCommand: 'php vendor/bin/pest',
      testFileCommand: 'php vendor/bin/pest {file}',
    }));

  test('PHPUnit', () =>
    expect(detectTestSetup(project({ 'composer.json': composer({ 'phpunit/phpunit': '^11.0' }) }), 'php')).toEqual({
      framework: 'PHPUnit',
      testCommand: 'php vendor/bin/phpunit',
      testFileCommand: 'php vendor/bin/phpunit {file}',
    }));
});

describe('Laravel design system folders', () => {
  test('React/Vue starter kit components', () =>
    expect(detectDocs(project({ 'resources/js/components/': '' })).designSystem).toBe('resources/js/components/'));
  test('Breeze-style Components', () =>
    expect(detectDocs(project({ 'resources/js/Components/': '' })).designSystem).toMatch(/^resources\/js\/[Cc]omponents\/$/));
  test('Blade components', () =>
    expect(detectDocs(project({ 'resources/views/components/': '' })).designSystem).toBe('resources/views/components/'));
});
