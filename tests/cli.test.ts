import { main } from '../src/cli.js';
import { packageVersion } from '../src/core/version.js';

const io = () => {
  const o: string[] = [];
  const e: string[] = [];
  return { o, e, ctx: { out: (s: string) => o.push(s), err: (s: string) => e.push(s) } };
};

test('--version prints package version', async () => {
  const { o, ctx } = io();
  expect(await main(['node', 'dnw', '--version'], ctx as any)).toBe(0);
  expect(o.join('')).toContain(packageVersion());
});

test('unknown command exits non-zero', async () => {
  const { ctx } = io();
  expect(await main(['node', 'dnw', 'nope'], ctx as any)).toBe(1);
});
