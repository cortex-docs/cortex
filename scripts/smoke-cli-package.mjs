#!/usr/bin/env node

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createRequire } from 'node:module';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const archiveArgument = process.argv[2];
const expectedVersion = process.argv[3];
if (!archiveArgument || !/^\d+\.\d+\.\d+$/.test(expectedVersion || '')) {
  throw new Error('Usage: node scripts/smoke-cli-package.mjs <cli-package.tgz> <expected-version>');
}

const archive = isAbsolute(archiveArgument) ? archiveArgument : resolve(archiveArgument);
const smokeRoot = mkdtempSync(join(tmpdir(), 'cortex-cli-smoke-'));
const projectDir = join(smokeRoot, 'project');
const docsOutput = join(projectDir, '.cortex', 'docs-smoke');
const mcpOutput = join(projectDir, '.cortex', 'mcp-smoke');

function run(command, args, cwd, capture = false) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
}

function runCapturedAsync(command, args, cwd) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.once('error', rejectRun);
    child.once('exit', (code, signal) => {
      if (code === 0) resolveRun(stdout);
      else {
        rejectRun(
          new Error(
            `${command} ${args.join(' ')} failed (${signal ? `signal ${signal}` : `exit code ${code ?? 1}`}).\n${stdout}${stderr}`,
          ),
        );
      }
    });
  });
}

