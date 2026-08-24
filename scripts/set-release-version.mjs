#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const publishedArgument = process.argv.find((argument) => argument.startsWith('--published='));
const checkOnly = process.argv.includes('--check');
const publishedVersion = publishedArgument?.slice('--published='.length).trim();

function parseVersion(value, label) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value || '');
  if (!match)
    throw new Error(`${label} must use the x.x.x format. Received: ${value || '(empty)'}`);
  return match.slice(1).map(Number);
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function readManifest(name) {
  const path = resolve(`packages/${name}/package.json`);
  return { path, value: JSON.parse(readFileSync(path, 'utf8')) };
}

const cli = readManifest('cli');
const docsSite = readManifest('docs-site');
const current = parseVersion(cli.value.version, 'The current CLI version');
let base = current;
if (publishedVersion) {
  const published = parseVersion(publishedVersion, 'The published CLI version');
  if (compareVersions(published, base) > 0) base = published;
}
const nextVersion = `${base[0]}.${base[1]}.${base[2] + 1}`;

if (!checkOnly) {
  cli.value.version = nextVersion;
  docsSite.value.version = nextVersion;
  docsSite.value.dependencies['@cortex-docs/cli'] = nextVersion;
  writeFileSync(cli.path, `${JSON.stringify(cli.value, null, 2)}\n`, 'utf8');
  writeFileSync(docsSite.path, `${JSON.stringify(docsSite.value, null, 2)}\n`, 'utf8');
}

if (process.env.GITHUB_OUTPUT && !checkOnly) {
  writeFileSync(process.env.GITHUB_OUTPUT, `version=${nextVersion}\n`, { flag: 'a' });
}
console.log(nextVersion);
