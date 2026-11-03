import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { initProject, testCtx, tmpProject } from '../helpers.js';
import { docsAdd } from '../../src/commands/docs.js';
import { init } from '../../src/commands/init.js';
import { status } from '../../src/commands/status.js';
import { DOC_SECTIONS, unfilledDocs } from '../../src/core/docs.js';
import { readTemplate } from '../../src/core/templates.js';
import { renderInstructions } from '../../src/adapters/instructions.js';
import { readConfig } from '../../src/core/config.js';

const read = (root: string, p: string) => readFileSync(join(root, p), 'utf8');
const sections = (md: string) => [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
const hints = (md: string) => (md.match(/<!-- fill:/g) ?? []).length;

describe('templates', () => {
  test.each([
    ['architecture', 'Architecture'],
    ['products', 'Products'],
    ['design-system', 'Design System'],
  ] as const)('%s has its title, every section, and one fill hint per section', (name, title) => {
    const md = readTemplate(`docs-readme/${name}.md`);
    expect(md.startsWith(`# ${title}\n`)).toBe(true);
    expect(sections(md)).toEqual(DOC_SECTIONS[name]);
    expect(hints(md)).toBe(DOC_SECTIONS[name].length);
  });

  test('architecture starts a Mermaid diagram', () => expect(readTemplate('docs-readme/architecture.md')).toContain('```mermaid'));
});

describe('init writes the templates', () => {
  test('new project gets full templates', async () => {
    const root = tmpProject();
    await init(testCtx({ cwd: root }), { yes: true, stack: 'node-api', ai: [] });
    expect(sections(read(root, 'docs/architecture/README.md'))).toEqual(DOC_SECTIONS.architecture);
    expect(sections(read(root, 'docs/products/README.md'))).toEqual(DOC_SECTIONS.products);
    expect(sections(read(root, 'docs/design-system/README.md'))).toEqual(DOC_SECTIONS['design-system']);
  });
});

describe('dnw docs add', () => {
  test('adds every missing template, then leaves them alone', async () => {
    const root = initProject();
    const ctx = testCtx({ cwd: root });
    await docsAdd(ctx, undefined);
    for (const p of ['docs/architecture/README.md', 'docs/products/README.md', 'docs/design-system/README.md']) {
      expect(existsSync(join(root, p))).toBe(true);
    }
    expect(ctx.outText()).toContain('✓ Added docs/products/README.md');

    writeFileSync(join(root, 'docs/products/README.md'), '# Mine\n');
    const again = testCtx({ cwd: root });
    await docsAdd(again, undefined);
    expect(read(root, 'docs/products/README.md')).toBe('# Mine\n');
    expect(again.outText()).toContain('docs/products/ already exists; left unchanged');
  });

  test('one kind that already exists is refused', async () => {
    const root = initProject();
    mkdirSync(join(root, 'docs/architecture'), { recursive: true });
    writeFileSync(join(root, 'docs/architecture/notes.md'), 'mine');
    await expect(docsAdd(testCtx({ cwd: root }), 'architecture')).rejects.toThrow(/docs\/architecture\/ already exists/);
    expect(existsSync(join(root, 'docs/architecture/README.md'))).toBe(false);
  });

  test('a mapped single file is created as that file', async () => {
    const root = initProject({ docs: { architecture: 'docs/ARCH.md', products: 'docs/products/', designSystem: 'lib/theme/' } });
    await docsAdd(testCtx({ cwd: root }), 'architecture');
    expect(sections(read(root, 'docs/ARCH.md'))).toEqual(DOC_SECTIONS.architecture);
  });

  test('never writes into an existing code folder', async () => {
    const root = initProject({ docs: { architecture: 'docs/architecture/', products: 'docs/products/', designSystem: 'lib/theme/' } });
    mkdirSync(join(root, 'lib/theme'), { recursive: true });
    writeFileSync(join(root, 'lib/theme/app_theme.dart'), '// theme');
    const ctx = testCtx({ cwd: root });
    await docsAdd(ctx, undefined);
    expect(existsSync(join(root, 'lib/theme/README.md'))).toBe(false);
    expect(ctx.outText()).toContain('lib/theme/ already exists; left unchanged');
  });

  test('unknown kind is rejected', async () =>
    expect(docsAdd(testCtx({ cwd: initProject() }), 'roadmap' as never)).rejects.toThrow(/architecture, products, design-system/));
});

describe('unfilled templates', () => {
  test('counts hints left in each mapped doc', async () => {
    const root = tmpProject();
    await init(testCtx({ cwd: root }), { yes: true, stack: 'node-api', ai: [] });
    const cfg = readConfig(root);
    expect(unfilledDocs(root, cfg).map((d) => d.path)).toEqual([
      'docs/architecture/README.md',
      'docs/products/README.md',
      'docs/design-system/README.md',
    ]);
    writeFileSync(join(root, 'docs/products/README.md'), read(root, 'docs/products/README.md').replace(/<!-- fill:[\s\S]*?-->/g, 'Filled.'));
    expect(unfilledDocs(root, cfg).map((d) => d.path)).not.toContain('docs/products/README.md');
  });

  test('ordinary HTML comments in your own docs are not counted', () => {
    const root = initProject({ docs: { architecture: 'docs/architecture.md', products: 'docs/products/', designSystem: 'docs/design-system/' } });
    writeFileSync(join(root, 'docs/architecture.md'), '# Arch\n<!-- todo: diagram -->\n');
    expect(unfilledDocs(root, readConfig(root))).toEqual([]);
  });

  test('status reminds the team', async () => {
    const root = tmpProject();
    await init(testCtx({ cwd: root }), { yes: true, stack: 'node-api', ai: [] });
    const ctx = testCtx({ cwd: root });
    await status(ctx);
    expect(ctx.outText()).toContain(`⚠ docs/products/README.md is still a template (${DOC_SECTIONS.products.length} sections to fill)`);
  });
});

test('AI instructions ask to fill templates and mention docs add', () => {
  const text = renderInstructions({
    toolVersion: '0', stack: 'node-api', testCommand: 'npm test', testFileCommand: 'x {file}', aiTools: [], superpowers: false,
  });
  expect(text).toContain('<!-- fill:');
  expect(text).toContain('dnw docs add');
});
