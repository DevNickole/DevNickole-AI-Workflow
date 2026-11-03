import { antigravityFiles } from './antigravity.js';
import { claudeFiles } from './claude.js';
import { codexFiles } from './codex.js';
const ADAPTERS = {
    claude: claudeFiles,
    codex: codexFiles,
    antigravity: antigravityFiles,
};
export function adapterFiles(cfg) {
    const byPath = new Map();
    for (const tool of cfg.aiTools) {
        for (const f of ADAPTERS[tool](cfg))
            byPath.set(f.path, f);
    }
    return [...byPath.values()];
}
export function superpowersSteps(cfg) {
    if (!cfg.superpowers)
        return [];
    const steps = [];
    if (cfg.aiTools.includes('antigravity')) {
        steps.push({ tool: 'antigravity', command: 'agy plugin install https://github.com/obra/superpowers' });
    }
    if (cfg.aiTools.includes('codex')) {
        steps.push({ tool: 'codex', manual: 'In Codex run /plugins, search "superpowers", select Install Plugin.' });
    }
    return steps;
}
