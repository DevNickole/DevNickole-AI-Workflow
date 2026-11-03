import { Command, CommanderError, Option } from 'commander';
import { init } from './commands/init.js';
import { upgrade } from './commands/upgrade.js';
import { readConfig, type AiTool, type StackId } from './core/config.js';
import { specActivate, specDone, specNew, specReview, specSupersede } from './commands/spec.js';
import { status } from './commands/status.js';
import { taskDone, taskRed, taskStart } from './commands/task.js';
import { defaultCtx, findRoot, type Ctx } from './core/context.js';
import type { SpecType } from './core/spec-file.js';
import { DnwError } from './core/errors.js';
import { packageVersion } from './core/version.js';

const AI_TOOLS: AiTool[] = ['claude', 'codex', 'antigravity'];

function parseTools(list: string): AiTool[] {
  if (list.trim() === 'none') return [];
  const tools = list.split(',').map((t) => t.trim()).filter(Boolean);
  const bad = tools.filter((t) => !AI_TOOLS.includes(t as AiTool));
  if (bad.length) throw new DnwError(`Unknown AI tool: ${bad.join(', ')} (use ${AI_TOOLS.join(', ')} or none)`);
  return tools as AiTool[];
}

function buildProgram(ctx: Ctx): Command {
  const program = new Command();
  program
    .name('dnw')
    .description('Spec-driven + TDD workflow, the same across AI coding tools')
    .version(packageVersion())
    .allowExcessArguments(false)
    .exitOverride()
    .configureOutput({ writeOut: ctx.out, writeErr: ctx.err });

  program
    .command('init')
    .description('Install the dnw workflow into this project')
    .option('-y, --yes', 'accept recommendations without prompting')
    .addOption(new Option('--stack <stack>', 'tech stack').choices(['nextjs', 'node-api', 'laravel', 'php', 'flutter', 'go', 'python', 'other']))
    .option('--ai <tools>', 'comma-separated: claude,codex,antigravity or none')
    .option('--no-superpowers', 'do not set up superpowers')
    .option('--test-command <cmd>', 'full test suite command')
    .option('--test-file-command <cmd>', 'single test command; {file} and {dir} placeholders')
    .action(async (o: Record<string, unknown>, cmd: Command) => {
      await init(ctx, {
        yes: Boolean(o.yes),
        stack: o.stack as StackId | undefined,
        ai: o.ai === undefined ? undefined : parseTools(String(o.ai)),
        superpowers: cmd.getOptionValueSource('superpowers') === 'cli' ? Boolean(o.superpowers) : undefined,
        testCommand: o.testCommand as string | undefined,
        testFileCommand: o.testFileCommand as string | undefined,
      });
    });

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

  program
    .command('status')
    .description('List specs by status with the next allowed command')
    .action(() => status(ctx));

  program
    .command('upgrade')
    .description('Update managed files and run migrations after installing a newer dnw')
    .option('-y, --yes', 'apply migrations without asking')
    .action((o: { yes?: boolean }) => upgrade(ctx, { yes: o.yes }));

  for (const cmd of [program, ...program.commands, ...spec.commands, ...task.commands]) {
    cmd.exitOverride().configureOutput({ writeOut: ctx.out, writeErr: ctx.err });
  }
  return program;
}

const NO_VERSION_CHECK = new Set(['init', 'upgrade', '--version', '-V', '--help', '-h', 'help']);

/** Warns, without failing, when the project was set up with a different dnw version. */
function warnOnVersionMismatch(argv: string[], ctx: Ctx): void {
  const command = argv[2];
  if (command === undefined || NO_VERSION_CHECK.has(command)) return;
  try {
    const projectVersion = readConfig(findRoot(ctx.cwd)).toolVersion;
    const installed = packageVersion();
    if (projectVersion !== installed) {
      ctx.err(`⚠ This project uses dnw ${projectVersion}; installed is ${installed}. Run: dnw upgrade\n`);
    }
  } catch {
    // not in a dnw project: the command itself reports that
  }
}

export async function main(argv: string[], ctx: Ctx = defaultCtx()): Promise<number> {
  const program = buildProgram(ctx);
  warnOnVersionMismatch(argv, ctx);
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
