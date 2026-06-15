#!/usr/bin/env node

import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, watch, readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
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
  const color = { dev: '35', init: '33', generate: '32', mock: '34', next: '36', watch: '90', build: '33' }[tag] || '0';
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
    writeFileSync(specPath, specContent.replace(
      /url:\s*https?:\/\/[^\n]+/,
      `url: http://localhost:${MOCK_PORT}`
    ), 'utf-8');
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

function killTree(proc) {
  if (!proc || !proc.pid) return;
  try { process.kill(-proc.pid, 'SIGTERM'); } catch { }
  setTimeout(() => {
    try { process.kill(-proc.pid, 'SIGKILL'); } catch { }
  }, 1000);
}

function startMockServer() {
  log('mock', `Starting mock server on :${MOCK_PORT} (gRPC :${GRPC_PORT})...`);
  const proc = spawn('node', [MOCK_SERVER_PATH], {
    cwd: WORKSPACE_ROOT,
    env: { ...process.env, MOCK_PORT, GRPC_PORT },
    detached: true,
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
  return proc;
}

function startDocsServe() {
  log('serve', `Starting cortex docs serve on http://localhost:${PORT}`);
  const proc = spawn('node', [CLI_MAIN, 'docs', 'serve', '--port', PORT], {
    cwd: TEST_PROJECT_DIR,
    detached: true,
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
  watch(packagesDir, { recursive: true }, (_event, filename) => {
    if (!filename) return;
    if (
      filename.includes('/dist/') || filename.includes('dist/') ||
      filename.includes('/node_modules/') || filename.includes('node_modules/') ||
      filename.includes('/.next/') || filename.includes('.next/') ||
      filename.includes('/generated/')
    ) return;
    if (filename.startsWith('docs-ui/') || filename.startsWith('docs-site/')) return;
    if (!/\.(ts|tsx|js|jsx|ejs|json)$/.test(filename)) return;

    clearTimeout(sourceTimer);
    sourceTimer = setTimeout(() => {
      log('watch', `Source changed: packages/${filename}`);
      onChange();
    }, 1000);
  });
  log('watch', 'Watching packages/ source (excluding dist, docs-ui, docs-site)');
}

function rebuildLibraries() {
  log('build', 'Rebuilding library packages...');
  try {
    execSync(
      'npx turbo build --filter=@cortex/core --filter=@cortex/codegen --filter=@cortex/mcp-gen --filter=@cortex/cli',
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

  const mockProc = startMockServer();
  const serveProc = startDocsServe();

  watchPackageSources(() => {
    rebuildLibraries();
    runGenerate();
  });

  console.log('');
  log('dev', 'Ready. Press Ctrl+C to stop all processes.');
  console.log('');

  function cleanup() {
    log('dev', 'Shutting down...');
    killTree(serveProc);
    killTree(mockProc);
    setTimeout(() => process.exit(0), 2000);
  }

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  await new Promise(() => { });
}

main().catch((err) => {
  logError('dev', err.message);
  process.exit(1);
});
