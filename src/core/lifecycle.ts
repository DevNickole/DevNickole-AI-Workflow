import { DnwError } from './errors.js';
import { runKey, type RunEvidence } from './runs.js';
import { formatRef, type SpecDoc, type SpecTask, type SpecType, type TaskState } from './spec-file.js';

export const REQUIRED_SECTIONS: Record<SpecType, string[]> = {
  api: ['Goal', 'Endpoints', 'Data Models', 'Errors', 'Acceptance Criteria', 'Tasks'],
  ui: ['Goal', 'Screens', 'Components', 'States', 'User Flows', 'Acceptance Criteria', 'Tasks'],
};

const STATE_LABEL: Record<TaskState, string> = { todo: 'todo', in_progress: 'in progress', done: 'done' };

function findTask(doc: SpecDoc, taskId: string): SpecTask {
  const t = doc.tasks.find((x) => x.id === taskId);
  if (!t) throw new DnwError(`${formatRef(doc.meta)} has no task ${taskId}`, `dnw status`);
  return t;
}

export function assertCanReview(doc: SpecDoc): void {
  const ref = formatRef(doc.meta);
  if (doc.meta.status !== 'draft') throw new DnwError(`${ref} is ${doc.meta.status}, expected draft`, 'dnw status');
  for (const name of REQUIRED_SECTIONS[doc.meta.type]) {
    if (name === 'Tasks') continue;
    if (!doc.sections[name]) throw new DnwError(`section "${name}" is empty`);
  }
  if (doc.tasks.length === 0) throw new DnwError(`${ref} has no tasks`);
  const noTest = doc.tasks.find((t) => !t.testPath);
  if (noTest) throw new DnwError(`task ${noTest.id} has no (test: <path>)`);
}

export function assertCanActivate(doc: SpecDoc, pairApi: SpecDoc | null, isTTY: boolean): void {
  const ref = formatRef(doc.meta);
  const { status, dependsOn } = doc.meta;
  if (status !== 'review') {
    throw new DnwError(`${ref} is ${status}, expected review`, status === 'draft' ? `dnw spec review ${ref}` : undefined);
  }
  // pairApi is the <id>.api spec when it exists, whether it was created before or after this ui spec
  if (doc.meta.type === 'ui' && (pairApi || dependsOn)) {
    const apiRef = pairApi ? formatRef(pairApi.meta) : dependsOn!;
    if (!pairApi) throw new DnwError(`paired ${apiRef} is missing`);
    const ps = pairApi.meta.status;
    if (ps !== 'active' && ps !== 'done') {
      const next = ps === 'draft' ? `dnw spec review ${apiRef}` : ps === 'review' ? `dnw spec activate ${apiRef}` : undefined;
      throw new DnwError(`paired ${apiRef} is still in ${ps}`, next);
    }
  }
  if (!isTTY) throw new DnwError('activation requires a human at an interactive terminal');
}

export function assertCanStartTask(doc: SpecDoc, taskId: string): SpecTask {
  const ref = formatRef(doc.meta);
  if (doc.meta.status !== 'active') {
    throw new DnwError(`${ref} is not active (status: ${doc.meta.status})`, `dnw spec activate ${ref}`);
  }
  const t = findTask(doc, taskId);
  if (t.state !== 'todo') throw new DnwError(`task ${t.id} is ${STATE_LABEL[t.state]}`);
  const other = doc.tasks.find((x) => x.state === 'in_progress');
  if (other) throw new DnwError(`task ${other.id} is already in progress`, `dnw task done ${ref} ${other.id}`);
  return t;
}

export function assertTaskInProgress(doc: SpecDoc, taskId: string): SpecTask {
  const ref = formatRef(doc.meta);
  const t = findTask(doc, taskId);
  if (t.state !== 'in_progress') throw new DnwError(`task ${t.id} is not in progress`, `dnw task start ${ref} ${t.id}`);
  return t;
}

/** Tasks marked done without a recorded failing run followed by a passing run. */
export function tasksWithoutEvidence(doc: SpecDoc, runs: Record<string, RunEvidence>): string[] {
  const ref = formatRef(doc.meta);
  return doc.tasks
    .filter((t) => t.state === 'done' && !(runs[runKey(ref, t.id)]?.red && runs[runKey(ref, t.id)]?.green))
    .map((t) => t.id);
}

export function assertCanSpecDone(doc: SpecDoc, runs: Record<string, RunEvidence>): void {
  const ref = formatRef(doc.meta);
  if (doc.meta.status !== 'active') throw new DnwError(`${ref} is ${doc.meta.status}, expected active`);
  const open = doc.tasks.filter((t) => t.state !== 'done').map((t) => t.id);
  if (open.length) throw new DnwError(`tasks not done: ${open.join(', ')}`, `dnw status`);
  const unproven = tasksWithoutEvidence(doc, runs);
  if (unproven.length) {
    throw new DnwError(
      `tasks marked done without dnw test evidence: ${unproven.join(', ')}. Reset them to [ ] and run the task loop`,
      `dnw status`,
    );
  }
}

export function assertCanSupersede(doc: SpecDoc, by: SpecDoc): void {
  if (doc.meta.id === by.meta.id && doc.meta.type === by.meta.type) throw new DnwError('a spec cannot supersede itself');
  if (doc.meta.type !== by.meta.type) {
    throw new DnwError(`${formatRef(by.meta)} must be the same type as ${formatRef(doc.meta)} (${doc.meta.type})`);
  }
}
