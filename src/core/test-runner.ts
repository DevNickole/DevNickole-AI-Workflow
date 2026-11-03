import { posix } from 'node:path';

/** Fills a testFileCommand template: {file} is the test path, {dir} its directory (both with / separators). */
export function renderFileCommand(template: string, testPath: string): string {
  const file = testPath.replace(/\\/g, '/');
  return template.replaceAll('{file}', file).replaceAll('{dir}', posix.dirname(file));
}

/** Last `n` lines of command output, for error messages. */
export function tail(output: string, n = 20): string {
  return output.trimEnd().split(/\r?\n/).slice(-n).join('\n');
}
