import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { CortexConfig, SupportedLanguage } from '@cortex/core';
import {
  calculatePackageChecksum,
  discoverPublishTargets,
  incrementVersion,
  updateTargetVersion,
} from '../src/commands/publish/publish.command';
import {
  getPublishedVersion,
  latestSemanticVersion,
} from '../src/commands/publish/registry-version';

const tempDirectories: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-publish-test-'));
  tempDirectories.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirectories.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('discoverPublishTargets', () => {
  it('discovers all SDK languages in nested package directories', () => {
    const root = tempDir();
    const languages: SupportedLanguage[] = [
      'typescript',
      'python',
      'go',
      'java',
      'kotlin',
      'ruby',
      'php',
      'csharp',
      'rust',
      'cpp',
      'c',
    ];
    for (const language of languages) {
      const dir = path.join(root, language, `acme-${language}`);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, '.cortex-package.json'),
        JSON.stringify({
          schemaVersion: 1,
          kind: 'sdk',
          language,
          packageName: `acme-${language}`,
          version: '1.2.3',
        }),
      );
    }

    const targets = discoverPublishTargets(root);
    expect(targets).toHaveLength(11);
    expect(new Set(targets.map((target) => target.language))).toEqual(new Set(languages));
    expect(targets.every((target) => target.version === '1.2.3')).toBe(true);
  });

  it('merges inherited, package, and CLI registry settings in precedence order', () => {
    const root = tempDir();
    const dir = path.join(root, 'typescript', 'acme-sdk');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.cortex-package.json'),
      JSON.stringify({
        schemaVersion: 1,
        language: 'typescript',
        packageName: '@acme/sdk',
        version: '1.0.0',
      }),
    );
    const config = {
      publish: {
        registries: {
          typescript: { url: 'https://default.test', token_env: 'DEFAULT_TOKEN', access: 'public' },
        },
      },
      languages: [
        {
          language: 'typescript',
          package_name: '@acme/sdk',
          output_dir: dir,
          publish: { token_env: 'PACKAGE_TOKEN', access: 'restricted' },
        },
      ],
    } as CortexConfig;

    const [target] = discoverPublishTargets(
      root,
      config,
      { kind: 'sdk', language: 'typescript' },
      'https://override.test',
    );
    expect(target.registry).toEqual({
      url: 'https://override.test',
      token_env: 'PACKAGE_TOKEN',
      access: 'restricted',
      enabled: true,
    });
  });

  it('supports legacy generated packages without Cortex metadata', () => {
    const root = tempDir();
    const dir = path.join(root, 'typescript');
    fs.mkdirSync(dir);
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: '@acme/sdk', version: '3.1.4' }),
    );

    const [target] = discoverPublishTargets(root);
    expect(target.language).toBe('typescript');
    expect(target.packageName).toBe('@acme/sdk');
    expect(target.version).toBe('3.1.4');
  });

  it('supports GitHub-only and dual publish destinations', () => {
    const root = tempDir();
    const githubOnlyDir = path.join(root, 'typescript', 'github-only');
    const dualDir = path.join(root, 'python', 'dual');
    for (const [dir, language, packageName] of [
      [githubOnlyDir, 'typescript', '@acme/github-only'],
      [dualDir, 'python', 'acme-dual'],
    ] as const) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, '.cortex-package.json'),
        JSON.stringify({
          schemaVersion: 1,
          language,
          packageName,
          version: '0.0.0',
        }),
      );
    }
    const config = {
      publish: { registries: { python: { url: 'https://pypi.test', auth: false } } },
      languages: [
        {
          language: 'typescript',
          package_name: '@acme/github-only',
          output_dir: githubOnlyDir,
          github_repository: 'github.com/acme/github-only',
          publish: { enabled: false, github: { auth: false } },
        },
        {
          language: 'python',
          package_name: 'acme-dual',
          output_dir: dualDir,
          github_repository: 'https://github.com/acme/dual',
          publish: { github: true },
        },
      ],
    } as CortexConfig;

    const targets = discoverPublishTargets(root, config);
    const githubOnly = targets.find((target) => target.packageName === '@acme/github-only')!;
    const dual = targets.find((target) => target.packageName === 'acme-dual')!;
    expect(githubOnly).toMatchObject({
      registryEnabled: false,
      githubEnabled: true,
      githubRepository: 'https://github.com/acme/github-only',
      github: { auth: false },
    });
    expect(dual).toMatchObject({
      registryEnabled: true,
      githubEnabled: true,
      githubRepository: 'https://github.com/acme/dual',
    });
  });

  it('includes a managed MCP package and ignores unmanaged legacy packages', () => {
    const root = tempDir();
    const sdkDir = path.join(root, 'typescript', 'sdk');
    const mcpDir = path.join(root, 'mcp-server');
    fs.mkdirSync(sdkDir, { recursive: true });
    fs.mkdirSync(mcpDir, { recursive: true });
    fs.writeFileSync(
      path.join(sdkDir, '.cortex-package.json'),
      JSON.stringify({
        schemaVersion: 1,
        language: 'typescript',
        packageName: '@acme/sdk',
        version: '1.0.0',
      }),
    );
    fs.writeFileSync(
      path.join(mcpDir, 'package.json'),
      JSON.stringify({ name: '@acme/mcp', version: '1.0.0' }),
    );
    fs.writeFileSync(
      path.join(mcpDir, '.cortex-package.json'),
      JSON.stringify({
        schemaVersion: 1,
        kind: 'mcp-server',
        language: 'typescript',
        packageName: '@acme/mcp',
        version: '1.0.0',
      }),
    );
    const unmanagedDir = path.join(root, 'unmanaged');
    fs.mkdirSync(unmanagedDir);
    fs.writeFileSync(
      path.join(unmanagedDir, 'package.json'),
      JSON.stringify({ name: 'unmanaged', version: '1.0.0' }),
    );
    const config = {
      publish: {
        registries: { typescript: { url: 'https://sdk.test', token_env: 'SDK_TOKEN' } },
        mcp: { url: 'https://mcp.test', token_env: 'MCP_TOKEN' },
      },
      languages: [{ language: 'typescript', package_name: '@acme/sdk', output_dir: sdkDir }],
    } as CortexConfig;

    const targets = discoverPublishTargets(root, config);
    expect(targets.map((target) => target.packageName)).toEqual(['@acme/mcp', '@acme/sdk']);
    expect(targets.find((target) => target.kind === 'mcp-server')?.registry).toEqual({
      url: 'https://mcp.test',
      token_env: 'MCP_TOKEN',
    });
    expect(
      discoverPublishTargets(root, config, { kind: 'mcp-server' }).map(
        (target) => target.packageName,
      ),
    ).toEqual(['@acme/mcp']);
    expect(
      discoverPublishTargets(root, config, { kind: 'sdk', language: 'typescript' }).map(
        (target) => target.packageName,
      ),
    ).toEqual(['@acme/sdk']);
  });

  it('increments semantic versions and updates package manifests', () => {
    const root = tempDir();
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: '@acme/sdk', version: '0.0.0' }),
    );
    fs.writeFileSync(
      path.join(root, '.cortex-package.json'),
      JSON.stringify({
        schemaVersion: 1,
        kind: 'sdk',
        language: 'typescript',
        packageName: '@acme/sdk',
        version: '0.0.0',
      }),
    );

    const [target] = discoverPublishTargets(root);
    const restore = updateTargetVersion(target, incrementVersion(target.version));
    expect(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version).toBe(
      '0.0.1',
    );
    expect(
      JSON.parse(fs.readFileSync(path.join(root, '.cortex-package.json'), 'utf8')).version,
    ).toBe('0.0.1');

    restore();
    expect(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version).toBe(
      '0.0.0',
    );
    expect(incrementVersion('2.0.0-beta.1')).toBe('2.0.0');
    expect(incrementVersion('1.2.3', 'minor')).toBe('1.3.0');
    expect(incrementVersion('1.2.3', 'major')).toBe('2.0.0');
  });

  it('uses a version-independent checksum and detects source changes', () => {
    const root = tempDir();
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'src', 'index.ts'), 'export const answer = 42;\n');
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({
        name: '@acme/sdk',
        version: '0.0.0',
        files: ['dist', 'README.md', '.cortex-package.json'],
      }),
    );
    fs.writeFileSync(
      path.join(root, '.cortex-package.json'),
      JSON.stringify({
        schemaVersion: 1,
        kind: 'sdk',
        language: 'typescript',
        packageName: '@acme/sdk',
        version: '0.0.0',
      }),
    );

    const [target] = discoverPublishTargets(root);
    const first = calculatePackageChecksum(target);
    updateTargetVersion(target, '9.8.7', first);
    fs.mkdirSync(path.join(root, 'node_modules'));
    fs.writeFileSync(path.join(root, 'node_modules', 'ignored.js'), 'changes do not count');
    expect(calculatePackageChecksum(target)).toBe(first);

    fs.writeFileSync(path.join(root, 'src', 'index.ts'), 'export const answer = 43;\n');
    expect(calculatePackageChecksum(target)).not.toBe(first);
  });
});

describe('registry version resolution', () => {
  it('selects the highest semantic version', () => {
    expect(latestSemanticVersion(['1.9.9', '2.0.0-beta.1', '1.10.0', 'invalid'])).toBe(
      '2.0.0-beta.1',
    );
    expect(latestSemanticVersion(['2.0.0-beta.1', '2.0.0'])).toBe('2.0.0');
    expect(latestSemanticVersion([])).toBeUndefined();
  });

  it('reads the current version from a folder-based NuGet source', async () => {
    const root = tempDir();
    fs.writeFileSync(path.join(root, 'Cortex.Acme.1.2.9.nupkg'), '');
    fs.writeFileSync(path.join(root, 'Cortex.Acme.1.10.0.nupkg'), '');
    const target = {
      kind: 'sdk' as const,
      language: 'csharp' as const,
      packageName: 'Cortex.Acme',
      version: '0.0.0',
      dir: root,
      manifest: 'Cortex.Acme.csproj',
      registry: { url: root, auth: false },
    };

    await expect(getPublishedVersion(target, root, {})).resolves.toBe('1.10.0');
  });
});
