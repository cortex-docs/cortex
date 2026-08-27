#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const databaseName = 'cortex-badge-referrers';
const databaseBinding = 'BADGE_REFERRERS';
const databaseIdPlaceholder = '00000000-0000-0000-0000-000000000000';
const verificationHostname = 'docs.cortexdocs.dev';
const badgeUrl = 'https://static.cortexdocs.dev/images/built-with-cortex.svg';
const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, '..');
const sourceConfigPath = join(packageDir, 'wrangler.static.jsonc');
const productionConfigPath = join(packageDir, 'wrangler.static.production.jsonc');
const require = createRequire(import.meta.url);
const wranglerPackagePath = require.resolve('wrangler/package.json');
const wranglerPackage = require(wranglerPackagePath);
const wranglerCli = resolve(dirname(wranglerPackagePath), wranglerPackage.bin.wrangler);

function run(args, { capture = false } = {}) {
  return new Promise((resolveCommand, rejectCommand) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(process.execPath, [wranglerCli, ...args], {
      cwd: packageDir,
      env: { ...process.env, CI: process.env.CI || 'true' },
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });

    if (capture) {
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
    }

    child.once('error', rejectCommand);
    child.once('exit', (code, signal) => {
      if (signal) {
        rejectCommand(new Error(`Wrangler stopped with signal ${signal}.`));
      } else if (code !== 0) {
        rejectCommand(
          new Error(
            `Wrangler ${args.join(' ')} failed with code ${code}.${stderr ? `\n${stderr}` : ''}`,
          ),
        );
      } else {
        resolveCommand({ stdout, stderr });
      }
    });
  });
}

async function listDatabases() {
  const { stdout } = await run(['d1', 'list', '--json'], { capture: true });
  const databases = JSON.parse(stdout);
  if (!Array.isArray(databases)) throw new Error('Wrangler returned an invalid D1 database list.');
  return databases;
}

async function findOrCreateDatabase() {
  let database = (await listDatabases()).find((candidate) => candidate.name === databaseName);
  if (database) return database;

  console.log(`Creating the ${databaseName} production D1 database.`);
  await run(['d1', 'create', databaseName, '--location', 'eeur']);

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    database = (await listDatabases()).find((candidate) => candidate.name === databaseName);
    if (database) return database;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 1000));
  }

  throw new Error(`The ${databaseName} database was created but could not be listed.`);
}

async function writeProductionConfig(databaseId) {
  const source = await readFile(sourceConfigPath, 'utf8');
  if (!source.includes(databaseIdPlaceholder)) {
    throw new Error('The static Wrangler configuration is missing its D1 database placeholder.');
  }
  await writeFile(productionConfigPath, source.replace(databaseIdPlaceholder, databaseId));
}

async function countVerificationHostname() {
  const query = [
    'SELECT COUNT(*) AS records',
    'FROM badge_referrer_hosts',
    `WHERE hostname = '${verificationHostname}'`,
  ].join(' ');
  const { stdout } = await run(
    [
      'd1',
      'execute',
      databaseBinding,
      '--remote',
      '--json',
      '--config',
      productionConfigPath,
      '--command',
      query,
    ],
    { capture: true },
  );
  const results = JSON.parse(stdout);
  return Number(results?.[0]?.results?.[0]?.records ?? 0);
}

async function verifyDeployment() {
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const first = await fetch(badgeUrl, {
      headers: { Referer: `https://${verificationHostname}/` },
    });
    const second = await fetch(badgeUrl, {
      headers: { Referer: `https://${verificationHostname}/` },
    });
    if (first.ok && second.ok && (await countVerificationHostname()) === 1) {
      console.log('Static badge deployment and referrer deduplication verified.');
      return;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 1000));
  }

  throw new Error('The static badge deployment did not record exactly one referrer hostname.');
}

try {
  await mkdir(dirname(productionConfigPath), { recursive: true });
  const database = await findOrCreateDatabase();
  if (!database.uuid) throw new Error(`The ${databaseName} database does not have an ID.`);
  await writeProductionConfig(database.uuid);
  await run([
    'd1',
    'migrations',
    'apply',
    databaseBinding,
    '--remote',
    '--config',
    productionConfigPath,
  ]);
  await run(['deploy', '--config', productionConfigPath]);
  await verifyDeployment();
} finally {
  await rm(productionConfigPath, { force: true });
}
