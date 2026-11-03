import { Command, CommanderError } from 'commander';
import { DnwError } from './core/errors.js';
import { packageVersion } from './core/version.js';

export interface Io {
  out(s: string): void;
  err(s: string): void;
}

function defaultIo(): Io {
  return { out: (s) => process.stdout.write(s), err: (s) => process.stderr.write(s) };
}

function buildProgram(ctx: Io): Command {
  const program = new Command();
  program
    .name('dnw')
    .description('Spec-driven + TDD workflow, the same across AI coding tools')
    .version(packageVersion())
    .allowExcessArguments(false)
    .exitOverride()
    .configureOutput({ writeOut: ctx.out, writeErr: ctx.err });
  return program;
}

export async function main(argv: string[], ctx: Io = defaultIo()): Promise<number> {
  const program = buildProgram(ctx);
  try {
    await program.parseAsync(argv);
    return 0;
  } catch (e) {
    if (e instanceof CommanderError) {
      return e.code === 'commander.version' || e.code === 'commander.helpDisplayed' ? 0 : 1;
    }
    if (e instanceof DnwError) {
      ctx.err(`✗ ${e.message}\n`);
      if (e.next) ctx.err(`  Next: ${e.next}\n`);
      return 1;
    }
    throw e;
  }
}
