import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { OpenAPIParser } from '@cortex/core';
import type { CortexConfig } from '@cortex/core';
import { createDefaultRegistry } from '../src/index';
import { CodegenEngine } from '../src/engine';
import { FileEmitter } from '../src/emitter';
import { getLanguageNaming } from '../src/naming';
import type { CodegenContext } from '../src/plugin';

const FIXTURE_PATH = path.join(__dirname, '../../core/__fixtures__/petstore.yaml');

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
      expectedFiles: ['setup.py', 'pyproject.toml'],
    },
    {
      language: 'go',
      packageName: 'github.com/test/petstore',
      expectedFiles: ['go.mod', 'src/client.go', 'src/types.go'],
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
          expect(petsResource?.content).toContain('async delete(petId: string): Promise<void>');
          expect(ownersResource?.content).toContain(
            'async create(body: Types.CreateOwnerRequest): Promise<Types.Owner>',
          );
        });
      }
    });
  }
});
