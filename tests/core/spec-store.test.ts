import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpProject } from '../helpers.js';
import { findSpec, listSpecs, nextId, specFileName } from '../../src/core/spec-store.js';
import { readTemplate, render } from '../../src/core/templates.js';
import { parseSpec } from '../../src/core/spec-file.js';

function writeFixture(root: string, file: string, id: string, type: string) {
  writeFileSync(
    join(root, 'docs', 'specs', file),
    `---\nid: "${id}"\ntype: ${type}\ntitle: Fixture\nstatus: draft\ndependsOn: null\napprovedBy: null\nsupersededBy: null\n---\n## Goal\nx\n`,
  );
}

test('nextId is 0001 on empty, then max+1', () => {
  const root = tmpProject();
  expect(nextId(root)).toBe('0001');
  writeFixture(root, '0003-a.api.md', '0003', 'api');
  expect(nextId(root)).toBe('0004');
});

test('findSpec uses frontmatter, not filename', () => {
  const root = tmpProject();
  writeFixture(root, 'renamed-by-hand.api.md', '0002', 'api');
  expect(findSpec(root, '0002.api').meta.id).toBe('0002');
});

test('duplicate id+type is an error naming both files', () => {
  const root = tmpProject();
  writeFixture(root, '0001-a.api.md', '0001', 'api');
  writeFixture(root, '0001-b.api.md', '0001', 'api');
  expect(() => listSpecs(root)).toThrow(/0001-a\.api\.md.*0001-b\.api\.md/);
});

test('missing spec suggests status', () =>
  expect(() => findSpec(tmpProject(), '0009.ui')).toThrow(expect.objectContaining({ next: 'dnw status' })));

test('slug strips special characters', () =>
  expect(specFileName('0001', 'Login: v2 "beta"', 'api')).toBe('0001-login-v2-beta.api.md'));

test('templates render and parse', () => {
  const ui = render(readTemplate('spec.ui.md'), { id: '0001', title: 'Login', dependsOn: '"0001.api"' });
  const d = parseSpec(ui, 'x.md');
  expect(d.meta).toMatchObject({ type: 'ui', dependsOn: '0001.api', status: 'draft' });
  expect(Object.keys(d.sections)).toEqual(['Goal', 'Screens', 'Components', 'States', 'User Flows', 'Acceptance Criteria', 'Tasks']);
});

test('api template has api sections', () => {
  const d = parseSpec(render(readTemplate('spec.api.md'), { id: '0001', title: 'Login' }), 'x.md');
  expect(d.meta.type).toBe('api');
  expect(Object.keys(d.sections)).toEqual(['Goal', 'Endpoints', 'Data Models', 'Errors', 'Acceptance Criteria', 'Tasks']);
});

test('render rejects unknown placeholder', () => expect(() => render('{{nope}}', {})).toThrow(/nope/));
