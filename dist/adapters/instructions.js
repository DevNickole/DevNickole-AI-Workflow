import { dnwCommand, docsPaths } from '../core/config.js';
import { readTemplate, render } from '../core/templates.js';
export function renderInstructions(cfg) {
    const docs = docsPaths(cfg);
    return render(readTemplate('instructions.md'), {
        dnw: dnwCommand(cfg),
        architecture: docs.architecture,
        products: docs.products,
        designSystem: docs.designSystem,
        testCommand: cfg.testCommand,
        testFileCommand: cfg.testFileCommand,
        superpowersSection: cfg.superpowers ? readTemplate('superpowers.md') : '',
    }).trimEnd() + '\n';
}
