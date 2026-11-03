import { parse, stringify } from 'yaml';
import { DnwError } from './errors.js';
export const SPEC_TYPES = ['api', 'ui'];
export const SPEC_STATUSES = ['draft', 'review', 'active', 'done', 'superseded'];
export class SpecParseError extends DnwError {
    constructor(file, line, msg) {
        super(`${file}:${line}: ${msg}`);
    }
}
const TASK_RE = /^- \[( |~|x)\] (T\d+): (.*?)(?: \(test: (.+)\))?$/;
const MARKER = { todo: ' ', in_progress: '~', done: 'x' };
const STATE = { ' ': 'todo', '~': 'in_progress', x: 'done' };
const META_KEYS = ['id', 'type', 'title', 'status', 'dependsOn', 'approvedBy', 'supersededBy'];
export function parseSpec(text, path) {
    const bom = text.startsWith('﻿');
    if (bom)
        text = text.slice(1);
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    if (lines[0] !== '---')
        throw new SpecParseError(path, 1, 'missing frontmatter (expected "---" on line 1)');
    const end = lines.indexOf('---', 1);
    if (end === -1)
        throw new SpecParseError(path, 1, 'frontmatter is not closed with "---"');
    const fmLines = lines.slice(1, end);
    const lineOf = (key) => {
        const i = fmLines.findIndex((l) => l.startsWith(`${key}:`));
        return i === -1 ? 1 : i + 2;
    };
    let raw;
    try {
        raw = (parse(fmLines.join('\n')) ?? {});
    }
    catch (e) {
        throw new SpecParseError(path, 1, `invalid frontmatter: ${e.message}`);
    }
    const str = (key) => {
        const v = raw[key];
        if (v === undefined || v === null)
            return null;
        if (typeof v === 'string')
            return v;
        if (typeof v === 'number')
            return String(v);
        throw new SpecParseError(path, lineOf(key), `${key} must be a string`);
    };
    const id = str('id');
    if (!id || !/^\d+$/.test(id))
        throw new SpecParseError(path, lineOf('id'), 'id must be a number like "0001"');
    const type = str('type');
    if (!SPEC_TYPES.includes(type))
        throw new SpecParseError(path, lineOf('type'), `type must be one of ${SPEC_TYPES.join(', ')}`);
    const title = str('title');
    if (!title)
        throw new SpecParseError(path, lineOf('title'), 'title is required');
    const status = str('status');
    if (!SPEC_STATUSES.includes(status))
        throw new SpecParseError(path, lineOf('status'), `status must be one of ${SPEC_STATUSES.join(', ')}`);
    const meta = {
        id: id.padStart(4, '0'),
        type: type,
        title,
        status: status,
        dependsOn: str('dependsOn'),
        approvedBy: str('approvedBy'),
        supersededBy: str('supersededBy'),
    };
    const extra = Object.fromEntries(Object.entries(raw).filter(([k]) => !META_KEYS.includes(k)));
    const bodyStart = end + 1;
    const bodyLines = lines.slice(bodyStart);
    const sections = {};
    const tasks = [];
    let current = null;
    const buf = {};
    let inComment = false;
    bodyLines.forEach((l, i) => {
        const commented = inComment || l.trimStart().startsWith('<!--');
        inComment = endsInsideComment(l, inComment);
        const h = /^## (.+?)\s*$/.exec(l);
        if (h && !commented) {
            current = h[1];
            buf[current] = [];
            return;
        }
        if (current === null)
            return;
        buf[current].push(l);
        if (current === 'Tasks' && !commented) {
            const m = TASK_RE.exec(l);
            if (m) {
                const line = bodyStart + i + 1;
                if (tasks.some((t) => t.id === m[2]))
                    throw new SpecParseError(path, line, `duplicate task id ${m[2]}`);
                tasks.push({
                    id: m[2],
                    title: m[3],
                    state: STATE[m[1]],
                    testPath: m[4] ?? null,
                    line,
                    bodyIndex: i,
                });
            }
        }
    });
    for (const [name, content] of Object.entries(buf)) {
        sections[name] = content.join('\n').replace(/<!--[\s\S]*?-->/g, '').trim();
    }
    return { path, meta, body: bodyLines.join('\n'), eol, bom, extra, sections, tasks };
}
/** Whether an HTML comment is still open at the end of `line`, given whether one was open at its start. */
function endsInsideComment(line, open) {
    let pos = 0;
    for (;;) {
        const i = line.indexOf(open ? '-->' : '<!--', pos);
        if (i === -1)
            return open;
        pos = i + (open ? 3 : 4);
        open = !open;
    }
}
// lineWidth 0: never fold long values onto a second line (that breaks implicit keys)
function scalar(value) {
    return stringify(value, { lineWidth: 0 }).trimEnd();
}
export function serializeSpec(doc) {
    const fm = META_KEYS.map((k) => (k === 'id' ? `id: ${JSON.stringify(doc.meta.id)}` : `${k}: ${scalar(doc.meta[k])}`));
    if (Object.keys(doc.extra).length)
        fm.push(stringify(doc.extra, { lineWidth: 0 }).trimEnd());
    const body = doc.body.split('\n');
    for (const t of doc.tasks) {
        body[t.bodyIndex] = body[t.bodyIndex].replace(/^- \[( |~|x)\]/, `- [${MARKER[t.state]}]`);
    }
    const out = ['---', ...fm, '---', ...body].join('\n');
    return (doc.bom ? '﻿' : '') + (doc.eol === '\r\n' ? out.replace(/\n/g, '\r\n') : out);
}
export function formatRef(meta) {
    return `${meta.id}.${meta.type}`;
}
export function parseRef(ref) {
    const m = /^(\d{4})\.(api|ui)$/.exec(ref);
    if (!m)
        throw new DnwError(`Invalid spec ref "${ref}": expected <id>.<type>, e.g. 0001.api`);
    return { id: m[1], type: m[2] };
}
