import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { OpenAPIParser } from '@cortex/core';
import type { CortexConfig } from '@cortex/core';
import { createDefaultRegistry } from '../src/index';
import { getLanguageNaming } from '../src/naming';
import type { CodegenContext } from '../src/plugin';

const FIXTURE_PATH = path.join(__dirname, '../../core/__fixtures__/petstore.yaml');
const TOLERANT_FIXTURE_PATH = path.join(__dirname, '../../core/__fixtures__/openapi-tolerant.yaml');

async function createContext(language: string, packageName: string): Promise<CodegenContext> {
  const parser = new OpenAPIParser();
  const spec = await parser.parse(FIXTURE_PATH);

  const config: CortexConfig = {
    project: 'test',
    sources: [
      {
        title: 'REST API V1',
        type: 'openapi-spec',
        spec: FIXTURE_PATH,
        languages: [{ language: language as any, package_name: packageName }],
      },
    ],
    output: { base_dir: './generated' },
    languages: [
      {
        language: language as any,
        package_name: packageName,
        output_dir: `./generated/${language}`,
      },
    ],
  };

  return {
    spec,
    config,
    languageConfig: config.languages[0],
    naming: getLanguageNaming(language),
  };
}

describe('All Language Plugins', () => {
  const registry = createDefaultRegistry();

  it('has all 11 languages registered', () => {
    const languages = registry.getAvailableLanguages();
    expect(languages).toContain('typescript');
    expect(languages).toContain('python');
    expect(languages).toContain('go');
    expect(languages).toContain('java');
    expect(languages).toContain('kotlin');
    expect(languages).toContain('ruby');
    expect(languages).toContain('php');
    expect(languages).toContain('csharp');
    expect(languages).toContain('rust');
    expect(languages).toContain('cpp');
    expect(languages).toContain('c');
    expect(languages).toHaveLength(11);
  });

  const testCases: Array<{ language: string; packageName: string; expectedFiles: string[] }> = [
    {
      language: 'typescript',
      packageName: '@test/sdk',
      expectedFiles: [
        'package.json',
        'tsconfig.json',
        'src/client.ts',
        'src/types.ts',
        'src/index.ts',
      ],
    },
    {
      language: 'python',
      packageName: 'petstore-api',
      expectedFiles: ['setup.py', 'pyproject.toml', 'src/__init__.py'],
    },
    {
      language: 'go',
      packageName: 'github.com/test/petstore',
      expectedFiles: ['go.mod', 'client.go', 'types.go'],
    },
    {
      language: 'java',
      packageName: 'com.test.petstore',
      expectedFiles: ['pom.xml'],
    },
    {
      language: 'kotlin',
      packageName: 'com.test.petstore',
      expectedFiles: ['build.gradle.kts'],
    },
    {
      language: 'ruby',
      packageName: 'petstore-api',
      expectedFiles: ['petstore_api.gemspec'],
    },
    {
      language: 'php',
      packageName: 'test/petstore-api',
      expectedFiles: ['composer.json', 'src/ApiException.php'],
    },
    {
      language: 'csharp',
      packageName: 'petstore-api',
      expectedFiles: ['PetstoreApi.csproj', 'ApiException.cs'],
    },
    {
      language: 'rust',
      packageName: 'petstore-api',
      expectedFiles: ['Cargo.toml', 'src/client.rs', 'src/types.rs'],
    },
    {
      language: 'cpp',
      packageName: 'petstore-api',
      expectedFiles: ['CMakeLists.txt', 'src/client.hpp', 'src/types.hpp'],
    },
    {
      language: 'c',
      packageName: 'petstore-api',
      expectedFiles: ['Makefile', 'src/client.h', 'src/types.h'],
    },
  ];

  for (const { language, packageName, expectedFiles } of testCases) {
    describe(language, () => {
      it('generates files', async () => {
        const plugin = registry.get(language)!;
        const context = await createContext(language, packageName);
        const files = await plugin.generate(context);

        expect(files.length).toBeGreaterThan(0);

        const filePaths = files.map((f) => f.path);
        for (const expected of expectedFiles) {
          expect(filePaths).toContain(expected);
        }
      });

      it('produces non-empty file content', async () => {
        const plugin = registry.get(language)!;
        const context = await createContext(language, packageName);
        const files = await plugin.generate(context);

        const nonMarkerFiles = files.filter(
          (f) => !f.path.endsWith('__init__.py') && !f.path.endsWith('.keep'),
        );
        for (const file of nonMarkerFiles) {
          expect(file.content.length).toBeGreaterThan(0);
        }
      });

      it('generates a 15-second HTTP timeout and chunked response streaming API', async () => {
        const plugin = registry.get(language)!;
        const context = await createContext(language, packageName);
        const files = await plugin.generate(context);
        const streamTokens: Record<string, string> = {
          typescript: 'requestStream(',
          python: 'def request_stream(',
          go: 'RequestStream(',
          java: 'requestStream(',
          kotlin: 'requestStream(',
          ruby: 'def request_stream(',
          php: 'function requestStream(',
          csharp: 'RequestStreamAsync(',
          rust: 'request_stream(',
          cpp: 'request_stream(',
          c: 'sdk_request_stream(',
        };
        const timeoutTokens: Record<string, string> = {
          typescript: '15_000',
          python: 'timeout: float = 15.0',
          go: '15 * time.Second',
          java: 'Duration.ofSeconds(15)',
          kotlin: 'Duration.ofSeconds(15)',
          ruby: 'timeout: 15',
          php: '$timeout = 15.0',
          csharp: 'TimeSpan.FromSeconds(15)',
          rust: 'Duration::from_secs(15)',
          cpp: 'timeout = 15',
          c: 'timeout = 15',
        };

        expect(files.some((file) => file.content.includes(streamTokens[language]))).toBe(true);
        expect(files.some((file) => file.content.includes(timeoutTokens[language]))).toBe(true);
      });

      if (language === 'typescript') {
        it('generates typed REST resource methods', async () => {
          const plugin = registry.get(language)!;
          const context = await createContext(language, packageName);
          const files = await plugin.generate(context);

          const petsResource = files.find((file) => file.path === 'src/resources/pets.ts');
          const ownersResource = files.find((file) => file.path === 'src/resources/owners.ts');

          expect(petsResource?.content).toContain(
            'async create(body: Types.CreatePetRequest): Promise<Types.Pet>',
          );
          expect(petsResource?.content).toContain('async get(petId: string): Promise<Types.Pet>');
          expect(petsResource?.content).toContain(
            'async list(limit?: number, cursor?: string): Promise<Types.ListPetsResponse>',
          );
          expect(petsResource?.content).toContain('async _delete(petId: string): Promise<void>');
          expect(ownersResource?.content).toContain(
            'async create(body: Types.CreateOwnerRequest): Promise<Types.Owner>',
          );
        });
      }
    });
  }

  it('generates valid TypeScript names while preserving OpenAPI wire property names', async () => {
    const parser = new OpenAPIParser();
    const spec = await parser.parse(TOLERANT_FIXTURE_PATH);
    const context = await createContext('typescript', '@test/compatibility-sdk');
    context.spec = spec;

    const files = await registry.get('typescript')!.generate(context);
    const client = files.find((file) => file.path === 'src/client.ts')?.content;
    const types = files.find((file) => file.path === 'src/types.ts')?.content;

    expect(files.map((file) => file.path)).toContain('src/resources/default.ts');
    expect(client).toContain('readonly _default: DefaultResource;');
    expect(types).toContain('"24-hour-value"?: number;');
    expect(types).toContain('"data.source"?: string;');
    expect(files.find((file) => file.path === 'src/resources/default.ts')?.content).toContain(
      'async getMeasurements(_from: number | undefined, symbol: string)',
    );
    expect(files.find((file) => file.path === 'README.md')?.content).toContain(
      'client._default.getMeasurements',
    );
  });

  it('adds the configured repository to every SDK package', async () => {
    const repository = 'https://github.com/acme/generated-sdk';
    const nativeManifests: Record<string, string | undefined> = {
      typescript: 'package.json',
      python: 'pyproject.toml',
      java: 'pom.xml',
      kotlin: 'build.gradle.kts',
      ruby: 'petstore_api.gemspec',
      php: 'composer.json',
      csharp: 'PetstoreApi.csproj',
      rust: 'Cargo.toml',
      cpp: 'conanfile.py',
      c: 'conanfile.py',
    };

    for (const { language, packageName } of testCases) {
      const context = await createContext(language, packageName);
      context.languageConfig.github_repository = repository;
      context.config.sources[0].languages[0].github_repository = repository;
      const files = await registry.get(language)!.generate(context);
      const metadata = JSON.parse(
        files.find((file) => file.path === '.cortex-package.json')!.content,
      );
      expect(metadata.githubRepository).toBe(repository);
      expect(files.find((file) => file.path === 'README.md')?.content).toContain(
        `[Source repository](${repository})`,
      );
      const manifest = nativeManifests[language];
      if (manifest)
        expect(files.find((file) => file.path === manifest)?.content).toContain(repository);
    }
  });
});
