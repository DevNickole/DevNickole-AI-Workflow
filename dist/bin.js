#!/usr/bin/env node
import { main } from './cli.js';
// Whatever reads the output may stop early, as in `dnw status | head -1`. The command must still finish its work,
// so a closed pipe is ignored rather than ending the process partway through.
for (const stream of [process.stdout, process.stderr]) {
    stream.on('error', (e) => {
        if (e.code !== 'EPIPE')
            throw e;
    });
}
process.exitCode = await main(process.argv);
