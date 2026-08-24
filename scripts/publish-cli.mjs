#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const expectedVersion = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
if (!/^\d+\.\d+\.\d+$/.test(expectedVersion || '')) {
  throw new Error('Usage: node scripts/publish-cli.mjs <version> [--dry-run]');
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDir, '..');
const cliManifestPath = join(workspaceRoot, 'packages', 'cli', 'package.json');
const cliManifest = JSON.parse(readFileSync(cliManifestPath, 'utf8'));
const bundledPackages = [
  '@cortex-docs/codegen',
  '@cortex-docs/core',
  '@cortex-docs/docs-ui',
  '@cortex-docs/mcp-gen',
];

if (!dryRun && cliManifest.version !== expectedVersion) {
  throw new Error(
    `${cliManifest.name} has version ${cliManifest.version}. Expected ${expectedVersion}.`,
  );
}

if (!dryRun) {
  try {
    execFileSync('npm', ['view', `${cliManifest.name}@${expectedVersion}`, 'version'], {
      stdio: 'ignore',
    });
    console.log(`Skipping ${cliManifest.name}@${expectedVersion}. It is already published.`);
    process.exit(0);
  } catch {}
}

const stagingRoot = mkdtempSync(join(tmpdir(), 'cortex-cli-release-'));
const stagingPackage = join(stagingRoot, 'package');

function packWorkspace(name) {
  const output = execFileSync(
    'npm',
    ['pack', `--workspace=${name}`, `--pack-destination=${stagingRoot}`, '--json'],
    {
      cwd: workspaceRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    },
  );
  const [{ filename }] = JSON.parse(output);
  return join(stagingRoot, filename);
}

function extractPackage(archive, target) {
  mkdirSync(target, { recursive: true });
  execFileSync('tar', ['-xzf', archive, '-C', target, '--strip-components=1']);
}

try {
  extractPackage(packWorkspace(cliManifest.name), stagingPackage);

  const stagedManifestPath = join(stagingPackage, 'package.json');
  const stagedManifest = JSON.parse(readFileSync(stagedManifestPath, 'utf8'));
  stagedManifest.version = expectedVersion;
  stagedManifest.bundleDependencies = bundledPackages;
  writeFileSync(stagedManifestPath, `${JSON.stringify(stagedManifest, null, 2)}\n`);

  for (const packageName of bundledPackages) {
    const target = join(stagingPackage, 'node_modules', ...packageName.split('/'));
    extractPackage(packWorkspace(packageName), target);
  }

  execFileSync(
    'npm',
    ['install', '--package-lock-only', '--ignore-scripts', '--workspaces=false'],
    { cwd: stagingPackage, stdio: 'inherit' },
  );

  const packOutput = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: stagingPackage,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const [packed] = JSON.parse(packOutput);
  const missingPackages = bundledPackages.filter((name) => !packed.bundled.includes(name));
  if (missingPackages.length > 0) {
    throw new Error(`The CLI tarball does not include: ${missingPackages.join(', ')}`);
  }

  console.log(
    `Checked ${cliManifest.name}@${expectedVersion} with ${packed.bundled.length} bundled workspace packages.`,
  );
  if (dryRun) process.exitCode = 0;
  else {
    const publishArgs = ['publish', '--access=public', '--ignore-scripts'];
    if (process.env.GITHUB_REPOSITORY_VISIBILITY === 'public') publishArgs.push('--provenance');
    execFileSync('npm', publishArgs, { cwd: stagingPackage, stdio: 'inherit' });
  }
} finally {
  rmSync(stagingRoot, { recursive: true, force: true });
}
