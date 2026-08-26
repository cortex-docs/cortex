import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ConfigLoader } from '../src/config/loader';
import {
  getAllLanguageTemplateDirs,
  gitRepositoryUrl,
  normalizeRepositoryUrl,
  resolveGeneratorTemplateRoot,
  resolveLanguageTemplateDir,
} from '../src/config/utils';

describe('ConfigLoader', () => {
  const loader = new ConfigLoader();

  describe('validate', () => {
    it('validates a correct config', () => {
      const config = loader.validate({
        project: 'acme',
        sources: [
          {
            title: 'REST API V1',
            type: 'openapi-spec',
            spec: './openapi.yaml',
            languages: [{ language: 'typescript', package_name: '@acme/sdk' }],
          },
        ],
      });

      expect(config.project).toBe('acme');
      expect(config.sources).toHaveLength(1);
      expect(config.sources[0].type).toBe('openapi-spec');
      expect(config.languages).toHaveLength(1);
      expect(config.languages[0].language).toBe('typescript');
      expect(config.languages[0].package_name).toBe('@acme/sdk');
      expect(config.languages[0].output_dir).toBe('./generated/typescript/acme-sdk');
      expect(config.output.base_dir).toBe('./generated');
    });

    it('allows a documentation-only config with no API sources', () => {
      const config = loader.validate({
        project: 'acme',
        sources: [],
      });

      expect(config.sources).toEqual([]);
      expect(config.languages).toEqual([]);
    });

    it('rejects config with unsupported language', () => {
      expect(() =>
        loader.validate({
          project: 'acme',
          sources: [
            {
              title: 'REST API V1',
              type: 'openapi-spec',
              spec: './openapi.yaml',
              languages: [{ language: 'brainfuck', package_name: 'test' }],
            },
          ],
        }),
      ).toThrow('Invalid cortex config');
    });

    it('applies defaults', () => {
      const config = loader.validate({
        project: 'acme',
        sources: [
          {
            title: 'REST API V1',
            type: 'openapi-spec',
            spec: './openapi.yaml',
            languages: [{ language: 'python', package_name: 'acme' }],
          },
        ],
      });

      expect(config.output.base_dir).toBe('./generated');
      expect(config.theme).toBe('system');
    });

    it('validates and resolves a custom generator template root', () => {
      const config = loader.validate({
        project: 'acme',
        generators: { templates: './cortex-templates' },
        sources: [],
      });

      expect(config.generators).toEqual({ templates: './cortex-templates' });
      expect(resolveGeneratorTemplateRoot(config, '/workspace/acme/cortex.config.yml')).toBe(
        path.resolve('/workspace/acme/cortex-templates'),
      );
    });

    it('rejects an empty custom generator template root', () => {
      expect(() =>
        loader.validate({
          project: 'acme',
          generators: { templates: '' },
          sources: [],
        }),
      ).toThrow('Invalid cortex config');
    });

    it('validates and resolves a source-language template directory', () => {
      const config = loader.validate({
        project: 'acme',
        sources: [
          {
            title: 'REST API V1',
            type: 'openapi-spec',
            spec: './openapi.yaml',
            languages: [
              {
                language: 'typescript',
                package_name: '@acme/sdk',
                template: './cortex-templates/custom-typescript',
              },
            ],
          },
        ],
      });

      const language = config.sources[0].languages[0];
      const expected = path.resolve('/workspace/acme/cortex-templates/custom-typescript');
      expect(language.template).toBe('./cortex-templates/custom-typescript');
      expect(config.languages[0].template).toBe('./cortex-templates/custom-typescript');
      expect(resolveLanguageTemplateDir(language, '/workspace/acme/cortex.config.yml')).toBe(
        expected,
      );
      expect(getAllLanguageTemplateDirs(config, '/workspace/acme/cortex.config.yml')).toEqual([
        expected,
      ]);
    });

    it('rejects an empty source-language template directory', () => {
      expect(() =>
        loader.validate({
          project: 'acme',
          sources: [
            {
              title: 'REST API V1',
              type: 'openapi-spec',
              spec: './openapi.yaml',
              languages: [{ language: 'typescript', package_name: '@acme/sdk', template: '' }],
            },
          ],
        }),
      ).toThrow('Invalid cortex config');
    });

    it('validates publish registries and applies package-level overrides', () => {
      const config = loader.validate({
        project: 'acme',
        publish: {
          mcp: {
            url: 'http://localhost:4873',
            token_env: 'MCP_NPM_TOKEN',
            access: 'public',
          },
          registries: {
            typescript: {
              url: 'http://localhost:4873',
              token_env: 'NPM_TOKEN',
              access: 'restricted',
            },
          },
        },
        sources: [
          {
            title: 'REST',
            type: 'openapi-spec',
            spec: './openapi.yaml',
            languages: [
              { language: 'typescript', package_name: '@acme/public' },
              {
                language: 'python',
                package_name: 'acme-private',
                publish: { url: 'http://localhost:8080', auth: false },
              },
            ],
          },
        ],
      });

      expect(config.publish?.mcp?.token_env).toBe('MCP_NPM_TOKEN');
      expect(config.languages[0].publish?.token_env).toBe('NPM_TOKEN');
      expect(config.languages[1].publish).toEqual({ url: 'http://localhost:8080', auth: false });
    });

    it('validates GitHub and GitHub-only publish configuration', () => {
      const config = loader.validate({
        project: 'acme',
        sources: [
          {
            title: 'REST',
            type: 'openapi-spec',
            spec: './openapi.yaml',
            languages: [
              {
                language: 'typescript',
                package_name: '@acme/sdk',
                github_repository: 'github.com/acme/sdk',
                publish: {
                  enabled: false,
                  github: { token_env: 'SDK_GITHUB_TOKEN', branch: 'generated/main' },
                },
              },
            ],
          },
        ],
      });

      expect(config.languages[0].publish).toMatchObject({
        enabled: false,
        github: { token_env: 'SDK_GITHUB_TOKEN', branch: 'generated/main' },
      });
    });

    it('rejects inline or invalid credential environment names', () => {
      expect(() =>
        loader.validate({
          project: 'acme',
          sources: [
            {
              title: 'REST',
              type: 'openapi-spec',
              spec: './openapi.yaml',
              languages: [
                {
                  language: 'typescript',
                  package_name: '@acme/sdk',
                  publish: { token_env: 'not valid' },
                },
              ],
            },
          ],
        }),
      ).toThrow('Invalid cortex config');
    });

    it('validates docs sections', () => {
      const config = loader.validate({
        project: 'acme',
        title: 'My API',
        theme: 'dark',
        sources: [
          {
            title: 'REST API V1',
            type: 'openapi-spec',
            spec: './openapi.yaml',
            languages: [{ language: 'typescript', package_name: '@acme/sdk' }],
          },
        ],
        docs: [
          {
            section: 'Get started',
            sources: [{ title: 'Quickstart', document: 'docs/quickstart.md' }],
          },
        ],
      });

      expect(config.title).toBe('My API');
      expect(config.theme).toBe('dark');
      expect(config.docs).toHaveLength(1);
      expect(config.docs?.[0].section).toBe('Get started');
    });

    it('computes effective languages from multiple sources sharing package_name', () => {
      const config = loader.validate({
        project: 'acme',
        sources: [
          {
            title: 'REST API V1',
            type: 'openapi-spec',
            spec: './openapi.yaml',
            languages: [
              { language: 'typescript', package_name: '@acme/sdk' },
              { language: 'python', package_name: 'acme-sdk' },
            ],
          },
          {
            title: 'WebSocket API',
            type: 'asyncapi-spec',
            spec: './asyncapi.yaml',
            languages: [{ language: 'typescript', package_name: '@acme/sdk' }],
          },
        ],
      });

      expect(config.languages).toHaveLength(2);
      expect(config.languages[0].language).toBe('typescript');
      expect(config.languages[1].language).toBe('python');
    });

    it('validates all source types', () => {
      const config = loader.validate({
        project: 'acme',
        sources: [
          {
            title: 'REST',
            type: 'openapi-spec',
            spec: './api.yaml',
            languages: [{ language: 'typescript', package_name: '@acme/sdk' }],
          },
          {
            title: 'WS',
            type: 'asyncapi-spec',
            spec: './ws.yaml',
            languages: [{ language: 'typescript', package_name: '@acme/sdk' }],
          },
          {
            title: 'GQL',
            type: 'graphql-spec',
            spec: './schema.graphql',
            endpoint: 'http://localhost:4000/graphql',
            languages: [{ language: 'typescript', package_name: '@acme/sdk' }],
          },
          {
            title: 'gRPC',
            type: 'grpc-spec',
            spec: './service.proto',
            try_now_url: 'http://localhost:4010',
            languages: [{ language: 'typescript', package_name: '@acme/sdk' }],
          },
        ],
      });

      expect(config.sources).toHaveLength(4);
      expect(config.sources[2].endpoint).toBe('http://localhost:4000/graphql');
      expect(config.sources[3].try_now_url).toBe('http://localhost:4010');
    });

    it('rejects unknown fields and protocol-specific fields in the wrong source', () => {
      expect(() =>
        loader.validate({
          project: 'acme',
          unexpected: true,
          sources: [],
        }),
      ).toThrow('Unrecognized key');

      expect(() =>
        loader.validate({
          project: 'acme',
          sources: [
            {
              title: 'REST',
              type: 'openapi-spec',
              spec: './openapi.yaml',
              endpoint: 'https://api.example.com/graphql',
              languages: [{ language: 'typescript', package_name: '@acme/sdk' }],
            },
          ],
        }),
      ).toThrow('An endpoint is only valid for a graphql-spec source');

      expect(() =>
        loader.validate({
          project: 'acme',
          sources: [
            {
              title: 'REST',
              type: 'openapi-spec',
              spec: './openapi.yaml',
              try_now_url: 'https://api.example.com',
              languages: [{ language: 'typescript', package_name: '@acme/sdk' }],
            },
          ],
        }),
      ).toThrow('A Try now URL is only valid for a grpc-spec or openrpc-spec source');

      expect(() =>
        loader.validate({
          project: 'acme',
          sources: [],
          publish: { registries: { unknown: { url: 'https://registry.example.com' } } },
        }),
      ).toThrow('Unrecognized key');
    });

    it('validates project-specific WebSocket heartbeat flows', () => {
      const config = loader.validate({
        project: 'acme',
        sources: [
          {
            title: 'Realtime API',
            type: 'asyncapi-spec',
            spec: './asyncapi.yaml',
            websocket: {
              heartbeat: {
                format: 'json',
                interval_ms: 12_000,
                timeout_ms: 4_000,
                client: {
                  message: { action: 'client-heartbeat' },
                  response: { action: 'server-alive' },
                },
                server: {
                  message: { action: 'server-heartbeat' },
                  response: { action: 'client-alive' },
                },
              },
            },
            languages: [{ language: 'typescript', package_name: '@acme/sdk' }],
          },
        ],
      });

      expect(config.sources[0].websocket?.heartbeat).toMatchObject({
        enabled: true,
        format: 'json',
        interval_ms: 12_000,
        timeout_ms: 4_000,
      });
    });

    it('rejects incomplete or misplaced WebSocket heartbeat options', () => {
      expect(() =>
        loader.validate({
          project: 'acme',
          sources: [
            {
              title: 'REST',
              type: 'openapi-spec',
              spec: './openapi.yaml',
              websocket: { heartbeat: { client: { message: 'ping' } } },
              languages: [{ language: 'typescript', package_name: '@acme/sdk' }],
            },
          ],
        }),
      ).toThrow('WebSocket options are only valid for asyncapi-spec sources');

      expect(() =>
        loader.validate({
          project: 'acme',
          sources: [
            {
              title: 'Realtime',
              type: 'asyncapi-spec',
              spec: './asyncapi.yaml',
              websocket: {
                heartbeat: {
                  server: { message: { action: 'ping' } },
                },
              },
              languages: [{ language: 'typescript', package_name: '@acme/sdk' }],
            },
          ],
        }),
      ).toThrow('A server heartbeat requires the client response');

      expect(() =>
        loader.validate({
          project: 'acme',
          sources: [
            {
              title: 'Realtime',
              type: 'asyncapi-spec',
              spec: './asyncapi.yaml',
              websocket: {
                heartbeat: {
                  format: 'text',
                  client: { message: { type: 'ping' } },
                },
              },
              languages: [{ language: 'typescript', package_name: '@acme/sdk' }],
            },
          ],
        }),
      ).toThrow('Text heartbeat messages must be non-empty strings');
    });

    it('includes github_repository in effective languages', () => {
      const config = loader.validate({
        project: 'acme',
        sources: [
          {
            title: 'REST API V1',
            type: 'openapi-spec',
            spec: './openapi.yaml',
            languages: [
              {
                language: 'typescript',
                package_name: '@acme/sdk',
                github_repository: 'github.com/acme/sdk',
              },
            ],
          },
        ],
      });

      expect(config.languages[0].github_repository).toBe('github.com/acme/sdk');
    });

    it('puts documentation site settings at root level', () => {
      const config = loader.validate({
        project: 'acme',
        title: 'Acme API',
        logo: './logo.png',
        custom_head_html: '<meta name="theme-color" content="#ffffff">',
        theme: 'light',
        sources: [
          {
            title: 'REST',
            type: 'openapi-spec',
            spec: './api.yaml',
            languages: [{ language: 'typescript', package_name: '@acme/sdk' }],
          },
        ],
      });

      expect(config.title).toBe('Acme API');
      expect(config.logo).toBe('./logo.png');
      expect(config.custom_head_html).toBe('<meta name="theme-color" content="#ffffff">');
      expect(config.theme).toBe('light');
    });
  });

  it('resolves project paths relative to the config file', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-config-'));
    const projectDir = path.join(workspace, 'project');
    fs.mkdirSync(projectDir, { recursive: true });
    const configPath = path.join(projectDir, 'cortex.config.yml');
    fs.writeFileSync(
      configPath,
      [
        'project: acme',
        'logo: assets/logo.svg',
        'logo_dark: assets/logo-dark.svg',
        'logo_light: https://cdn.example.com/logo.svg',
        'favicon: assets/favicon.svg',
        'generators:',
        '  templates: templates',
        'output:',
        '  base_dir: generated',
        'home:',
        '  sections:',
        '    - title: Reference',
        '      description: Browse the API.',
        '      badge: API',
        '      href: /reference',
        '      icon: assets/reference.svg',
        'sources:',
        '  - title: REST',
        '    type: openapi-spec',
        '    spec: specs/openapi.yaml',
        '    intro: docs/rest.md',
        '    languages:',
        '      - language: typescript',
        '        package_name: "@acme/sdk"',
        '        template: templates/typescript',
        'docs:',
        '  - section: Start',
        '    sources:',
        '      - title: Quickstart',
        '        document: docs/quickstart.md',
      ].join('\n'),
      'utf-8',
    );

    try {
      const config = await loader.load(configPath);
      expect(config.sources[0].spec).toBe(path.join(projectDir, 'specs/openapi.yaml'));
      expect(config.sources[0].intro).toBe(path.join(projectDir, 'docs/rest.md'));
      expect(config.sources[0].languages[0].template).toBe(
        path.join(projectDir, 'templates/typescript'),
      );
      expect(config.languages[0].output_dir).toBe(
        path.join(projectDir, 'generated/typescript/acme-sdk'),
      );
      expect(config.generators?.templates).toBe(path.join(projectDir, 'templates'));
      expect(config.docs?.[0].sources[0].document).toBe(
        path.join(projectDir, 'docs/quickstart.md'),
      );
      expect(config.home?.sections?.[0].icon).toBe(path.join(projectDir, 'assets/reference.svg'));
      expect(config.logo).toBe(path.join(projectDir, 'assets/logo.svg'));
      expect(config.logo_dark).toBe(path.join(projectDir, 'assets/logo-dark.svg'));
      expect(config.logo_light).toBe('https://cdn.example.com/logo.svg');
      expect(config.favicon).toBe(path.join(projectDir, 'assets/favicon.svg'));
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });
});

describe('repository URL helpers', () => {
  it('normalizes GitHub web, shorthand, and SSH URLs', () => {
    expect(normalizeRepositoryUrl('github.com/acme/sdk.git')).toBe('https://github.com/acme/sdk');
    expect(normalizeRepositoryUrl('git@github.com:acme/sdk.git')).toBe(
      'https://github.com/acme/sdk',
    );
    expect(gitRepositoryUrl('github.com/acme/sdk')).toBe('https://github.com/acme/sdk.git');
    expect(gitRepositoryUrl('file:///tmp/sdk.git')).toBe('file:///tmp/sdk.git');
  });
});
