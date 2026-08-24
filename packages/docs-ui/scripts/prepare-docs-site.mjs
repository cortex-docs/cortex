#!/usr/bin/env node

import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const docsUiDir = resolve(scriptDir, '..');
const workspaceRoot = resolve(docsUiDir, '..', '..');
const defaultSourceDir = join(workspaceRoot, 'packages', 'docs-site');
const defaultTargetDir = join(docsUiDir, '.cortex-docs-site');

export function prepareDocsSite(sourceDir = defaultSourceDir, targetDir = defaultTargetDir) {
  rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(targetDir, { recursive: true });

  cpSync(join(sourceDir, 'cortex.config.yml'), join(targetDir, 'cortex.config.yml'));
  cpSync(join(sourceDir, 'docs'), join(targetDir, 'docs'), { recursive: true });
  cpSync(join(sourceDir, 'assets'), join(targetDir, 'assets'), { recursive: true });

  return {
    siteDir: targetDir,
    configPath: join(targetDir, 'cortex.config.yml'),
    logoPath: join(targetDir, 'assets', 'logo_light.svg'),
    faviconPath: join(targetDir, 'assets', 'favicon.svg'),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const prepared = prepareDocsSite();
  console.log(`Prepared the product docs at ${prepared.siteDir}`);
}
