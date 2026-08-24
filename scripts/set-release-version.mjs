#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const publicPackages = ['core', 'codegen', 'mcp-gen', 'docs-ui', 'cli'];
const versionedPackages = [...publicPackages, 'docs-site'];
const publishedArgument = process.argv.find((argument) => argument.startsWith('--published='));
const checkOnly = process.argv.includes('--check');
const publishedVersion = publishedArgument?.slice('--published='.length).trim();

function parseVersion(value, label) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value || '');
  if (!match) throw new Error(`${label} must use the x.x.x format. Received: ${value || '(empty)'}`);
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

const manifests = new Map(versionedPackages.map((name) => [name, readManifest(name)]));
const currentVersions = publicPackages.map((name) => manifests.get(name).value.version);
if (new Set(currentVersions).size !== 1) {
  throw new Error(`Public package versions differ: ${currentVersions.join(', ')}`);
}

const current = parseVersion(currentVersions[0], 'The current package version');
let base = current;
if (publishedVersion) {
  const published = parseVersion(publishedVersion, 'The published CLI version');
  if (compareVersions(published, base) > 0) base = published;
}
const nextVersion = `${base[0]}.${base[1]}.${base[2] + 1}`;

if (!checkOnly) {
  const publicNames = new Set(publicPackages.map((name) => `@cortex/${name}`));
  for (const { path, value } of manifests.values()) {
    value.version = nextVersion;
    for (const dependencyType of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      const dependencies = value[dependencyType];
      if (!dependencies) continue;
      for (const dependencyName of Object.keys(dependencies)) {
        if (publicNames.has(dependencyName)) dependencies[dependencyName] = nextVersion;
      }
    }
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  }
}

if (process.env.GITHUB_OUTPUT && !checkOnly) {
  writeFileSync(process.env.GITHUB_OUTPUT, `version=${nextVersion}\n`, { flag: 'a' });
}
console.log(nextVersion);