function reservePort() {
  return new Promise((resolvePort, reject) => {
    const server = createNetServer();
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

async function waitForPage(url, child, output, expectedText, commandName) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`${commandName} exited early.\n${output()}`);
    }
    let response;
    try {
      response = await fetch(url);
    } catch {}
    if (response) {
      const body = await response.text();
      if (response.ok && body.includes(expectedText)) return;
      if (response.status >= 500) {
        await new Promise((resolveWait) => setTimeout(resolveWait, 250));
        throw new Error(`${commandName} returned HTTP ${response.status}.\n${output()}`);
      }
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Timed out while waiting for ${commandName} at ${url}.\n${output()}`);
}

async function stopProcessGroup(child) {
  if (!child.pid || child.exitCode !== null) return;
  const exited = new Promise((resolveExit) => child.once('exit', resolveExit));
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
  await Promise.race([exited, new Promise((resolveWait) => setTimeout(resolveWait, 5_000))]);
}

function spawnCli(cli, args, cwd) {
  let outputStart = '';
  let outputEnd = '';
  const appendOutput = (chunk) => {
    const text = chunk.toString();
    outputStart = `${outputStart}${text}`.slice(0, 10_000);
    outputEnd = `${outputEnd}${text}`.slice(-10_000);
  };
  const child = spawn(cli, args, {
    cwd,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', appendOutput);
  child.stderr.on('data', appendOutput);
  return {
    child,
    output: () => (outputStart === outputEnd ? outputStart : `${outputStart}\n...\n${outputEnd}`),
  };
}

async function startMissingNpmRegistry() {
  const server = createHttpServer((_request, response) => {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'package not found' }));
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Could not start the local npm registry for the publish E2E test.');
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolveClose, rejectClose) =>
        server.close((error) => {
          if (error) rejectClose(error);
          else resolveClose();
        }),
      ),
  };
}

function assertHelp(cli, args, expectedText) {
  const output = run(cli, [...args, '--help'], smokeRoot, true);
  if (!output.includes(expectedText)) {
    throw new Error(`Command help is missing for cortex ${args.join(' ')}.`);
  }
}

async function verifyGeneratedMcp() {
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], mcpOutput);
  run('npm', ['run', 'build'], mcpOutput);

  const generatedRequire = createRequire(join(mcpOutput, 'package.json'));
  const { Client } = await import(
    pathToFileURL(generatedRequire.resolve('@modelcontextprotocol/sdk/client/index.js')).href
  );
  const { StdioClientTransport } = await import(
    pathToFileURL(generatedRequire.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(mcpOutput, 'dist', 'main.js')],
    cwd: mcpOutput,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'cortex-cli-package-e2e', version: '1.0.0' });
  try {
    await client.connect(transport);
    const result = await client.listTools();
    if (result.tools.length === 0) {
      throw new Error('The MCP server generated by the packaged CLI exposed no tools.');
    }
  } finally {
    await client.close();
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

  for (const [args, expectedText] of [
    [['init'], 'Initialize a Cortex project'],
    [['validate'], 'Validate the Cortex config'],
    [['generate'], 'Regenerate SDKs'],
    [['publish'], 'Build and publish generated SDKs'],
    [['docs'], 'API documentation commands'],
    [['docs', 'serve'], 'Start a local API docs server'],
    [['docs', 'build'], 'Build production API documentation'],
    [['docs', 'start'], 'Start a production Cortex Docs build'],
    [['mcp'], 'MCP server commands'],
    [['mcp', 'generate'], 'Generate an MCP server'],
    [['generators'], 'Custom generator template commands'],
    [['generators', 'export'], 'Export installed generator templates'],
  ]) {
    assertHelp(cli, args, expectedText);
  }

  run(cli, ['init', 'registry-smoke'], projectDir);
  run(cli, ['validate'], projectDir);
  run(cli, ['generate', '--dry-run'], projectDir);
  run(cli, ['generate', '--language', 'typescript', '--no-mcp'], projectDir);
  const sdkOutput = join(
    projectDir,
    'generated',
    'typescript',
    'registry-smoke-typescript-client-sdk',
  );
  if (!existsSync(join(sdkOutput, 'package.json'))) {
    throw new Error('cortex generate did not create the TypeScript SDK package.');
  }
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], sdkOutput);
  run('npm', ['run', 'build'], sdkOutput);

  run(cli, ['mcp', 'generate', '--output', mcpOutput], projectDir);
  await verifyGeneratedMcp();

  run(
    cli,
    ['generators', 'export', '--language', 'typescript', '--output', 'cortex-templates'],
    projectDir,
  );
  if (!existsSync(join(projectDir, 'cortex-templates', 'languages', 'typescript', 'index.ejs'))) {
    throw new Error('cortex generators export did not create the TypeScript templates.');
  }

  const registry = await startMissingNpmRegistry();
  try {
    const publishOutput = await runCapturedAsync(
      cli,
      ['publish', '--dry-run', '--sdk', 'typescript', '--registry', registry.url],
      projectDir,
    );
    if (!publishOutput.includes('Publish plan complete. No packages were uploaded.')) {
      throw new Error('cortex publish --dry-run did not produce a successful publish plan.');
    }
  } finally {
    await registry.close();
  }

  const servePort = await reservePort();
  const docsServe = spawnCli(cli, ['docs', 'serve', '--port', String(servePort)], projectDir);
  try {
    await waitForPage(
      `http://127.0.0.1:${servePort}/docs/quickstart`,
      docsServe.child,
      docsServe.output,
      'Getting Started',
      'cortex docs serve',
    );
  } finally {
    await stopProcessGroup(docsServe.child);
  }

  run(cli, ['docs', 'build', '--output', docsOutput], projectDir);

  if (!existsSync(join(docsOutput, '.cortex-docs-build.json'))) {
    throw new Error('cortex docs build did not create its production manifest.');
  }

  const port = await reservePort();
  const docsStart = spawnCli(
    cli,
    ['docs', 'start', '--output', docsOutput, '--port', String(port)],
    projectDir,
  );
  try {
    await waitForPage(
      `http://127.0.0.1:${port}/docs/quickstart`,
      docsStart.child,
      docsStart.output,
      'Getting Started',
      'cortex docs start',
    );
  } finally {
    await stopProcessGroup(docsStart.child);
  }

  console.log(
    `E2E-tested ${expectedVersion}: every CLI command, generated SDK and MCP, publish planning, and docs runtimes.`,
  );
} finally {
  rmSync(smokeRoot, { recursive: true, force: true });
}
