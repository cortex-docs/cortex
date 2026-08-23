#!/usr/bin/env node

import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, watch, readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { resolve, join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_UI_DIR = resolve(__dirname, '..');
const WORKSPACE_ROOT = resolve(DOCS_UI_DIR, '..', '..');
const TEST_PROJECT_DIR = join(WORKSPACE_ROOT, 'test-project');
const MOCK_SERVER_PATH = join(WORKSPACE_ROOT, 'e2e', 'docker', 'mock-server.js');
const CLI_MAIN = join(WORKSPACE_ROOT, 'packages', 'cli', 'dist', 'main.js');

const PORT = process.env.PORT || '3012';
const MOCK_PORT = process.env.MOCK_PORT || '4010';
const GRPC_PORT = process.env.GRPC_PORT || '50051';

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
    return;
  }

  log('init', 'Initializing test-project via cortex init...');
  mkdirSync(TEST_PROJECT_DIR, { recursive: true });

  execSync(`node "${CLI_MAIN}" init Petstore`, {
    cwd: TEST_PROJECT_DIR,
    stdio: 'inherit',
  });

  // Dev-only: patch server URL to point to local mock
  const specPath = join(TEST_PROJECT_DIR, 'petstore.yaml');
  if (existsSync(specPath)) {
    const specContent = readFileSync(specPath, 'utf-8');
    writeFileSync(
      specPath,
      specContent.replace(/url:\s*https?:\/\/[^\n]+/, `url: http://localhost:${MOCK_PORT}`),
      'utf-8',
    );
    log('init', `Patched petstore.yaml server URL → http://localhost:${MOCK_PORT}`);
  }
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

async function startMockServer() {
  const [httpInUse, grpcInUse] = await Promise.all([
    isPortInUse(MOCK_PORT),
    isPortInUse(GRPC_PORT),
  ]);

  if (httpInUse || grpcInUse) {
    if (httpInUse && grpcInUse && (await isMockHealthy())) {
      log(
        'mock',
        `Mock server is already healthy on :${MOCK_PORT} (gRPC :${GRPC_PORT}); reusing it`,
      );
      return null;
    }
    const occupied = [
      httpInUse ? `HTTP :${MOCK_PORT}` : null,
      grpcInUse ? `gRPC :${GRPC_PORT}` : null,
    ]
      .filter(Boolean)
      .join(' and ');
    throw new Error(
      `${occupied} already in use by another process. Stop it or set MOCK_PORT/GRPC_PORT.`,
    );
  }

  log('mock', `Starting mock server on :${MOCK_PORT} (gRPC :${GRPC_PORT})...`);
  const proc = spawn('node', [MOCK_SERVER_PATH], {
    cwd: WORKSPACE_ROOT,
    env: { ...process.env, MOCK_PORT, GRPC_PORT },
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
  return proc;
}

function startDocsServe() {
  log('serve', `Starting cortex docs serve on http://localhost:${PORT}`);
  const proc = spawn('node', [CLI_MAIN, 'docs', 'serve', '--port', PORT], {
    cwd: TEST_PROJECT_DIR,
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
  const watcher = watch(packagesDir, { recursive: true }, (_event, filename) => {
    if (!filename) return;
    if (
      filename.includes('/dist/') ||
      filename.includes('dist/') ||
      filename.includes('/node_modules/') ||
      filename.includes('node_modules/') ||
      filename.includes('/coverage/') ||
      filename.includes('coverage/') ||
      filename.includes('/.next/') ||
      filename.includes('.next/') ||
      filename.includes('/generated/')
    )
      return;
    if (filename.startsWith('docs-ui/') || filename.startsWith('docs-site/')) return;
    if (!/\.(ts|tsx|js|jsx|ejs|json)$/.test(filename)) return;

    clearTimeout(sourceTimer);
    sourceTimer = setTimeout(() => {
      log('watch', `Source changed: packages/${filename}`);
      onChange();
    }, 1000);
  });
  log('watch', 'Watching packages/ source (excluding dist, docs-ui, docs-site)');
  return () => {
    clearTimeout(sourceTimer);
    watcher.close();
  };
}

function watchMockServer(onChange) {
  let restartTimer = null;
  const mockDir = dirname(MOCK_SERVER_PATH);
  const mockFilename = basename(MOCK_SERVER_PATH);
  const watcher = watch(mockDir, (_event, filename) => {
    if (!filename || String(filename) !== mockFilename) return;
    clearTimeout(restartTimer);
    restartTimer = setTimeout(() => {
      log('watch', `Mock changed: e2e/docker/${mockFilename}`);
      onChange();
    }, 300);
  });
  log('watch', `Watching e2e/docker/${mockFilename}`);
  return () => {
    clearTimeout(restartTimer);
    watcher.close();
  };
}

function rebuildLibraries() {
  log('build', 'Rebuilding library packages...');
  try {
    execSync(
      'npx turbo build --only --filter=@cortex/core --filter=@cortex/codegen --filter=@cortex/mcp-gen --filter=@cortex/cli',
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
  let mockProc = await startMockServer();
  const ownsMockProcess = mockProc !== null;
  const serveProc = startDocsServe();

  const stopWatching = watchPackageSources(() => {
    rebuildLibraries();
    runGenerate();
  });

  let mockRestarting = false;
  let mockRestartQueued = false;
  const restartMock = async () => {
    if (shuttingDown) return;
    if (!ownsMockProcess) {
      log(
        'mock',
        'Mock source changed, but the running mock is externally managed; restart it manually',
      );
      return;
    }
    if (mockRestarting) {
      mockRestartQueued = true;
      return;
    }

    mockRestarting = true;
    try {
      do {
        mockRestartQueued = false;
        log('mock', 'Restarting mock server...');
        const previousProc = mockProc;
        mockProc = null;
        await stopProcess(previousProc, false);
        if (shuttingDown) return;
        try {
          mockProc = await startMockServer();
          log('mock', 'Restart complete');
        } catch (err) {
          logError('mock', `Restart failed: ${err instanceof Error ? err.message : err}`);
        }
      } while (mockRestartQueued && !shuttingDown);
    } finally {
      mockRestarting = false;
    }
  };
  const stopWatchingMock = watchMockServer(() => {
    void restartMock();
  });

  console.log('');
  log('dev', 'Ready. Press Ctrl+C to stop all processes.');
  console.log('');

  async function cleanup() {
    if (shuttingDown) return;
    shuttingDown = true;
    log('dev', 'Shutting down...');
    stopWatching();
    stopWatchingMock();
    await Promise.all([stopProcess(serveProc, false), stopProcess(mockProc, false)]);
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
