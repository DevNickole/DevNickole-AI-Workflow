export class DnwError extends Error {
  constructor(message: string, public next?: string) {
    super(message);
    this.name = 'DnwError';
  }
}

/** Runs a guard and prefixes its rejection with "Cannot <verb> <ref>: ". */
export function guard<T>(verb: string, ref: string, fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof DnwError) throw new DnwError(`Cannot ${verb} ${ref}: ${e.message}`, e.next);
    throw e;
  }
}
