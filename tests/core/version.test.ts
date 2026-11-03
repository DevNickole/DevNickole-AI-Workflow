import { installCommand, installSource } from '../../src/core/version.js';

test('installs come from the GitHub repo in package.json', () =>
  expect(installSource()).toBe('github:DevNickole/DevNickole-AI-Workflow'));

// npm 11 links global git installs to a deleted temp clone, so global installs use the tag's tarball
test('global install uses the release tarball', () =>
  expect(installCommand('dnw', '0.2.0')).toBe(
    'npm i -g https://github.com/DevNickole/DevNickole-AI-Workflow/archive/refs/tags/v0.2.0.tar.gz',
  ));

test('dev dependency installs the git tag', () =>
  expect(installCommand('npx --no-install dnw', '0.2.0')).toBe('npm i -D github:DevNickole/DevNickole-AI-Workflow#v0.2.0'));
