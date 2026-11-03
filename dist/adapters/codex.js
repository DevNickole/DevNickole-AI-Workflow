import { renderInstructions } from './instructions.js';
export function codexFiles(cfg) {
    return [{ path: 'AGENTS.md', content: renderInstructions(cfg), mode: 'marker' }];
}
