import { installCommand, installSource } from '../../src/core/version.js';

test('installs come from the GitHub repo in package.json', () =>
  expect(installSource()).toBe('github:DevNickole/DevNickole-AI-Workflow'));

test('global install for projects that run plain dnw', () =>
  expect(installCommand('dnw')).toBe('npm i -g github:DevNickole/DevNickole-AI-Workflow'));

test('dev dependency for projects that run dnw through npx', () =>
  expect(installCommand('npx --no-install dnw')).toBe('npm i -D github:DevNickole/DevNickole-AI-Workflow'));
