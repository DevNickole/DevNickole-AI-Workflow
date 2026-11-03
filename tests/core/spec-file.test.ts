import { parseSpec, serializeSpec, parseRef, formatRef } from '../../src/core/spec-file.js';

const SPEC = `---\nid: "0001"\ntype: api\ntitle: User login\nstatus: draft\ndependsOn: null\napprovedBy: null\nsupersededBy: null\n---\n## Goal\nLet users log in.\n\n## Tasks\n- [ ] T1: Returns token (test: tests/login.test.ts)\n- [~] T2: Locks account\n`;

test('parses meta, sections, tasks', () => {
  const d = parseSpec(SPEC, 'x.md');
  expect(d.meta).toMatchObject({ id: '0001', type: 'api', status: 'draft' });
  expect(d.sections['Goal']).toBe('Let users log in.');
  expect(d.tasks).toEqual([
    expect.objectContaining({ id: 'T1', state: 'todo', testPath: 'tests/login.test.ts' }),
    expect.objectContaining({ id: 'T2', state: 'in_progress', testPath: null }),
  ]);
});

test('round-trips unchanged', () => expect(serializeSpec(parseSpec(SPEC, 'x.md'))).toBe(SPEC));

test('updates status and task marker', () => {
  const d = parseSpec(SPEC, 'x.md');
  d.meta.status = 'review';
  d.tasks[0].state = 'done';
  const out = serializeSpec(d);
  expect(out).toContain('status: review');
  expect(out).toContain('- [x] T1: Returns token');
});

test('CRLF input is parsed and preserved', () => {
  const crlf = SPEC.replace(/\n/g, '\r\n');
  const d = parseSpec(crlf, 'x.md');
  expect(d.tasks).toHaveLength(2);
  expect(serializeSpec(d)).toBe(crlf);
});

test('YAML-special title round-trips', () => {
  const d = parseSpec(SPEC, 'x.md');
  d.meta.title = 'Login: v2 "beta"';
  expect(parseSpec(serializeSpec(d), 'x.md').meta.title).toBe('Login: v2 "beta"');
});

test('bad status reports file and line', () =>
  expect(() => parseSpec(SPEC.replace('status: draft', 'status: wip'), 'x.md')).toThrow(/x\.md:5: .*status/));

test('missing frontmatter is an error', () => expect(() => parseSpec('# hi', 'x.md')).toThrow(/x\.md:1/));

test('refs', () => {
  expect(parseRef('0001.ui')).toEqual({ id: '0001', type: 'ui' });
  expect(formatRef({ id: '0001', type: 'api' })).toBe('0001.api');
  expect(() => parseRef('1.web')).toThrow(/<id>\.<type>/);
});
