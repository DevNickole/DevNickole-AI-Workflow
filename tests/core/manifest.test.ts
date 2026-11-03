import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpProject } from '../helpers.js';
import { applyMarkerBlock, hash, writeManagedFiles } from '../../src/core/manifest.js';
import type { AdapterFile } from '../../src/adapters/index.js';

const put = (root: string, path: string, content: string) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
};
const get = (root: string, path: string) => readFileSync(join(root, path), 'utf8');

describe('applyMarkerBlock', () => {
  test('new file gets just the block', () =>
    expect(applyMarkerBlock(null, 'hello')).toBe('<!-- dnw:start -->\nhello\n<!-- dnw:end -->\n'));
  test('existing file without markers gets the block appended', () =>
    expect(applyMarkerBlock('# Mine\n', 'hello')).toBe('# Mine\n\n<!-- dnw:start -->\nhello\n<!-- dnw:end -->\n'));
  test('existing markers are replaced, user text kept', () => {
    const before = '# Mine\n\n<!-- dnw:start -->\nold\n<!-- dnw:end -->\n\nAfter\n';
    expect(applyMarkerBlock(before, 'new')).toBe('# Mine\n\n<!-- dnw:start -->\nnew\n<!-- dnw:end -->\n\nAfter\n');
  });
});

test('hash ignores line endings', () => expect(hash('a\r\nb')).toBe(hash('a\nb')));

describe('writeManagedFiles', () => {
  const whole = (content: string): AdapterFile => ({ path: '.claude/commands/dnw-status.md', content, mode: 'whole' });

  test('fresh write has no conflicts and records hashes', () => {
    const root = tmpProject();
    const r = writeManagedFiles(root, [whole('v1'), { path: 'CLAUDE.md', content: 'rules', mode: 'marker' }], null, '0.1.0');
    expect(r.conflicts).toEqual([]);
    expect(get(root, '.claude/commands/dnw-status.md')).toBe('v1');
    expect(r.manifest).toEqual({ toolVersion: '0.1.0', files: { '.claude/commands/dnw-status.md': hash('v1'), 'CLAUDE.md': hash('rules') } });
  });

  test('unmodified file is replaced', () => {
    const root = tmpProject();
    const first = writeManagedFiles(root, [whole('v1')], null, '0.1.0');
    const r = writeManagedFiles(root, [whole('v2')], first.manifest, '0.2.0');
    expect(r.conflicts).toEqual([]);
    expect(get(root, '.claude/commands/dnw-status.md')).toBe('v2');
  });

  test('locally modified file is kept and .new is written', () => {
    const root = tmpProject();
    const first = writeManagedFiles(root, [whole('v1')], null, '0.1.0');
    put(root, '.claude/commands/dnw-status.md', 'my edit');
    const r = writeManagedFiles(root, [whole('v2')], first.manifest, '0.2.0');
    expect(r.conflicts).toEqual(['.claude/commands/dnw-status.md']);
    expect(get(root, '.claude/commands/dnw-status.md')).toBe('my edit');
    expect(get(root, '.claude/commands/dnw-status.md.new')).toBe('v2');
  });

  test('json-merge keeps other keys', () => {
    const root = tmpProject();
    put(root, '.claude/settings.json', JSON.stringify({ permissions: { allow: ['Bash(npm test)'] }, enabledPlugins: { 'other@x': true } }));
    const patch = '{"enabledPlugins":{"superpowers@claude-plugins-official":true}}';
    const r = writeManagedFiles(root, [{ path: '.claude/settings.json', content: patch, mode: 'json-merge' }], null, '0.1.0');
    expect(r.conflicts).toEqual([]);
    expect(JSON.parse(get(root, '.claude/settings.json'))).toEqual({
      permissions: { allow: ['Bash(npm test)'] },
      enabledPlugins: { 'other@x': true, 'superpowers@claude-plugins-official': true },
    });
  });

  test('json-merge into invalid JSON is a conflict and leaves the file alone', () => {
    const root = tmpProject();
    put(root, '.claude/settings.json', '{ broken');
    const r = writeManagedFiles(root, [{ path: '.claude/settings.json', content: '{"a":1}', mode: 'json-merge' }], null, '0.1.0');
    expect(r.conflicts).toEqual(['.claude/settings.json']);
    expect(get(root, '.claude/settings.json')).toBe('{ broken');
    expect(existsSync(join(root, '.claude/settings.json.new'))).toBe(false);
  });
});
