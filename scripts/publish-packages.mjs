#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const expectedVersion = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(expectedVersion || '')) {
  throw new Error('Usage: node scripts/publish-packages.mjs <version>');
}

const packages = ['core', 'codegen', 'mcp-gen', 'docs-ui', 'cli'];
for (const workspace of packages) {
  const manifest = JSON.parse(readFileSync(`packages/${workspace}/package.json`, 'utf8'));
  if (manifest.version !== expectedVersion) {
    throw new Error(`${manifest.name} has version ${manifest.version}. Expected ${expectedVersion}.`);
  }

  try {
    execFileSync('npm', ['view', `${manifest.name}@${expectedVersion}`, 'version'], {
      stdio: 'ignore',
    });
    console.log(`Skipping ${manifest.name}@${expectedVersion}. It is already published.`);
    continue;
  } catch {}

  console.log(`Publishing ${manifest.name}@${expectedVersion}...`);
  execFileSync(
    'npm',
    ['publish', `--workspace=${manifest.name}`, '--access=public', '--provenance'],
    { stdio: 'inherit' },
  );
}
