#!/usr/bin/env node

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

const archiveArgument = process.argv[2];
const expectedVersion = process.argv[3];
if (!archiveArgument || !/^\d+\.\d+\.\d+$/.test(expectedVersion || '')) {
  throw new Error('Usage: node scripts/smoke-cli-package.mjs <cli-package.tgz> <expected-version>');
}

const archive = isAbsolute(archiveArgument) ? archiveArgument : resolve(archiveArgument);
const smokeRoot = mkdtempSync(join(tmpdir(), 'cortex-cli-smoke-'));
const projectDir = join(smokeRoot, 'project');
const docsOutput = join(projectDir, '.cortex', 'docs-smoke');

function run(command, args, cwd, capture = false) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
}

function reservePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not reserve a local port for the docs smoke test.'));
        return;
      }
      server.close((error) => {
        if (error) reject(error);
        else resolvePort(address.port);
      });
    });
  });
}

async function waitForDocs(url, child, output) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`cortex docs start exited early.\n${output()}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok && (await response.text()).includes('Getting Started')) return;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Timed out while waiting for ${url}.\n${output()}`);
}

function stopProcessGroup(child) {
  if (!child.pid || child.exitCode !== null) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}

try {
  writeFileSync(
    join(smokeRoot, 'package.json'),
    `${JSON.stringify({ name: 'cortex-cli-smoke', version: '1.0.0', private: true }, null, 2)}\n`,
  );
  mkdirSync(projectDir);

  run(
    'npm',
    ['install', archive, '--save-exact', '--ignore-scripts', '--no-audit', '--no-fund'],
    smokeRoot,
  );
  const cli = join(smokeRoot, 'node_modules', '.bin', 'cortex');
  const help = run(cli, ['--help'], smokeRoot, true);
  const version = run(cli, ['--version'], smokeRoot, true).trim();
  if (!help.includes('Usage: cortex') || version !== expectedVersion) {
    throw new Error(`Unexpected CLI identity. Version: ${version}`);
  }

  run(cli, ['init', 'registry-smoke'], projectDir);
  run(cli, ['validate'], projectDir);
  run(cli, ['generate', '--dry-run'], projectDir);
  run(cli, ['generate', '--language', 'typescript', '--no-mcp'], projectDir);
  run(cli, ['mcp', 'generate', '--output', '.cortex/mcp-smoke'], projectDir);
  run(
    cli,
    ['generators', 'export', '--language', 'typescript', '--output', 'cortex-templates'],
    projectDir,
  );
  run(cli, ['docs', 'build', '--output', docsOutput], projectDir);

  if (!existsSync(join(docsOutput, '.cortex-docs-build.json'))) {
    throw new Error('cortex docs build did not create its production manifest.');
  }

  const port = await reservePort();
  let serverOutput = '';
  const docsProcess = spawn(
    cli,
    ['docs', 'start', '--output', docsOutput, '--port', String(port)],
    {
      cwd: projectDir,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  docsProcess.stdout.on('data', (chunk) => {
    serverOutput += chunk.toString();
  });
  docsProcess.stderr.on('data', (chunk) => {
    serverOutput += chunk.toString();
  });
  try {
    await waitForDocs(`http://127.0.0.1:${port}/docs/quickstart`, docsProcess, () => serverOutput);
  } finally {
    stopProcessGroup(docsProcess);
  }

  console.log(`Smoke-tested ${expectedVersion}: install, generate, MCP, templates, and docs.`);
} finally {
  rmSync(smokeRoot, { recursive: true, force: true });
}
