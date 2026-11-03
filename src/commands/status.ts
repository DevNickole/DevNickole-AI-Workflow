import { readConfig } from '../core/config.js';
import { findRoot, type Ctx } from '../core/context.js';
import { unfilledDocs } from '../core/docs.js';
import { tasksWithoutEvidence } from '../core/lifecycle.js';
import { readRuns, runKey, type RunEvidence } from '../core/runs.js';
import { formatRef, SPEC_STATUSES, type SpecDoc } from '../core/spec-file.js';
import { listSpecs } from '../core/spec-store.js';

const INDENT = ' '.repeat(12);

/** What to show for one spec: optional task detail and the next allowed command. */
function describe(doc: SpecDoc, runs: Record<string, RunEvidence>): { detail?: string; next?: string } {
  const ref = formatRef(doc.meta);
  switch (doc.meta.status) {
    case 'draft':
      return { next: `dnw spec review ${ref}` };
    case 'review':
      return { next: `dnw spec activate ${ref}  (human)` };
    case 'active': {
      const current = doc.tasks.find((t) => t.state === 'in_progress');
      if (current) {
        const red = Boolean(runs[runKey(ref, current.id)]?.red);
        return {
          detail: `${current.id} in progress (red ${red ? '✓' : '✗'})`,
          next: red ? `dnw task done ${ref} ${current.id}` : `dnw task red ${ref} ${current.id}`,
        };
      }
      const todo = doc.tasks.find((t) => t.state === 'todo');
      return { next: todo ? `dnw task start ${ref} ${todo.id}` : `dnw spec done ${ref}` };
    }
    case 'superseded':
      return { detail: `→ ${doc.meta.supersededBy ?? '?'}` };
    default:
      return {};
  }
}

export async function status(ctx: Ctx): Promise<void> {
  const root = findRoot(ctx.cwd);
  for (const d of unfilledDocs(root, readConfig(root))) {
    ctx.out(`⚠ ${d.path} is still a template (${d.remaining} sections to fill)\n`);
  }
  const specs = listSpecs(root);
  if (specs.length === 0) {
    ctx.out('No specs yet. Next: dnw spec new "<title>" --type api\n');
    return;
  }
  const runs = readRuns(root);
  for (const st of SPEC_STATUSES) {
    const group = specs.filter((d) => d.meta.status === st);
    if (group.length === 0) continue;
    ctx.out(`${st.toUpperCase()}\n`);
    for (const doc of group) {
      const { detail, next } = describe(doc, runs);
      let warn = (st === 'active' || st === 'done') && !doc.meta.approvedBy ? '  ⚠ not approved via dnw' : '';
      for (const id of tasksWithoutEvidence(doc, runs)) warn += `  ⚠ ${id} done without dnw evidence`;
      const head = `  ${formatRef(doc.meta).padEnd(10)}${doc.meta.title.padEnd(Math.max(18, doc.meta.title.length + 2))}`;
      if (detail) {
        ctx.out(`${head}${detail}${warn}\n`);
        if (next) ctx.out(`${INDENT}Next: ${next}\n`);
      } else {
        ctx.out(`${head}${next ? `Next: ${next}` : ''}${warn}`.trimEnd() + '\n');
      }
    }
  }
}
