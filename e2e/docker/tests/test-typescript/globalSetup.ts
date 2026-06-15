import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../../..');
const CLI = resolve(ROOT, 'packages/cli/dist/main.js');
const SPECS = resolve(ROOT, 'packages/core/__fixtures__');
const OUT = resolve(__dirname, 'generated');
const MARKER = resolve(OUT, 'typescript/src/gql-query-builder.ts');

export async function setup() {
  if (existsSync(MARKER)) return;

  const tmp = resolve(__dirname, '.gen-tmp');
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });

  execSync([
    `node ${CLI} init test-project`,
    `--open-api ${SPECS}/petstore.yaml`,
    `--async-api ${SPECS}/chat-asyncapi.yaml`,
    `--graphql ${SPECS}/petstore.graphql`,
    `--grpc ${SPECS}/petstore.proto`,
    `--no-mcp`,
  ].join(' '), { cwd: tmp, stdio: 'pipe' });

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  cpSync(resolve(tmp, 'generated/typescript'), resolve(OUT, 'typescript'), { recursive: true });

  rmSync(tmp, { recursive: true, force: true });

  const pkgPath = resolve(OUT, 'typescript/package.json');
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(require('node:fs').readFileSync(pkgPath, 'utf-8'));
    pkg.dependencies = { ...pkg.dependencies, 'graphql-ws': '^6.0.0', ws: '^8.18.0' };
    require('node:fs').writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  }

  execSync('npm install --ignore-scripts', { cwd: resolve(OUT, 'typescript'), stdio: 'pipe' });
}
