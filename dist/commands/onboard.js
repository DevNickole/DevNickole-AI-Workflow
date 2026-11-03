import { readConfig, writeConfig } from '../core/config.js';
import { findRoot } from '../core/context.js';
import { onboardingChecklist } from '../core/onboarding.js';
/** Prints the AI onboarding checklist for this project, or with done: marks onboarding complete. */
export async function onboard(ctx, opts) {
    const root = findRoot(ctx.cwd);
    const cfg = readConfig(root);
    if (opts.done) {
        writeConfig(root, { ...cfg, onboarded: true });
        ctx.out('✓ Onboarding complete. Next: dnw spec new "<title>" --type api\n');
        return;
    }
    ctx.out(onboardingChecklist(root, cfg));
}
