#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
if (!/^\d+\.\d+\.\d+$/.test(version || '')) {
  throw new Error('Usage: node scripts/publish-docs-mcp.mjs <version> [--dry-run]');
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDir, '..');
const docsSiteDir = join(workspaceRoot, 'packages', 'docs-site');
const outputDir = join(docsSiteDir, '.cortex', 'release-mcp');
const cli = join(workspaceRoot, 'packages', 'cli', 'dist', 'main.js');

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, '.cortex-package.json'), `${JSON.stringify({ version })}\n`);

execFileSync(process.execPath, [cli, 'mcp', 'generate', '--output', outputDir], {
  cwd: docsSiteDir,
  stdio: 'inherit',
});

const manifest = JSON.parse(readFileSync(join(outputDir, 'package.json'), 'utf8'));
if (manifest.name !== '@cortex-docs/mcp') {
  throw new Error(`Generated ${manifest.name}. Expected @cortex-docs/mcp.`);
}
if (manifest.version !== version) {
  throw new Error(`Generated version ${manifest.version}. Expected ${version}.`);
}

const npmArgs = (args) => [...args, '--workspaces=false'];
execFileSync('npm', npmArgs(['install', '--ignore-scripts', '--package-lock=false']), {
  cwd: outputDir,
  stdio: 'inherit',
});
execFileSync('npm', npmArgs(['run', 'build']), { cwd: outputDir, stdio: 'inherit' });
execFileSync('npm', npmArgs(['pack', '--dry-run']), { cwd: outputDir, stdio: 'inherit' });

if (dryRun) {
  console.log(`Dry run complete for @cortex-docs/mcp@${version}.`);
  process.exit(0);
}

try {
  execFileSync('npm', ['view', `@cortex-docs/mcp@${version}`, 'version'], { stdio: 'ignore' });
  console.log(`Skipping @cortex-docs/mcp@${version}. It is already published.`);
  process.exit(0);
} catch {}

const publishArgs = npmArgs(['publish', '--access=public']);
if (process.env.GITHUB_REPOSITORY_VISIBILITY === 'public') publishArgs.push('--provenance');
execFileSync('npm', publishArgs, { cwd: outputDir, stdio: 'inherit' });
