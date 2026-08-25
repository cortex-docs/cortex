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
  '@cortex-docs/core',
  '@cortex-docs/codegen',
  '@cortex-docs/mcp-gen',
  '@cortex-docs/docs-ui',
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

function addBundledRuntimeDependencies(stagedManifest, bundledManifests) {
  const dependencies = { ...(stagedManifest.dependencies ?? {}) };

  for (const [packageName, manifest] of bundledManifests) {
    for (const [dependency, version] of Object.entries(manifest.dependencies ?? {})) {
      if (bundledPackages.includes(dependency)) continue;
      const existingVersion = dependencies[dependency];
      if (existingVersion && existingVersion !== version) {
        throw new Error(
          `${packageName} requires ${dependency}@${version}, but the staged CLI requires ${existingVersion}.`,
        );
      }
      dependencies[dependency] = version;
    }
  }

  stagedManifest.dependencies = Object.fromEntries(
    Object.entries(dependencies).sort(([left], [right]) => left.localeCompare(right)),
  );
}

try {
  const bundledArchives = new Map(
    bundledPackages.map((packageName) => [packageName, packWorkspace(packageName)]),
  );
  extractPackage(packWorkspace(cliManifest.name), stagingPackage);

  const stagedManifestPath = join(stagingPackage, 'package.json');
  const stagedManifest = JSON.parse(readFileSync(stagedManifestPath, 'utf8'));
  const bundledManifests = new Map();

  for (const packageName of bundledPackages) {
    const target = join(stagingPackage, 'node_modules', ...packageName.split('/'));
    extractPackage(bundledArchives.get(packageName), target);
    bundledManifests.set(
      packageName,
      JSON.parse(readFileSync(join(target, 'package.json'), 'utf8')),
    );
  }

  stagedManifest.version = expectedVersion;
  stagedManifest.bundleDependencies = bundledPackages;
  addBundledRuntimeDependencies(stagedManifest, bundledManifests);
  writeFileSync(stagedManifestPath, `${JSON.stringify(stagedManifest, null, 2)}\n`);

  execFileSync(
    'npm',
    ['install', '--package-lock-only', '--ignore-scripts', '--workspaces=false'],
    { cwd: stagingPackage, stdio: 'inherit' },
  );

  const packOutput = execFileSync(
    'npm',
    ['pack', '--json', '--ignore-scripts', `--pack-destination=${stagingRoot}`],
    {
      cwd: stagingPackage,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    },
  );
  const [packed] = JSON.parse(packOutput);
  const missingPackages = bundledPackages.filter((name) => !packed.bundled.includes(name));
  if (missingPackages.length > 0) {
    throw new Error(`The CLI tarball does not include: ${missingPackages.join(', ')}`);
  }

  console.log(
    `Checked ${cliManifest.name}@${expectedVersion} with ${packed.bundled.length} bundled workspace packages.`,
  );
  execFileSync(
    process.execPath,
    [join(scriptDir, 'smoke-cli-package.mjs'), join(stagingRoot, packed.filename), expectedVersion],
    { cwd: workspaceRoot, stdio: 'inherit' },
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
