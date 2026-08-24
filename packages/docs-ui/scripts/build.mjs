#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const nextBin = require.resolve('next/dist/bin/next');
const env = {
  ...process.env,
  CORTEX_DIST_DIR: process.env.CORTEX_DIST_DIR || '.next-build',
};

const child = spawn(process.execPath, [nextBin, 'build', '--webpack'], {
  env,
  stdio: 'inherit',
});

child.once('error', (error) => {
  console.error(error);
  process.exit(1);
});
child.once('exit', (code, signal) => {
  if (signal) {
    console.error(`Next.js build stopped with signal ${signal}.`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
