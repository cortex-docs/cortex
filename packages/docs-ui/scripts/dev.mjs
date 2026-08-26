#!/usr/bin/env node

import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, watch, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_UI_DIR = resolve(__dirname, '..');
const WORKSPACE_ROOT = resolve(DOCS_UI_DIR, '..', '..');
const TEST_PROJECT_DIR = join(WORKSPACE_ROOT, 'test-project');
const CLI_MAIN = join(WORKSPACE_ROOT, 'packages', 'cli', 'dist', 'main.js');
const WRANGLER_BIN = join(WORKSPACE_ROOT, 'node_modules', '.bin', 'wrangler');
const DEMO_API_CONFIG = join(WORKSPACE_ROOT, 'packages', 'demo-api', 'wrangler.jsonc');

const PORT = process.env.PORT || '3012';
const MOCK_PORT = process.env.MOCK_PORT || '4010';
const MOCK_START_TIMEOUT_MS = 15_000;

function log(tag, msg) {
  const color =
    { dev: '35', init: '33', generate: '32', mock: '34', next: '36', watch: '90', build: '33' }[
      tag
    ] || '0';
  console.log(`\x1b[${color}m[${tag}]\x1b[0m ${msg}`);
}

function logError(tag, msg) {
  console.error(`\x1b[31m[${tag}]\x1b[0m ${msg}`);
}

function ensureBuild() {
  if (existsSync(CLI_MAIN)) return;
  log('build', 'CLI not built yet. Running npm run build...');
  execSync('npm run build', { cwd: WORKSPACE_ROOT, stdio: 'inherit' });
}

