const { execSync, spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const MOCK_PORT = 4010;
const MOCK_URL = `http://localhost:${MOCK_PORT}`;
const WS_URL = `ws://localhost:${MOCK_PORT}/ws`;
const GQL_URL = `${MOCK_URL}/graphql`;
const TESTS_DIR = path.join(__dirname, 'tests');
const GEN_DIR = '/tmp/cortex-e2e-sdks/generated';
const SPEC_DIR = path.join(__dirname, '../../packages/core/__fixtures__');

const results = [];
function log(msg) { console.log(`  ${msg}`); }
function pass(name) { results.push({ name, status: 'PASS' }); log(`\x1b[32m✓\x1b[0m ${name}`); }
function fail(name, err) { results.push({ name, status: 'FAIL', error: err }); log(`\x1b[31m✗\x1b[0m ${name}: ${err}`); }

function run(cmd, opts = {}) {
  return execSync(cmd, {
    stdio: 'pipe', timeout: 300000,
    env: { ...process.env, MOCK_URL, MOCK_WS_URL: WS_URL, MOCK_GQL_URL: GQL_URL, GRPC_ADDR: 'localhost:50051', GEN_DIR, HOME: '/root' },
    ...opts,
  }).toString();
}

function tryRun(name, cmd, opts) {
  try {
    log(`Running ${name}...`);
    const output = run(cmd, opts);
    if (output) console.log(output);
    pass(name);
  } catch (e) {
    const out = (e.stdout?.toString() || '') + (e.stderr?.toString() || '');
    // Show last 30 lines of output for debugging
    const lines = out.split('\n').filter(Boolean);
    const tail = lines.slice(-30).join('\n');
    if (tail) console.log(`\n--- ${name} ERROR OUTPUT ---\n${tail}\n--- END ---\n`);
    const errorLine = lines.find((l) => l.includes('✗')) || lines.pop() || e.message?.substring(0, 150);
    fail(name, errorLine?.trim());
  }
}

async function waitForServer(url, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try { const res = await fetch(`${url}/health`); if (res.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Mock server did not start');
}

async function main() {
  const ALL_LANGUAGES = ['typescript', 'python', 'go', 'java', 'kotlin', 'ruby', 'php', 'csharp', 'rust', 'cpp', 'c'];
  const testLangsEnv = process.env.TEST_LANGUAGES?.trim();
  const selectedLanguages = testLangsEnv
    ? testLangsEnv.split(',').map((l) => l.trim().toLowerCase()).filter(Boolean)
    : ALL_LANGUAGES;

  const shouldTest = (lang) => selectedLanguages.includes(lang);
  const langLabel = testLangsEnv ? selectedLanguages.join(', ') : 'ALL';

  console.log('\n\x1b[1m╔══════════════════════════════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[1m║  Cortex SDK Integration Tests — ALL protocols via real SDKs  ║\x1b[0m');
  console.log('\x1b[1m╚══════════════════════════════════════════════════════════════╝\x1b[0m\n');
  log(`Languages: ${langLabel}\n`);

  // Step 1: Generate unified SDKs for all languages
  log('Generating SDKs with cortex init...');
  fs.mkdirSync('/tmp/cortex-e2e-sdks', { recursive: true });
  run(`node /cortex/packages/cli/dist/main.js init test-project \
    --open-api ${SPEC_DIR}/petstore.yaml \
    --async-api ${SPEC_DIR}/chat-asyncapi.yaml \
    --graphql ${SPEC_DIR}/petstore.graphql \
    --grpc ${SPEC_DIR}/petstore.proto \
    --no-mcp`, { cwd: '/tmp/cortex-e2e-sdks' });
  log('SDKs generated for all languages');

  // Read generated config to find output directories per language
  const yaml = require('js-yaml');
  const generatedConfig = yaml.load(fs.readFileSync('/tmp/cortex-e2e-sdks/cortex.config.yml', 'utf-8'));
  const langOutputDirs = {};
  for (const source of generatedConfig.sources || []) {
    for (const langCfg of source.languages || []) {
      if (!langOutputDirs[langCfg.language]) {
        const sanitized = langCfg.package_name.replace(/^@/, '').replace(/\//g, '-');
        langOutputDirs[langCfg.language] = path.join(GEN_DIR, '..', sanitized);
      }
    }
  }
  // Fallback: scan generated directories
  if (Object.keys(langOutputDirs).length === 0 && fs.existsSync(GEN_DIR)) {
    for (const dir of fs.readdirSync(GEN_DIR)) {
      const fullPath = path.join(GEN_DIR, dir);
      if (fs.statSync(fullPath).isDirectory()) {
        langOutputDirs[dir] = fullPath;
      }
    }
  }

  const languages = ALL_LANGUAGES;
  for (const lang of languages) {
    const src = langOutputDirs[lang] || path.join(GEN_DIR, lang);
    const dest = path.join(TESTS_DIR, `test-${lang}`, 'generated', lang);
    if (fs.existsSync(src)) {
      fs.mkdirSync(dest, { recursive: true });
      fs.cpSync(src, dest, { recursive: true });
    }
  }
  // Rust: also copy generated SDK to src/sdk/ for module resolution
  const rustSdk = path.join(TESTS_DIR, 'test-rust/src/sdk');
  const rustGen = path.join(langOutputDirs['rust'] || path.join(GEN_DIR, 'rust'), 'src');
  if (fs.existsSync(rustGen)) {
    fs.mkdirSync(rustSdk, { recursive: true });
    for (const f of fs.readdirSync(rustGen)) {
      if (f.endsWith('.rs')) {
        const newName = f.replace(/-/g, '_');
        fs.cpSync(path.join(rustGen, f), path.join(rustSdk, newName));
      }
    }
    // Use index.rs as mod.rs
    if (fs.existsSync(path.join(rustSdk, 'index.rs'))) {
      fs.renameSync(path.join(rustSdk, 'index.rs'), path.join(rustSdk, 'mod.rs'));
    }
    // Copy resource files
    const rustRes = path.join(rustGen, 'resources');
    if (fs.existsSync(rustRes)) {
      for (const f of fs.readdirSync(rustRes)) {
        fs.cpSync(path.join(rustRes, f), path.join(rustSdk, f));
      }
    }
  }
  // Debug: list generated files for each language
  for (const lang of languages) {
    const src = path.join(GEN_DIR, lang, 'src');
    if (fs.existsSync(src)) {
      const files = fs.readdirSync(src).sort();
      log(`  ${lang}: ${files.join(', ')}`);
    }
  }
  log('SDKs copied to test directories');

  const tsPkg = path.join(TESTS_DIR, 'test-typescript/generated/typescript');
  if (fs.existsSync(tsPkg)) {
    const pkg = JSON.parse(fs.readFileSync(path.join(tsPkg, 'package.json'), 'utf-8'));
    pkg.dependencies = { ...pkg.dependencies, 'graphql-ws': '^5.16.0', ws: '^8.18.0' };
    fs.writeFileSync(path.join(tsPkg, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
    run('npm install --ignore-scripts', { cwd: tsPkg });
  }
  log('TypeScript SDK deps installed');

  // Install Python SDK deps from generated manifest
  const pythonDir = path.join(GEN_DIR, 'python');
  const pySetup = path.join(pythonDir, 'setup.py');
  if (fs.existsSync(pySetup)) {
    const content = fs.readFileSync(pySetup, 'utf-8');
    const reqSection = content.match(/install_requires=\[([\s\S]*?)\]/);
    const deps = reqSection
      ? [...new Set([...reqSection[1].matchAll(/"([a-zA-Z0-9_-]+)/g)].map((m) => m[1]))].join(' ')
      : 'httpx pydantic';
    try { run(`pip3 install --break-system-packages ${deps} pytest`); } catch {}
  } else {
    try { run('pip3 install --break-system-packages httpx pydantic pytest'); } catch {}
  }
  log('Python SDK deps installed');

  // Install Ruby SDK deps from generated gemspec
  const rubyDir = path.join(GEN_DIR, 'ruby');
  if (fs.existsSync(rubyDir)) {
    const gemspec = fs.readdirSync(rubyDir).find((f) => f.endsWith('.gemspec'));
    if (gemspec) {
      try { run('gem install faraday faraday-multipart websocket-client-simple websocket --no-document'); } catch {}
    }
  }
  log('Ruby SDK deps installed');

  // Install PHP SDK deps (Guzzle) + download PHPUnit
  const phpDir = path.join(GEN_DIR, 'php');
  if (fs.existsSync(path.join(phpDir, 'composer.json'))) {
    try { run('composer install --no-interaction --no-progress', { cwd: phpDir }); } catch {}
  }
  if (!fs.existsSync('/tmp/phpunit.phar')) {
    try { run('wget -q https://phar.phpunit.de/phpunit-11.phar -O /tmp/phpunit.phar && chmod +x /tmp/phpunit.phar'); } catch {}
  }
  log('PHP SDK deps installed\n');

  // Step 2: Start mock server (REST + WS + GraphQL + gRPC-over-HTTP)
  log('Starting mock server...');
  const mockServer = spawn('node', [path.join(__dirname, 'mock-server.js')], {
    env: { ...process.env, MOCK_PORT: String(MOCK_PORT) }, stdio: 'pipe',
  });
  await waitForServer(MOCK_URL);
  log('Mock server ready\n');

  try {
    // --- TypeScript (REST + GraphQL + WebSocket + gRPC) ---
    if (shouldTest('typescript'))
      tryRun('TypeScript (REST + GraphQL + WS + gRPC)', `npx vitest run ${path.join(TESTS_DIR, 'test-typescript/test-typescript.test.ts')} --reporter=verbose --test-timeout 30000 --hook-timeout 30000`);

    // --- Python (REST + GraphQL + WebSocket + gRPC) ---
    if (shouldTest('python'))
      tryRun('Python (REST + GraphQL + WS + gRPC)', `python3 -m pytest ${path.join(TESTS_DIR, 'test-python/test_python.py')} -v`);

    // --- Go (REST + GraphQL + WS + gRPC) ---
    if (shouldTest('go') && fs.existsSync(path.join(TESTS_DIR, 'test-go/sdk_test.go')))
      tryRun('Go (REST + GraphQL + WS + gRPC)', `cd ${path.join(TESTS_DIR, 'test-go')} && CGO_ENABLED=0 go test -v -count=1`);

    // --- Java (REST + GraphQL + WS + gRPC) ---
    if (shouldTest('java') && fs.existsSync(path.join(TESTS_DIR, 'test-java/test-java.sh')))
      tryRun('Java (REST + GraphQL + WS + gRPC)', `bash ${path.join(TESTS_DIR, 'test-java/test-java.sh')}`);

    // --- Kotlin (REST + GraphQL + WS + gRPC) ---
    if (shouldTest('kotlin') && fs.existsSync(path.join(TESTS_DIR, 'test-kotlin/test-kotlin.sh')))
      tryRun('Kotlin (REST + GraphQL + WS + gRPC)', `bash ${path.join(TESTS_DIR, 'test-kotlin/test-kotlin.sh')}`, { timeout: 300000 });

    // --- Ruby (REST + GraphQL + WS + gRPC) ---
    if (shouldTest('ruby') && fs.existsSync(path.join(TESTS_DIR, 'test-ruby/test-ruby.rb')))
      tryRun('Ruby (REST + GraphQL + WS + gRPC)', `ruby ${path.join(TESTS_DIR, 'test-ruby/test-ruby.rb')}`);

    // --- PHP (REST + GraphQL + WS + gRPC) ---
    if (shouldTest('php') && fs.existsSync(path.join(TESTS_DIR, 'test-php/TestPhp.php')))
      tryRun('PHP (REST + GraphQL + WS + gRPC)', `php /tmp/phpunit.phar --testdox ${path.join(TESTS_DIR, 'test-php/TestPhp.php')}`);

    // --- C# (REST + GraphQL + WS + gRPC) ---
    if (shouldTest('csharp') && fs.existsSync(path.join(TESTS_DIR, 'test-csharp/test-csharp.sh')))
      tryRun('C# (REST + GraphQL + WS + gRPC)', `bash ${path.join(TESTS_DIR, 'test-csharp/test-csharp.sh')}`, { timeout: 300000 });

    // --- Rust (REST + GraphQL + WS + gRPC) ---
    if (shouldTest('rust') && fs.existsSync(path.join(TESTS_DIR, 'test-rust/test-rust.sh')))
      tryRun('Rust (REST + GraphQL + WS + gRPC)', `bash ${path.join(TESTS_DIR, 'test-rust/test-rust.sh')}`, { timeout: 300000 });

    // --- C++ (REST + GraphQL + WS + gRPC) ---
    if (shouldTest('cpp') && fs.existsSync(path.join(TESTS_DIR, 'test-cpp/test-cpp.sh')))
      tryRun('C++ (REST + GraphQL + WS + gRPC)', `bash ${path.join(TESTS_DIR, 'test-cpp/test-cpp.sh')}`, { timeout: 300000 });

    // --- C (REST + GraphQL + WS + gRPC) ---
    if (shouldTest('c') && fs.existsSync(path.join(TESTS_DIR, 'test-c/test-c.sh')))
      tryRun('C (REST + GraphQL + WS + gRPC)', `bash ${path.join(TESTS_DIR, 'test-c/test-c.sh')}`, { timeout: 300000 });

    // --- MCP Server (always runs unless explicitly filtered) ---
    if (!testLangsEnv || shouldTest('mcp'))
      if (fs.existsSync(path.join(TESTS_DIR, 'test-mcp/test-mcp.test.ts')))
        tryRun('MCP Server (tools + resources)', `npx vitest run ${path.join(TESTS_DIR, 'test-mcp/test-mcp.test.ts')} --reporter=verbose --test-timeout 120000 --hook-timeout 120000`);

  } finally {
    mockServer.kill();
  }

  // Summary
  console.log('\n\x1b[1m╔══════════════════════════════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[1m║  Results                                                     ║\x1b[0m');
  console.log('\x1b[1m╚══════════════════════════════════════════════════════════════╝\x1b[0m\n');
  const p = results.filter((r) => r.status === 'PASS').length;
  const f = results.filter((r) => r.status === 'FAIL').length;
  for (const r of results) {
    const icon = r.status === 'PASS' ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    console.log(`  ${icon} ${r.name}${r.error ? ` — ${r.error}` : ''}`);
  }
  console.log(`\n  \x1b[1m${p} passed, ${f} failed\x1b[0m\n`);
  process.exit(f > 0 ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
