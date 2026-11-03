import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpProject } from '../helpers.js';
import { detectStack, recommend } from '../../src/core/stack.js';

const withFile = (name: string, content = '') => {
  const root = tmpProject();
  writeFileSync(join(root, name), content);
  return root;
};

test('detects nextjs from react/next deps', () => {
  expect(detectStack(withFile('package.json', JSON.stringify({ dependencies: { next: '15' } })))).toBe('nextjs');
  expect(detectStack(withFile('package.json', JSON.stringify({ devDependencies: { react: '19' } })))).toBe('nextjs');
});
test('detects node-api from other package.json', () =>
  expect(detectStack(withFile('package.json', JSON.stringify({ dependencies: { express: '5' } })))).toBe('node-api'));
test('detects go', () => expect(detectStack(withFile('go.mod', 'module x'))).toBe('go'));
test('detects python', () => {
  expect(detectStack(withFile('pyproject.toml'))).toBe('python');
  expect(detectStack(withFile('requirements.txt'))).toBe('python');
});
test('falls back to other', () => expect(detectStack(tmpProject())).toBe('other'));

test('recommendations match spec', () => {
  expect(recommend('nextjs')).toEqual({ framework: 'Vitest + Playwright', testCommand: 'npm test', testFileCommand: 'npx vitest run {file}' });
  expect(recommend('node-api')).toEqual({ framework: 'Vitest', testCommand: 'npm test', testFileCommand: 'npx vitest run {file}' });
  expect(recommend('go')).toEqual({ framework: 'go test', testCommand: 'go test ./...', testFileCommand: 'go test ./{dir}' });
  expect(recommend('python')).toEqual({ framework: 'pytest', testCommand: 'pytest', testFileCommand: 'pytest {file}' });
  expect(recommend('other')).toEqual({ framework: '', testCommand: '', testFileCommand: '' });
});
