import { Command, CommanderError, Option } from 'commander';
import { specActivate, specDone, specNew, specReview, specSupersede } from './commands/spec.js';
import { taskDone, taskRed, taskStart } from './commands/task.js';
import { defaultCtx, type Ctx } from './core/context.js';
import type { SpecType } from './core/spec-file.js';
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

  const spec = program.command('spec').description('Create specs and move them through the lifecycle');
  spec
    .command('new <title>')
    .description('Create a draft spec')
    .addOption(new Option('--type <type>', 'spec type').choices(['api', 'ui']).makeOptionMandatory())
    .option('--id <id>', 'add the other half of an existing spec pair')
    .action(async (title: string, o: { type: SpecType; id?: string }) => {
      await specNew(ctx, title, o);
    });
  spec.command('review <ref>').description('draft → review').action((ref: string) => specReview(ctx, ref));
  spec.command('activate <ref>').description('review → active (human only)').action((ref: string) => specActivate(ctx, ref));
  spec.command('done <ref>').description('active → done').action((ref: string) => specDone(ctx, ref));
  spec
    .command('supersede <ref>')
    .description('mark a spec as replaced by another')
    .requiredOption('--by <ref>', 'the replacing spec')
    .action((ref: string, o: { by: string }) => specSupersede(ctx, ref, o.by));

  const task = program.command('task').description('Run one spec task through the SDD + TDD loop');
  task
    .command('start <ref> <taskId>')
    .description('todo → in progress')
    .action((ref: string, id: string) => taskStart(ctx, ref, id));
  task
    .command('red <ref> <taskId>')
    .description("run the task's test and record that it fails")
    .action((ref: string, id: string) => taskRed(ctx, ref, id));
  task
    .command('done <ref> <taskId>')
    .description("task test + full suite must pass; in progress → done")
    .action((ref: string, id: string) => taskDone(ctx, ref, id));

  for (const cmd of [program, ...program.commands, ...spec.commands, ...task.commands]) {
    cmd.exitOverride().configureOutput({ writeOut: ctx.out, writeErr: ctx.err });
  }
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
