import { parse, stringify } from 'yaml';
import { DnwError } from './errors.js';

export type SpecType = 'api' | 'ui';
export type SpecStatus = 'draft' | 'review' | 'active' | 'done' | 'superseded';
export type TaskState = 'todo' | 'in_progress' | 'done';

export const SPEC_TYPES: SpecType[] = ['api', 'ui'];
export const SPEC_STATUSES: SpecStatus[] = ['draft', 'review', 'active', 'done', 'superseded'];

export interface SpecTask {
  id: string;
  title: string;
  state: TaskState;
  testPath: string | null;
  /** 1-based line in the file, for error messages */
  line: number;
  /** 0-based line index inside `body`, used when rewriting the checkbox */
  bodyIndex: number;
}

export interface SpecMeta {
  id: string;
  type: SpecType;
  title: string;
  status: SpecStatus;
  dependsOn: string | null;
  approvedBy: string | null;
  supersededBy: string | null;
}

export interface SpecDoc {
  path: string;
  meta: SpecMeta;
  body: string;
  eol: '\n' | '\r\n';
  /** file started with a UTF-8 byte-order mark; kept on write */
  bom: boolean;
  /** frontmatter keys dnw does not manage, kept on write */
  extra: Record<string, unknown>;
  sections: Record<string, string>;
  tasks: SpecTask[];
}

export class SpecParseError extends DnwError {
  constructor(file: string, line: number, msg: string) {
    super(`${file}:${line}: ${msg}`);
  }
}

const TASK_RE = /^- \[( |~|x)\] (T\d+): (.*?)(?: \(test: (.+)\))?$/;
const MARKER: Record<TaskState, string> = { todo: ' ', in_progress: '~', done: 'x' };
const STATE: Record<string, TaskState> = { ' ': 'todo', '~': 'in_progress', x: 'done' };
const META_KEYS: (keyof SpecMeta)[] = ['id', 'type', 'title', 'status', 'dependsOn', 'approvedBy', 'supersededBy'];

export function parseSpec(text: string, path: string): SpecDoc {
  const bom = text.startsWith('﻿');
  if (bom) text = text.slice(1);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[0] !== '---') throw new SpecParseError(path, 1, 'missing frontmatter (expected "---" on line 1)');
  const end = lines.indexOf('---', 1);
  if (end === -1) throw new SpecParseError(path, 1, 'frontmatter is not closed with "---"');

  const fmLines = lines.slice(1, end);
  const lineOf = (key: string) => {
    const i = fmLines.findIndex((l) => l.startsWith(`${key}:`));
    return i === -1 ? 1 : i + 2;
  };

  let raw: Record<string, unknown>;
  try {
    raw = (parse(fmLines.join('\n')) ?? {}) as Record<string, unknown>;
  } catch (e) {
    throw new SpecParseError(path, 1, `invalid frontmatter: ${(e as Error).message}`);
  }

  const str = (key: string): string | null => {
    const v = raw[key];
    if (v === undefined || v === null) return null;
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return String(v);
    throw new SpecParseError(path, lineOf(key), `${key} must be a string`);
  };

  const id = str('id');
  if (!id || !/^\d+$/.test(id)) throw new SpecParseError(path, lineOf('id'), 'id must be a number like "0001"');
  const type = str('type');
  if (!SPEC_TYPES.includes(type as SpecType))
    throw new SpecParseError(path, lineOf('type'), `type must be one of ${SPEC_TYPES.join(', ')}`);
  const title = str('title');
  if (!title) throw new SpecParseError(path, lineOf('title'), 'title is required');
  const status = str('status');
  if (!SPEC_STATUSES.includes(status as SpecStatus))
    throw new SpecParseError(path, lineOf('status'), `status must be one of ${SPEC_STATUSES.join(', ')}`);

  const meta: SpecMeta = {
    id: id.padStart(4, '0'),
    type: type as SpecType,
    title,
    status: status as SpecStatus,
    dependsOn: str('dependsOn'),
    approvedBy: str('approvedBy'),
    supersededBy: str('supersededBy'),
  };
  const extra = Object.fromEntries(Object.entries(raw).filter(([k]) => !(META_KEYS as string[]).includes(k)));

  const bodyStart = end + 1;
  const bodyLines = lines.slice(bodyStart);
  const sections: Record<string, string> = {};
  const tasks: SpecTask[] = [];
  let current: string | null = null;
  const buf: Record<string, string[]> = {};
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
    if (current === null) return;
    buf[current].push(l);
    if (current === 'Tasks' && !commented) {
      const m = TASK_RE.exec(l);
      if (m) {
        const line = bodyStart + i + 1;
        if (tasks.some((t) => t.id === m[2])) throw new SpecParseError(path, line, `duplicate task id ${m[2]}`);
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
function endsInsideComment(line: string, open: boolean): boolean {
  let pos = 0;
  for (;;) {
    const i = line.indexOf(open ? '-->' : '<!--', pos);
    if (i === -1) return open;
    pos = i + (open ? 3 : 4);
    open = !open;
  }
}

// lineWidth 0: never fold long values onto a second line (that breaks implicit keys)
function scalar(value: string | null): string {
  return stringify(value, { lineWidth: 0 }).trimEnd();
}

export function serializeSpec(doc: SpecDoc): string {
  const fm = META_KEYS.map((k) => (k === 'id' ? `id: ${JSON.stringify(doc.meta.id)}` : `${k}: ${scalar(doc.meta[k])}`));
  if (Object.keys(doc.extra).length) fm.push(stringify(doc.extra, { lineWidth: 0 }).trimEnd());
  const body = doc.body.split('\n');
  for (const t of doc.tasks) {
    body[t.bodyIndex] = body[t.bodyIndex].replace(/^- \[( |~|x)\]/, `- [${MARKER[t.state]}]`);
  }
  const out = ['---', ...fm, '---', ...body].join('\n');
  return (doc.bom ? '﻿' : '') + (doc.eol === '\r\n' ? out.replace(/\n/g, '\r\n') : out);
}

export function formatRef(meta: Pick<SpecMeta, 'id' | 'type'>): string {
  return `${meta.id}.${meta.type}`;
}

export function parseRef(ref: string): { id: string; type: SpecType } {
  const m = /^(\d{4})\.(api|ui)$/.exec(ref);
  if (!m) throw new DnwError(`Invalid spec ref "${ref}": expected <id>.<type>, e.g. 0001.api`);
  return { id: m[1], type: m[2] as SpecType };
}
