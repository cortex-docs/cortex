#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version || '')) {
  throw new Error('Usage: node scripts/extract-release-notes.mjs <version>');
}

const changelog = readFileSync('CHANGELOG.md', 'utf8');
const heading = `## [${version}] - `;
const headingIndex = changelog.indexOf(heading);

if (headingIndex < 0) {
  throw new Error(`CHANGELOG.md does not contain release ${version}.`);
}

const bodyStart = changelog.indexOf('\n', headingIndex);
const nextHeading = changelog.indexOf('\n## ', bodyStart + 1);
const body = changelog.slice(bodyStart + 1, nextHeading < 0 ? undefined : nextHeading).trim();

if (!body.startsWith('### New Features')) {
  throw new Error(`Release ${version} does not start with the New Features section.`);
}

process.stdout.write(`${body}\n`);
