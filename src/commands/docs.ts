import { docsPaths, readConfig } from '../core/config.js';
import { findRoot, type Ctx } from '../core/context.js';
import { createDoc, DOC_KINDS, docFile, type DocKind } from '../core/docs.js';
import { DnwError } from '../core/errors.js';

/** Adds fillable templates for missing docs. Never overwrites or writes into anything that exists. */
export async function docsAdd(ctx: Ctx, kind: DocKind | undefined): Promise<void> {
  const root = findRoot(ctx.cwd);
  const docs = docsPaths(readConfig(root));
  const names = DOC_KINDS.map((d) => d.kind).join(', ');
  const chosen = kind === undefined ? DOC_KINDS : DOC_KINDS.filter((d) => d.kind === kind);
  if (chosen.length === 0) throw new DnwError(`Unknown doc "${kind}": use one of ${names}`);

  for (const d of chosen) {
    const path = docs[d.key];
    if (createDoc(root, path, d.kind)) {
      ctx.out(`✓ Added ${docFile(path)}. Fill it in, or ask your AI to help.\n`);
    } else if (kind !== undefined) {
      throw new DnwError(`${path} already exists; dnw never overwrites your docs`);
    } else {
      ctx.out(`• ${path} already exists; left unchanged\n`);
    }
  }
}
