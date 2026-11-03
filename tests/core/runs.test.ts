import { tmpProject } from '../helpers.js';
import { readRuns, recordRun, runKey } from '../../src/core/runs.js';
import { renderFileCommand } from '../../src/core/test-runner.js';

test('renders {file} with posix slashes', () =>
  expect(renderFileCommand('npx vitest run {file}', 'tests\\auth\\login.test.ts')).toBe('npx vitest run tests/auth/login.test.ts'));

test('renders {dir}', () => expect(renderFileCommand('go test ./{dir}', 'pkg/auth/login_test.go')).toBe('go test ./pkg/auth'));

test('runs evidence round-trips', () => {
  const root = tmpProject();
  expect(readRuns(root)).toEqual({});
  recordRun(root, runKey('0001.api', 'T1'), 'red', 1, '2026-01-01T00:00:00.000Z');
  recordRun(root, runKey('0001.api', 'T1'), 'green', 0, '2026-01-02T00:00:00.000Z');
  expect(readRuns(root)).toEqual({
    '0001.api/T1': {
      red: { at: '2026-01-01T00:00:00.000Z', exitCode: 1 },
      green: { at: '2026-01-02T00:00:00.000Z', exitCode: 0 },
    },
  });
});