function initTestProject() {
  const configPath = join(TEST_PROJECT_DIR, 'cortex.config.yml');
  if (existsSync(configPath)) {
    log('init', 'test-project already initialized');
  } else {
    log('init', 'Initializing test-project via cortex init...');
    mkdirSync(TEST_PROJECT_DIR, { recursive: true });

    execSync(`node "${CLI_MAIN}" init Petstore`, {
      cwd: TEST_PROJECT_DIR,
      stdio: 'inherit',
    });
  }

  const apiUrl = `http://localhost:${MOCK_PORT}`;
  const websocketUrl = `ws://localhost:${MOCK_PORT}/ws`;
  const specPath = join(TEST_PROJECT_DIR, 'petstore.yaml');
  const nestedSpecPath = join(TEST_PROJECT_DIR, 'specs', 'petstore.yaml');
  for (const candidate of [specPath, nestedSpecPath]) {
    if (!existsSync(candidate)) continue;
    const specContent = readFileSync(candidate, 'utf-8');
    writeFileSync(
      candidate,
      specContent.replace(/url:\s*https?:\/\/[^\n]+/, `url: ${apiUrl}`),
      'utf-8',
    );
  }

  const asyncApiPath = join(TEST_PROJECT_DIR, 'specs', 'chat-asyncapi.yaml');
  if (existsSync(asyncApiPath)) {
    const content = readFileSync(asyncApiPath, 'utf-8');
    writeFileSync(
      asyncApiPath,
      content.replace(/url:\s*wss?:\/\/[^\n]+/, `url: ${websocketUrl}`),
      'utf-8',
    );
  }

  const restIntroPath = join(TEST_PROJECT_DIR, 'docs', 'REST_INTRO.md');
  if (existsSync(restIntroPath)) {
    const content = readFileSync(restIntroPath, 'utf-8');
    writeFileSync(
      restIntroPath,
      content.replace(/(## Base URL\s+```(?:\w+)?\s*)https?:\/\/[^\s`]+/, `$1${apiUrl}`),
      'utf-8',
    );
  }

  const openRpcPath = join(TEST_PROJECT_DIR, 'specs', 'petstore-openrpc.json');
  if (existsSync(openRpcPath)) {
    const document = JSON.parse(readFileSync(openRpcPath, 'utf-8'));
    document.servers = [{ url: `${apiUrl}/rpc` }];
    writeFileSync(openRpcPath, `${JSON.stringify(document, null, 2)}\n`, 'utf-8');
  }

  let configContent = readFileSync(configPath, 'utf-8').replace(
    /endpoint:\s*https?:\/\/[^\n]+\/graphql/,
    `endpoint: ${apiUrl}/graphql`,
  );
  configContent = configContent.replace(
    /( {2}- title: gRPC\n {4}type: grpc-spec\n {4}spec: [^\n]+\n)(?: {4}try_now_url: [^\n]+\n)?/,
    `$1    try_now_url: ${apiUrl}\n`,
  );
  if (!configContent.includes('\ncustom_head_html:')) {
    configContent = configContent.replace(
      /^home:/m,
      [
        'custom_head_html: |-',
        '  <meta name="theme-color" content="#ffffff">',
        '  <link rel="stylesheet" href="/assets/custom.css">',
        "  <script>document.documentElement.dataset.cortexCustomHead = 'loaded';</script>",
        'home:',
      ].join('\n'),
    );
  }
  writeFileSync(configPath, configContent, 'utf-8');
  mkdirSync(join(TEST_PROJECT_DIR, 'assets'), { recursive: true });
  writeFileSync(
    join(TEST_PROJECT_DIR, 'assets', 'custom.css'),
    ':root { --cortex-custom-head-loaded: yes; }\n',
    'utf-8',
  );
  log('init', `Configured demo endpoints for ${apiUrl}`);
}

function runGenerate() {
  log('generate', 'Running cortex generate...');
  try {
    execSync(`node "${CLI_MAIN}" generate`, {
      cwd: TEST_PROJECT_DIR,
      stdio: 'inherit',
    });
    log('generate', 'Complete');
  } catch {
    logError('generate', 'Generation failed (see output above)');
  }
}

function isPortInUse(port) {
  return new Promise((resolvePort) => {
    const socket = connect({ host: '127.0.0.1', port: Number(port) });
    const finish = (inUse) => {
      socket.destroy();
      resolvePort(inUse);
    };
    socket.setTimeout(500);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function isMockHealthy() {
  try {
    const response = await fetch(`http://127.0.0.1:${MOCK_PORT}/health`, {
      signal: AbortSignal.timeout(750),
    });
    if (!response.ok) return false;
    const body = await response.json();
    return body?.status === 'ok';
  } catch {
    return false;
  }
}

function waitForMockHealth(proc) {
  return new Promise((resolveHealth, rejectHealth) => {
    const startedAt = Date.now();
    let timer;
    let finished = false;

    const finish = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      proc.off('exit', onExit);
      proc.off('error', onError);
      if (error) rejectHealth(error);
      else resolveHealth();
    };

    const onExit = (code, signal) => {
      finish(
        new Error(
          `Demo API Worker stopped before it became healthy (${signal ? `signal ${signal}` : `exit code ${code ?? 1}`}).`,
        ),
      );
    };
    const onError = (error) =>
      finish(new Error(`Failed to start the demo API Worker: ${error.message}`));

    const check = async () => {
      if (await isMockHealthy()) {
        finish();
        return;
      }
      if (Date.now() - startedAt >= MOCK_START_TIMEOUT_MS) {
        finish(
          new Error(
            `Demo API Worker did not become healthy within ${MOCK_START_TIMEOUT_MS / 1000}s.`,
          ),
        );
        return;
      }
      timer = setTimeout(check, 100);
    };

    proc.once('exit', onExit);
    proc.once('error', onError);
    void check();
  });
}

function signalProcess(proc, signal, processGroup = false) {
  if (!proc?.pid || proc.exitCode !== null || proc.signalCode !== null) return;
  try {
    process.kill(processGroup ? -proc.pid : proc.pid, signal);
  } catch {}
}

function stopProcess(proc, processGroup = false) {
  if (!proc?.pid || proc.exitCode !== null || proc.signalCode !== null) return Promise.resolve();
  return new Promise((resolveStop) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(forceTimer);
      clearTimeout(giveUpTimer);
      resolveStop();
    };
    proc.once('exit', finish);
    signalProcess(proc, 'SIGTERM', processGroup);
    const forceTimer = setTimeout(() => signalProcess(proc, 'SIGKILL', processGroup), 1000);
    const giveUpTimer = setTimeout(finish, 1500);
  });
}

async function startDemoApiWorker() {
  const httpInUse = await isPortInUse(MOCK_PORT);

  if (httpInUse) {
    if (await isMockHealthy()) {
      log('mock', `Demo API Worker is already healthy on :${MOCK_PORT}; reusing it`);
      return null;
    }
    throw new Error(`HTTP :${MOCK_PORT} is in use. Stop that process or set MOCK_PORT.`);
  }

  log('mock', `Starting the demo API with the Cloudflare Workers runtime on :${MOCK_PORT}...`);
  const proc = spawn(WRANGLER_BIN, ['dev', '--config', DEMO_API_CONFIG, '--port', MOCK_PORT], {
    cwd: WORKSPACE_ROOT,
    env: process.env,
    detached: false,
    stdio: 'pipe',
  });
  proc.stdout.on('data', (d) => {
    for (const line of d.toString().split('\n').filter(Boolean)) {
      log('mock', line);
    }
  });
  proc.stderr.on('data', (d) => {
    for (const line of d.toString().split('\n').filter(Boolean)) {
      logError('mock', line);
    }
  });
  proc.on('exit', (code) => {
    if (code && code !== 0) logError('mock', `Exited with code ${code}`);
  });
  proc.on('error', (err) => logError('mock', `Failed to start: ${err.message}`));
  try {
    await waitForMockHealth(proc);
  } catch (error) {
    await stopProcess(proc);
    throw error;
  }
  log('mock', `Demo API Worker is healthy on :${MOCK_PORT}`);
  return proc;
}

function startDocsServe() {
  log('serve', `Starting cortex docs serve on http://localhost:${PORT}`);
  const proc = spawn('node', [CLI_MAIN, 'docs', 'serve', '--port', PORT], {
    cwd: TEST_PROJECT_DIR,
    env: {
      ...process.env,
      NEXT_PUBLIC_CORTEX_BUILT_WITH_LOGO_URL:
        process.env.NEXT_PUBLIC_CORTEX_BUILT_WITH_LOGO_URL ||
        process.env.NEXT_PUBLIC_CORTEX_BUILT_BY_LOGO_URL ||
        process.env.NEXT_PUBLIC_CORTEX_BUILT_BY_BADGE_URL ||
        `http://localhost:${MOCK_PORT}/images/built-with-cortex.svg`,
    },
    detached: false,
    stdio: 'inherit',
  });
  proc.on('exit', (code) => {
    if (code && code !== 0) logError('serve', `Exited with code ${code}`);
  });
  return proc;
}

function watchPackageSources(onChange) {
  let sourceTimer = null;
  const packagesDir = join(WORKSPACE_ROOT, 'packages');
  const excludedPackages = new Set(['docs-site', 'docs-ui']);
  const packageNames = readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !excludedPackages.has(entry.name))
    .map((entry) => entry.name);
  const watchers = packageNames.map((packageName) => {
    const watcher = watch(
      join(packagesDir, packageName),
      { recursive: true },
      (_event, filename) => {
        if (!filename) return;
        if (
          filename.includes('/dist/') ||
          filename.startsWith('dist/') ||
          filename.includes('/node_modules/') ||
          filename.startsWith('node_modules/') ||
          filename.includes('/coverage/') ||
          filename.startsWith('coverage/') ||
          filename.includes('/.wrangler/') ||
          filename.startsWith('.wrangler/') ||
          filename.includes('/.next/') ||
          filename.startsWith('.next/') ||
          filename.includes('/generated/') ||
          filename.startsWith('generated/')
        )
          return;
        if (!/\.(ts|tsx|js|jsx|ejs|json)$/.test(filename)) return;

        clearTimeout(sourceTimer);
        sourceTimer = setTimeout(() => {
          log('watch', `Source changed: packages/${packageName}/${filename}`);
          onChange();
        }, 1000);
      },
    );
    watcher.on('error', (error) => {
      logError('watch', `Could not watch packages/${packageName}: ${error.message}`);
    });
    return watcher;
  });
  log('watch', 'Watching packages/ source (excluding dist, docs-ui, docs-site)');
  return () => {
    clearTimeout(sourceTimer);
    for (const watcher of watchers) watcher.close();
  };
}

function rebuildLibraries() {
  log('build', 'Rebuilding library packages...');
  try {
    execSync(
      'npx turbo build --only --filter=@cortex-docs/core --filter=@cortex-docs/codegen --filter=@cortex-docs/mcp-gen --filter=@cortex-docs/cli',
      { cwd: WORKSPACE_ROOT, stdio: 'inherit' },
    );
    log('build', 'Rebuild complete');
  } catch {
    logError('build', 'Rebuild failed (see output above)');
  }
}

async function main() {
  console.log('');
  log('dev', '========================================');
  log('dev', '  Cortex Docs UI — Development Server');
  log('dev', '========================================');
  log('dev', `Workspace: ${WORKSPACE_ROOT}`);
  log('dev', `Test project: ${TEST_PROJECT_DIR}`);
  log('dev', `Docs UI: http://localhost:${PORT}`);
  log('dev', `Mock API: http://localhost:${MOCK_PORT}`);
  console.log('');

  ensureBuild();
  initTestProject();
  runGenerate();

  let shuttingDown = false;
  const mockProc = await startDemoApiWorker();
  const ownsMockProcess = mockProc !== null;
  const serveProc = startDocsServe();

  const stopWatching = watchPackageSources(() => {
    rebuildLibraries();
    runGenerate();
  });

  console.log('');
  log('dev', 'Ready. Press Ctrl+C to stop all processes.');
  console.log('');

  async function cleanup() {
    if (shuttingDown) return;
    shuttingDown = true;
    log('dev', 'Shutting down...');
    stopWatching();
    await Promise.all([
      stopProcess(serveProc, false),
      ownsMockProcess ? stopProcess(mockProc, false) : Promise.resolve(),
    ]);
    process.exit(0);
  }

  process.once('SIGINT', () => {
    void cleanup();
  });
  process.once('SIGTERM', () => {
    void cleanup();
  });
  process.once('SIGHUP', () => {
    void cleanup();
  });
  process.on('exit', () => {
    signalProcess(serveProc, 'SIGTERM', false);
    signalProcess(mockProc, 'SIGTERM', false);
  });

  await new Promise(() => {});
}

main().catch((err) => {
  logError('dev', err.message);
  process.exit(1);
});
