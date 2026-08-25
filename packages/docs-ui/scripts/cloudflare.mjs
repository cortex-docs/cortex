#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareDemo } from './prepare-demo.mjs';
import { prepareDocsSite } from './prepare-docs-site.mjs';

const command = process.argv[2];
const target = process.argv[3] ?? 'demo';
if (!['build', 'preview', 'deploy'].includes(command)) {
  console.error('Usage: node scripts/cloudflare.mjs <build|preview|deploy> [demo|docs]');
  process.exit(1);
}
if (!['demo', 'docs'].includes(target)) {
  console.error('The Cloudflare target must be "demo" or "docs".');
  process.exit(1);
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const docsUiDir = resolve(scriptDir, '..');
const workspaceRoot = resolve(docsUiDir, '..', '..');
const cli = resolve(workspaceRoot, 'node_modules', '.bin', 'opennextjs-cloudflare');
const demoApiUrl = process.env.CORTEX_DEMO_API_URL || 'http://localhost:4010';
const prepared = target === 'demo' ? prepareDemo(demoApiUrl) : prepareDocsSite();
const wranglerConfig = resolve(
  docsUiDir,
  target === 'demo' ? 'wrangler.jsonc' : 'wrangler.docs-site.jsonc',
);
const builtByCortexLogoUrl =
  process.env.CORTEX_BUILT_BY_LOGO_URL ||
  process.env.CORTEX_BUILT_BY_BADGE_URL ||
  'https://static.cortexdocs.dev/images/built-by-cortex.svg';

const env = {
  ...process.env,
  CORTEX_CLOUDFLARE: '1',
  NEXT_PUBLIC_CORTEX_CLOUDFLARE: '1',
  NEXT_PUBLIC_CORTEX_BUILT_BY_LOGO_URL: builtByCortexLogoUrl,
  CORTEX_DIST_DIR: '.next',
  CORTEX_DOCS_UI_ROOT: docsUiDir,
  CORTEX_CONFIG_PATH: prepared.configPath,
  CORTEX_LOGO_PATH: prepared.logoPath,
  CORTEX_FAVICON_PATH: prepared.faviconPath,
  ...(target === 'demo'
    ? {
        CORTEX_SPEC_PATH: prepared.specPath,
        CORTEX_ASYNCAPI_PATH: prepared.asyncApiPath,
        CORTEX_GRAPHQL_PATH: prepared.graphqlPath,
        CORTEX_GRPC_PATH: prepared.grpcPath,
        CORTEX_OPENRPC_PATH: prepared.openRpcPath,
      }
    : {}),
  NEXTJS_ENV: command === 'preview' ? 'development' : 'production',
};

function runOpenNext(subcommand) {
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(cli, [subcommand, '--config', wranglerConfig], {
      cwd: docsUiDir,
      env,
      stdio: 'inherit',
    });
    child.once('error', rejectCommand);
    child.once('exit', (code, signal) => {
      if (signal) rejectCommand(new Error(`OpenNext stopped with signal ${signal}.`));
      else if (code !== 0)
        rejectCommand(new Error(`OpenNext ${subcommand} failed with code ${code}.`));
      else resolveCommand();
    });
  });
}

try {
  await runOpenNext('build');
  if (command !== 'build') await runOpenNext(command);
} catch (error) {
  console.error(error);
  process.exit(1);
}
