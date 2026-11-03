export class DnwError extends Error {
    next;
    constructor(message, next) {
        super(message);
        this.next = next;
        this.name = 'DnwError';
    }
}
/** Runs a guard and prefixes its rejection with "Cannot <verb> <ref>: ". */
export function guard(verb, ref, fn) {
    try {
        return fn();
    }
    catch (e) {
        if (e instanceof DnwError)
            throw new DnwError(`Cannot ${verb} ${ref}: ${e.message}`, e.next);
        throw e;
    }
}
