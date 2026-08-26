#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
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

const require = createRequire(import.meta.url);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const docsUiDir = resolve(scriptDir, '..');
const outputDir = join(docsUiDir, '.next-cloudflare');
const nextCli = require.resolve('next/dist/bin/next');
const wranglerPackagePath = require.resolve('wrangler/package.json');
const wranglerPackage = require(wranglerPackagePath);
const wranglerCli = resolve(dirname(wranglerPackagePath), wranglerPackage.bin.wrangler);
const demoApiUrl = process.env.CORTEX_DEMO_API_URL || 'http://localhost:4010';
const prepared = target === 'demo' ? prepareDemo(demoApiUrl) : prepareDocsSite();
const wranglerConfig = resolve(
  docsUiDir,
  target === 'demo' ? 'wrangler.jsonc' : 'wrangler.docs-site.jsonc',
);
const builtWithCortexLogoUrl =
  process.env.CORTEX_BUILT_WITH_LOGO_URL ||
  process.env.CORTEX_BUILT_BY_LOGO_URL ||
  process.env.CORTEX_BUILT_BY_BADGE_URL ||
  'https://static.cortexdocs.dev/images/built-with-cortex.svg';

const env = {
  ...process.env,
  CORTEX_STATIC_EXPORT: '1',
  CORTEX_CLOUDFLARE: '1',
  NEXT_PUBLIC_CORTEX_CLOUDFLARE: '1',
  NEXT_PUBLIC_CORTEX_BUILT_WITH_LOGO_URL: builtWithCortexLogoUrl,
  CORTEX_DIST_DIR: '.next-cloudflare',
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
};

function run(executable, args) {
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(executable, args, {
      cwd: docsUiDir,
      env,
      stdio: 'inherit',
    });
    child.once('error', rejectCommand);
    child.once('exit', (code, signal) => {
      if (signal) rejectCommand(new Error(`Command stopped with signal ${signal}.`));
      else if (code !== 0) rejectCommand(new Error(`Command failed with code ${code}.`));
      else resolveCommand();
    });
  });
}

function validateStaticOutput() {
  const requiredPaths = [
    'index.html',
    'api/config',
    'api/docs',
    'api/docs-watch',
    'api/mcp',
    'api/sdk-snippets',
    'api/sdks',
    'docs.html',
    'mcp.html',
    'sdks.html',
  ];
  for (const requiredPath of requiredPaths) {
    if (!existsSync(join(outputDir, requiredPath))) {
      throw new Error(`The static Cloudflare export is missing ${requiredPath}.`);
    }
  }
  if (existsSync(join(outputDir, 'worker.js'))) {
    throw new Error('The Cloudflare docs export unexpectedly contains a Worker script.');
  }
}

try {
  rmSync(outputDir, { recursive: true, force: true });
  await run(process.execPath, [nextCli, 'build', '--webpack']);
  validateStaticOutput();

  if (command === 'preview') {
    await run(process.execPath, [wranglerCli, 'dev', '--config', wranglerConfig]);
  } else if (command === 'deploy') {
    await run(process.execPath, [wranglerCli, 'deploy', '--config', wranglerConfig]);
  }
} catch (error) {
  console.error(error);
  process.exit(1);
}
