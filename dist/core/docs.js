import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { docsPaths } from './config.js';
import { readTemplate } from './templates.js';
export const DOC_KINDS = [
    { kind: 'architecture', key: 'architecture', label: 'Architecture docs' },
    { kind: 'products', key: 'products', label: 'Product docs' },
    { kind: 'design-system', key: 'designSystem', label: 'Design system' },
];
/** The sections each template asks the team to fill in, in order. */
export const DOC_SECTIONS = {
    architecture: ['Overview', 'Tech Stack', 'System Diagram', 'Modules', 'Data Flow', 'Integrations', 'Key Decisions', 'Constraints', 'Conventions'],
    products: ['Vision', 'Users', 'Problems', 'Goals and Success Metrics', 'Scope', 'Features', 'Milestones', 'Glossary'],
    'design-system': ['Principles', 'Tokens', 'Components', 'Patterns', 'Accessibility', 'Do and Don\'t', 'Where It Lives in Code'],
};
/** Template hints look like `<!-- fill: ... -->`, so ordinary HTML comments in a team's own docs are not counted. */
const FILL_HINT = /<!-- fill:/g;
/** The Markdown file for a doc location: the folder's README.md, or the file itself. */
export function docFile(path) {
    return path.endsWith('/') ? `${path}README.md` : path;
}
/**
 * Writes a template at a doc location that does not exist yet: a folder with a README, or the named Markdown file.
 * Returns false, writing nothing, when anything is already there.
 */
export function createDoc(root, path, template) {
    if (existsSync(join(root, path)))
        return false;
    const file = join(root, docFile(path));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, readTemplate(`docs-readme/${template}.md`));
    return true;
}
/** Number of template sections still to fill in a doc's text. */
export function fillHints(content) {
    return (content.match(FILL_HINT) ?? []).length;
}
/** Mapped docs that still contain template hints, with how many sections are left. */
export function unfilledDocs(root, cfg) {
    const docs = docsPaths(cfg);
    const result = [];
    for (const { key } of DOC_KINDS) {
        const path = docFile(docs[key]);
        const abs = join(root, path);
        if (!existsSync(abs))
            continue;
        const remaining = (readFileSync(abs, 'utf8').match(FILL_HINT) ?? []).length;
        if (remaining > 0)
            result.push({ path, remaining });
    }
    return result;
}
