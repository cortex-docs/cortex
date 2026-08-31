import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

const RUNTIME_DIRECTORIES = ['app', 'components', 'hooks', 'lib', 'public'];
const RUNTIME_FILES = [
  'next.config.js',
  'package.json',
  'postcss.config.mjs',
  'tsconfig.json',
  'next-env.d.ts',
];

export function resolveDevRuntimeDirName(projectDir: string): string {
  const projectHash = createHash('sha256')
    .update(path.resolve(projectDir))
    .digest('hex')
    .slice(0, 12);
  return `.cortex-dev-${projectHash}`;
}

export function prepareDocsUiRuntime(docsUiPath: string, runtimeDir: string): void {
  prepareDocsUiRuntimeWithOptions(docsUiPath, runtimeDir, { copySources: true });
}

export function prepareDocsUiBuildRuntime(docsUiPath: string, runtimeDir: string): void {
  prepareDocsUiRuntimeWithOptions(docsUiPath, runtimeDir, { copySources: true });
}

function prepareDocsUiRuntimeWithOptions(
  docsUiPath: string,
  runtimeDir: string,
  options: { copySources?: boolean } = {},
): void {
  fs.mkdirSync(runtimeDir, { recursive: true });

  if (options.copySources) copyDocsUiRuntimeSources(docsUiPath, runtimeDir);
  else syncDocsUiRuntimeSources(docsUiPath, runtimeDir);

  for (const name of RUNTIME_FILES) {
    fs.copyFileSync(path.join(docsUiPath, name), path.join(runtimeDir, name));
  }
}

function copyDocsUiRuntimeSources(docsUiPath: string, runtimeDir: string): void {
  for (const name of RUNTIME_DIRECTORIES) {
    const source = path.join(docsUiPath, name);
    const target = path.join(runtimeDir, name);
    fs.rmSync(target, { recursive: true, force: true });
    fs.cpSync(source, target, { recursive: true });
  }
}

export function syncDocsUiRuntimeSources(docsUiPath: string, runtimeDir: string): void {
  for (const name of RUNTIME_DIRECTORIES) {
    const source = path.join(docsUiPath, name);
    const target = path.join(runtimeDir, name);
    syncSourceDirectory(source, target);
  }
}

function syncSourceDirectory(source: string, target: string): void {
  fs.mkdirSync(target, { recursive: true });

  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const sourceEntry = path.join(source, entry.name);
    const targetEntry = path.join(target, entry.name);
    if (!fs.existsSync(sourceEntry)) fs.rmSync(targetEntry, { recursive: true, force: true });
  }

  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourceEntry = path.join(source, entry.name);
    const targetEntry = path.join(target, entry.name);
    if (entry.isDirectory()) {
      if (fs.existsSync(targetEntry) && !fs.statSync(targetEntry).isDirectory()) {
        fs.rmSync(targetEntry, { recursive: true, force: true });
      }
      syncSourceDirectory(sourceEntry, targetEntry);
    } else {
      if (fs.existsSync(targetEntry) && fs.statSync(targetEntry).isDirectory()) {
        fs.rmSync(targetEntry, { recursive: true, force: true });
      }
      fs.copyFileSync(sourceEntry, targetEntry);
    }
  }
}

export function resolveDocsUiPath(): string {
  try {
    return path.dirname(require.resolve('@cortex-docs/docs-ui/package.json'));
  } catch (error) {
    throw new Error(
      `Cannot find the Cortex Docs UI runtime. Reinstall @cortex-docs/cli. ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }
}

export function resolveNextBin(docsUiPath: string): string {
  try {
    return require.resolve('next/dist/bin/next', { paths: [docsUiPath] });
  } catch (error) {
    throw new Error(
      `Cannot find the Next.js runtime for Cortex Docs. Reinstall @cortex-docs/cli. ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }
}
