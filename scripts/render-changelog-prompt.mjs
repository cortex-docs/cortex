#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const [version, commitRange] = process.argv.slice(2);
if (!version || !commitRange) {
  throw new Error('Usage: node scripts/render-changelog-prompt.mjs <version> <commit-range>');
}

const template = readFileSync('.github/prompts/changelog.md', 'utf8');
process.stdout.write(
  template.replaceAll('{{VERSION}}', version).replaceAll('{{COMMIT_RANGE}}', commitRange),
);
