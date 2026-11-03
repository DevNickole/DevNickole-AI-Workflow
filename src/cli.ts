import { Command, CommanderError } from 'commander';
import { defaultCtx, type Ctx } from './core/context.js';
import { DnwError } from './core/errors.js';
import { packageVersion } from './core/version.js';

function buildProgram(ctx: Ctx): Command {
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

export async function main(argv: string[], ctx: Ctx = defaultCtx()): Promise<number> {
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
