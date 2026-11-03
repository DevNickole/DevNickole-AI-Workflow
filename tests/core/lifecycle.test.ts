import type { SpecDoc, SpecMeta, SpecTask } from '../../src/core/spec-file.js';
import {
  REQUIRED_SECTIONS,
  assertCanActivate,
  assertCanReview,
  assertCanSpecDone,
  assertCanStartTask,
  assertCanSupersede,
  assertTaskInProgress,
} from '../../src/core/lifecycle.js';

const task = (id: string, state: SpecTask['state'] = 'todo', testPath: string | null = `tests/${id}.test.ts`): SpecTask => ({
  id, title: id, state, testPath, line: 1, bodyIndex: 0,
});

function makeDoc(meta: Partial<SpecMeta> = {}, tasks: SpecTask[] = [task('T1')], sections?: Record<string, string>): SpecDoc {
  const m: SpecMeta = { id: '0001', type: 'api', title: 'X', status: 'draft', dependsOn: null, approvedBy: null, supersededBy: null, ...meta };
  const s = sections ?? Object.fromEntries(REQUIRED_SECTIONS[m.type].map((n) => [n, 'filled']));
  return { path: 'x.md', meta: m, body: '', eol: '\n', sections: s, tasks };
}

const err = (fn: () => unknown) => {
  try { fn(); } catch (e) { return e as Error & { next?: string }; }
  throw new Error('expected throw');
};

describe('review', () => {
  test('allowed', () => expect(() => assertCanReview(makeDoc())).not.toThrow());
  test('not draft', () => {
    const e = err(() => assertCanReview(makeDoc({ status: 'active' })));
    expect(e.message).toContain('is active, expected draft');
    expect(e.next).toBe('dnw status');
  });
  test('empty section', () => {
    const sections = Object.fromEntries(REQUIRED_SECTIONS.api.map((n) => [n, n === 'Errors' ? '' : 'x']));
    expect(err(() => assertCanReview(makeDoc({}, [task('T1')], sections))).message).toContain('section "Errors" is empty');
  });
  test('missing section counts as empty', () =>
    expect(err(() => assertCanReview(makeDoc({}, [task('T1')], { Goal: 'x' }))).message).toContain('is empty'));
  test('no tasks', () => expect(err(() => assertCanReview(makeDoc({}, []))).message).toContain('has no tasks'));
  test('task without test', () =>
    expect(err(() => assertCanReview(makeDoc({}, [task('T1', 'todo', null)]))).message).toContain('task T1 has no (test: <path>)'));
});

describe('activate', () => {
  const api = (status: SpecMeta['status']) => makeDoc({ status });
  const ui = makeDoc({ type: 'ui', status: 'review', dependsOn: '0001.api' });
  test('allowed', () => expect(() => assertCanActivate(makeDoc({ status: 'review' }), null, true)).not.toThrow());
  test('allowed ui with active pair', () => expect(() => assertCanActivate(ui, api('active'), true)).not.toThrow());
  test('not review', () => {
    const e = err(() => assertCanActivate(makeDoc({ status: 'draft' }), null, true));
    expect(e.message).toContain('expected review');
    expect(e.next).toBe('dnw spec review 0001.api');
  });
  test('non-tty', () =>
    expect(err(() => assertCanActivate(makeDoc({ status: 'review' }), null, false)).message).toContain('requires a human at an interactive terminal'));
  test('pair in draft', () => {
    const e = err(() => assertCanActivate(ui, api('draft'), true));
    expect(e.message).toBe('paired 0001.api is still in draft');
    expect(e.next).toBe('dnw spec review 0001.api');
  });
  test('pair missing', () => expect(err(() => assertCanActivate(ui, null, true)).message).toContain('paired 0001.api is missing'));
});

describe('start task', () => {
  test('allowed', () => expect(assertCanStartTask(makeDoc({ status: 'active' }), 'T1').id).toBe('T1'));
  test('not active', () => {
    const e = err(() => assertCanStartTask(makeDoc({ status: 'review' }), 'T1'));
    expect(e.message).toContain('is not active');
    expect(e.next).toBe('dnw spec activate 0001.api');
  });
  test('unknown task', () => expect(err(() => assertCanStartTask(makeDoc({ status: 'active' }), 'T9')).message).toContain('has no task T9'));
  test('task not todo', () =>
    expect(err(() => assertCanStartTask(makeDoc({ status: 'active' }, [task('T1', 'done')]), 'T1')).message).toContain('task T1 is done'));
  test('another in progress', () => {
    const e = err(() => assertCanStartTask(makeDoc({ status: 'active' }, [task('T1', 'in_progress'), task('T2')]), 'T2'));
    expect(e.message).toContain('task T1 is already in progress');
    expect(e.next).toBe('dnw task done 0001.api T1');
  });
});

describe('task in progress', () => {
  test('allowed', () => expect(assertTaskInProgress(makeDoc({ status: 'active' }, [task('T1', 'in_progress')]), 'T1').id).toBe('T1'));
  test('not in progress', () => {
    const e = err(() => assertTaskInProgress(makeDoc({ status: 'active' }), 'T1'));
    expect(e.message).toContain('task T1 is not in progress');
    expect(e.next).toBe('dnw task start 0001.api T1');
  });
});

describe('spec done', () => {
  test('allowed', () => expect(() => assertCanSpecDone(makeDoc({ status: 'active' }, [task('T1', 'done')]))).not.toThrow());
  test('not active', () => expect(err(() => assertCanSpecDone(makeDoc({ status: 'review' }))).message).toContain('expected active'));
  test('tasks open', () =>
    expect(err(() => assertCanSpecDone(makeDoc({ status: 'active' }, [task('T1', 'done'), task('T2'), task('T3', 'in_progress')]))).message)
      .toContain('tasks not done: T2, T3'));
});

describe('supersede', () => {
  test('allowed', () => expect(() => assertCanSupersede(makeDoc(), makeDoc({ id: '0007' }))).not.toThrow());
  test('different type', () =>
    expect(err(() => assertCanSupersede(makeDoc(), makeDoc({ id: '0007', type: 'ui' }))).message).toContain('same type'));
  test('itself', () => expect(err(() => assertCanSupersede(makeDoc(), makeDoc())).message).toContain('cannot supersede itself'));
});
