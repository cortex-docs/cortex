import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  prepareDocsUiBuildRuntime,
  prepareDocsUiRuntime,
  resolveDevRuntimeDirName,
  syncDocsUiRuntimeSources,
} from '../src/commands/docs/runtime';

describe('docs runtime', () => {
  it('keeps the development dist directory inside the docs UI project', () => {
    const distDir = resolveDevRuntimeDirName('/tmp/example-cortex-project');

    expect(distDir).toMatch(/^\.cortex-dev-[a-f0-9]{12}$/);
    expect(path.isAbsolute(distDir)).toBe(false);
    expect(distDir).not.toContain(path.sep);
  });

  it('isolates the Next.js output for different Cortex projects', () => {
    expect(resolveDevRuntimeDirName('/tmp/project-a')).not.toBe(
      resolveDevRuntimeDirName('/tmp/project-b'),
    );
    expect(resolveDevRuntimeDirName('/tmp/project-a')).toBe(
      resolveDevRuntimeDirName('/tmp/project-a'),
    );
  });

  it('isolates writable Next.js metadata from the packaged docs UI', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-docs-runtime-'));
    const docsUiPath = path.join(workspace, 'docs-ui');
    const runtimeDir = path.join(docsUiPath, '.cortex-dev-test');
    fs.mkdirSync(docsUiPath, { recursive: true });
    for (const directory of ['app', 'components', 'hooks', 'lib', 'public']) {
      fs.mkdirSync(path.join(docsUiPath, directory));
    }
    fs.writeFileSync(path.join(docsUiPath, 'app', 'page.tsx'), 'export default function Page() {}');
    for (const file of [
      'next.config.js',
      'package.json',
      'postcss.config.mjs',
      'tsconfig.json',
      'next-env.d.ts',
    ]) {
      fs.writeFileSync(path.join(docsUiPath, file), file);
    }

    prepareDocsUiRuntime(docsUiPath, runtimeDir);
    fs.writeFileSync(path.join(runtimeDir, 'next-env.d.ts'), 'runtime-only');

    expect(fs.statSync(path.join(runtimeDir, 'app')).isDirectory()).toBe(true);
    expect(fs.realpathSync(path.join(runtimeDir, 'app', 'page.tsx'))).toBe(
      fs.realpathSync(path.join(docsUiPath, 'app', 'page.tsx')),
    );
    expect(fs.readFileSync(path.join(docsUiPath, 'next-env.d.ts'), 'utf-8')).toBe('next-env.d.ts');
    expect(fs.readFileSync(path.join(runtimeDir, 'next-env.d.ts'), 'utf-8')).toBe('runtime-only');

    fs.rmSync(workspace, { recursive: true });
  });

  it('adds renamed source files and removes their stale runtime links', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-docs-runtime-'));
    const docsUiPath = path.join(workspace, 'docs-ui');
    const runtimeDir = path.join(docsUiPath, '.cortex-dev-test');
    for (const directory of ['app', 'components', 'hooks', 'lib', 'public']) {
      fs.mkdirSync(path.join(docsUiPath, directory), { recursive: true });
    }
    const oldSource = path.join(docsUiPath, 'components', 'old-card.tsx');
    const newSource = path.join(docsUiPath, 'components', 'new-card.tsx');
    fs.writeFileSync(oldSource, 'export const Card = "old";');
    for (const file of [
      'next.config.js',
      'package.json',
      'postcss.config.mjs',
      'tsconfig.json',
      'next-env.d.ts',
    ]) {
      fs.writeFileSync(path.join(docsUiPath, file), file);
    }

    prepareDocsUiRuntime(docsUiPath, runtimeDir);
    fs.renameSync(oldSource, newSource);
    syncDocsUiRuntimeSources(docsUiPath, runtimeDir);

    expect(fs.existsSync(path.join(runtimeDir, 'components', 'old-card.tsx'))).toBe(false);
    expect(fs.realpathSync(path.join(runtimeDir, 'components', 'new-card.tsx'))).toBe(
      fs.realpathSync(newSource),
    );

    fs.rmSync(workspace, { recursive: true });
  });

  it('copies source files for production builds', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-docs-runtime-'));
    const docsUiPath = path.join(workspace, 'docs-ui');
    const runtimeDir = path.join(docsUiPath, '.cortex-build-test');
    for (const directory of ['app', 'components', 'hooks', 'lib', 'public']) {
      fs.mkdirSync(path.join(docsUiPath, directory), { recursive: true });
    }
    const sourcePage = path.join(docsUiPath, 'app', 'page.tsx');
    fs.writeFileSync(sourcePage, 'export default function Page() {}');
    for (const file of [
      'next.config.js',
      'package.json',
      'postcss.config.mjs',
      'tsconfig.json',
      'next-env.d.ts',
    ]) {
      fs.writeFileSync(path.join(docsUiPath, file), file);
    }

    prepareDocsUiBuildRuntime(docsUiPath, runtimeDir);
    const runtimePage = path.join(runtimeDir, 'app', 'page.tsx');
    fs.writeFileSync(sourcePage, 'export default function UpdatedPage() {}');

    expect(fs.lstatSync(runtimePage).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(runtimePage, 'utf-8')).toBe('export default function Page() {}');

    fs.rmSync(workspace, { recursive: true });
  });
});
