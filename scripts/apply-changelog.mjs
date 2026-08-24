#!/usr/bin/env node

import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version || '')) {
  throw new Error('Usage: node scripts/apply-changelog.mjs <version>');
}

const notesPath = '.release-notes.md';
const notes = readFileSync(notesPath, 'utf8').trim();
const sectionNames = ['New Features', 'Bug Fixes', 'Improvements'];
let previousIndex = -1;
for (const sectionName of sectionNames) {
  const heading = `### ${sectionName}`;
  const index = notes.indexOf(heading);
  if (index <= previousIndex) throw new Error(`The release notes must contain ${heading} in order.`);
  const nextHeading = notes.indexOf('\n### ', index + heading.length);
  const body = notes.slice(index + heading.length, nextHeading < 0 ? undefined : nextHeading).trim();
  if (!body.split('\n').some((line) => line.startsWith('- '))) {
    throw new Error(`${heading} must contain at least one bullet.`);
  }
  previousIndex = index;
}
if (!notes.startsWith('### New Features') || /^#{1,2}\s/m.test(notes)) {
  throw new Error('The release notes contain an unexpected title or version heading.');
}

const changelogPath = 'CHANGELOG.md';
const changelog = readFileSync(changelogPath, 'utf8');
const unreleasedHeading = '## Unreleased';
const unreleasedIndex = changelog.indexOf(unreleasedHeading);
if (unreleasedIndex < 0) throw new Error('CHANGELOG.md does not contain an Unreleased section.');
const nextReleaseIndex = changelog.indexOf('\n## [', unreleasedIndex);
const prefix = changelog.slice(0, unreleasedIndex).trimEnd();
const priorReleases = nextReleaseIndex < 0 ? '' : changelog.slice(nextReleaseIndex).trim();
const date = new Date().toISOString().slice(0, 10);
const resetUnreleased = `## Unreleased\n\n### New Features\n\n- None.\n\n### Bug Fixes\n\n- None.\n\n### Improvements\n\n- None.`;
const release = `## [${version}] - ${date}\n\n${notes}`;

writeFileSync(
  changelogPath,
  `${prefix}\n\n${resetUnreleased}\n\n${release}${priorReleases ? `\n\n${priorReleases}` : ''}\n`,
  'utf8',
);
unlinkSync(notesPath);
try {
  unlinkSync('.changelog-prompt.txt');
} catch {}
