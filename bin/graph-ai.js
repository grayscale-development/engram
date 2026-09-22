#!/usr/bin/env node
import { run } from '../src/cli.js';

run(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`graph-ai: ${error.message}\n`);
  process.exitCode = 1;
});
