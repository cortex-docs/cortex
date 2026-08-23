import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dump, load } from 'js-yaml';

const ROOT = resolve(__dirname, '../../../..');
const CLI = resolve(ROOT, 'packages/cli/dist/main.js');
const SPECS = resolve(ROOT, 'packages/core/__fixtures__');
const OUT = resolve(__dirname, 'generated');
const MARKER = resolve(OUT, 'typescript/src/gql-query-builder.ts');
const WS_CLIENT = resolve(OUT, 'typescript/src/ws-client.ts');
const REST_CLIENT = resolve(OUT, 'typescript/src/client.ts');

export async function setup() {
  if (
    existsSync(MARKER) &&
    existsSync(WS_CLIENT) &&
    readFileSync(WS_CLIENT, 'utf-8').includes('cortex-client-heartbeat') &&
    readFileSync(WS_CLIENT, 'utf-8').includes('heartbeatTimeout > 0 && !this.heartbeatDeadline') &&
    readFileSync(REST_CLIENT, 'utf-8').includes('requestStream')
  )
    return;

  const tmp = resolve(__dirname, '.gen-tmp');
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });

  execSync(`node ${CLI} init test-project`, { cwd: tmp, stdio: 'pipe' });
  cpSync(resolve(SPECS, 'petstore.proto'), resolve(tmp, 'specs/petstore.proto'));

  const configPath = resolve(tmp, 'cortex.config.yml');
  const config = load(readFileSync(configPath, 'utf-8')) as {
    sources?: Array<Record<string, unknown> & { type?: string }>;
  };
  const sharedLanguages = config.sources?.[0]?.languages as
    | Array<{
        language?: string;
        package_name?: string;
      }>
    | undefined;
  if (!sharedLanguages) throw new Error('Generated E2E config has no language definitions');
  config.sources?.push({
    title: 'gRPC',
    type: 'grpc-spec',
    spec: './specs/petstore.proto',
    languages: sharedLanguages,
  });
  const asyncApiSource = config.sources?.find((source) => source.type === 'asyncapi-spec');
  if (!asyncApiSource) throw new Error('Generated E2E config has no AsyncAPI source');
  asyncApiSource.websocket = {
    heartbeat: {
      format: 'json',
      interval_ms: 100,
      timeout_ms: 300,
      client: {
        message: { type: 'cortex-client-heartbeat' },
        response: { type: 'cortex-server-heartbeat-ack' },
      },
      server: {
        message: { type: 'cortex-server-heartbeat' },
        response: { type: 'cortex-client-heartbeat-ack' },
      },
    },
  };
  writeFileSync(configPath, dump(config, { lineWidth: 120, noRefs: true }));
  execSync(`node ${CLI} generate --no-mcp`, { cwd: tmp, stdio: 'pipe' });

  const typescriptConfig = sharedLanguages.find((language) => language.language === 'typescript');
  if (!typescriptConfig?.package_name)
    throw new Error('Generated E2E config has no TypeScript package');
  const typescriptPackageDir = typescriptConfig.package_name.replace(/^@/, '').replace(/\//g, '-');

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  cpSync(resolve(tmp, 'generated/typescript', typescriptPackageDir), resolve(OUT, 'typescript'), {
    recursive: true,
  });

  rmSync(tmp, { recursive: true, force: true });

  const pkgPath = resolve(OUT, 'typescript/package.json');
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    pkg.dependencies = { ...pkg.dependencies, 'graphql-ws': '^6.0.0', ws: '^8.18.0' };
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  }

  execSync('npm install --ignore-scripts', { cwd: resolve(OUT, 'typescript'), stdio: 'pipe' });
}
