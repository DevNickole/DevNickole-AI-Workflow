import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { initProject, testCtx } from '../helpers.js';
import { status } from '../../src/commands/status.js';
import { recordRun } from '../../src/core/runs.js';

function spec(root: string, id: string, type: string, title: string, st: string, tasks: string[] = [], extra: Record<string, string> = {}) {
  const meta = { approvedBy: st === 'active' || st === 'done' ? 'Tester' : 'null', supersededBy: 'null', ...extra };
  writeFileSync(
    join(root, 'docs', 'specs', `${id}-x.${type}.md`),
    `---\nid: "${id}"\ntype: ${type}\ntitle: ${title}\nstatus: ${st}\ndependsOn: null\napprovedBy: ${meta.approvedBy}\nsupersededBy: ${meta.supersededBy}\n---\n## Tasks\n${tasks.join('\n')}\n`,
  );
}

async function run(root: string, cwd = root) {
  const ctx = testCtx({ cwd });
  await status(ctx);
  return ctx.outText();
}

test('shows the next command for every state', async () => {
  const root = initProject();
  spec(root, '0001', 'api', 'Draft one', 'draft');
  spec(root, '0002', 'api', 'In review', 'review');
  spec(root, '0003', 'api', 'Needs start', 'active', ['- [x] T1: a (test: a)', '- [ ] T2: b (test: b)']);
  spec(root, '0004', 'api', 'Needs red', 'active', ['- [~] T1: a (test: a)']);
  spec(root, '0005', 'api', 'Needs done', 'active', ['- [~] T1: a (test: a)']);
  recordRun(root, '0005.api/T1', 'red', 1, 'now');
  spec(root, '0006', 'api', 'All tasks done', 'active', ['- [x] T1: a (test: a)']);
  spec(root, '0007', 'api', 'Finished', 'done', ['- [x] T1: a (test: a)']);
  spec(root, '0008', 'api', 'Replaced', 'superseded', [], { supersededBy: '"0009.api"' });
  const out = await run(root);
  expect(out).toContain('Next: dnw spec review 0001.api');
  expect(out).toContain('Next: dnw spec activate 0002.api  (human)');
  expect(out).toContain('Next: dnw task start 0003.api T2');
  expect(out).toContain('Next: dnw task red 0004.api T1');
  expect(out).toContain('T1 in progress (red ✓)');
  expect(out).toContain('Next: dnw task done 0005.api T1');
  expect(out).toContain('Next: dnw spec done 0006.api');
  expect(out).toContain('→ 0009.api');
  expect(out.indexOf('DRAFT')).toBeLessThan(out.indexOf('REVIEW'));
  expect(out.indexOf('ACTIVE')).toBeLessThan(out.indexOf('DONE'));
});

test('flags an active spec that was not approved via dnw', async () => {
  const root = initProject();
  spec(root, '0001', 'api', 'Sneaky', 'active', ['- [ ] T1: a (test: a)'], { approvedBy: 'null' });
  expect(await run(root)).toContain('⚠ not approved via dnw');
});

test('empty project suggests creating a spec', async () => {
  expect(await run(initProject())).toContain('No specs yet. Next: dnw spec new "<title>" --type api');
});

test('works from a subdirectory', async () => {
  const root = initProject();
  spec(root, '0001', 'api', 'Draft one', 'draft');
  const sub = join(root, 'src', 'components');
  mkdirSync(sub, { recursive: true });
  expect(await run(root, sub)).toContain('0001.api');
});

test('long titles stay separated from the next command', async () => {
  const root = initProject();
  spec(root, '0001', 'api', 'Missing cat reports', 'draft');
  expect(await run(root)).toContain('Missing cat reports  Next: dnw spec review 0001.api');
});
