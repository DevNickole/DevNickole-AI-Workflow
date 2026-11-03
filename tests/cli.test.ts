import { main } from '../src/cli.js';

const io = () => {
  const o: string[] = [];
  const e: string[] = [];
  return { o, e, ctx: { out: (s: string) => o.push(s), err: (s: string) => e.push(s) } };
};

test('--version prints package version', async () => {
  const { o, ctx } = io();
  expect(await main(['node', 'dnw', '--version'], ctx as any)).toBe(0);
  expect(o.join('')).toContain('0.1.0');
});

test('unknown command exits non-zero', async () => {
  const { ctx } = io();
  expect(await main(['node', 'dnw', 'nope'], ctx as any)).toBe(1);
});
