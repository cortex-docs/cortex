import { describe, it, expect } from 'vitest';
import { ConfigLoader } from '../src/config/loader';

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

    it('rejects config with no sources', () => {
      expect(() =>
        loader.validate({
          project: 'acme',
          sources: [],
        }),
      ).toThrow('Invalid cortex config');
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
            languages: [{ language: 'typescript', package_name: '@acme/sdk' }],
          },
          {
            title: 'gRPC',
            type: 'grpc-spec',
            spec: './service.proto',
            languages: [{ language: 'typescript', package_name: '@acme/sdk' }],
          },
        ],
      });

      expect(config.sources).toHaveLength(4);
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

    it('puts title/logo/theme at root level', () => {
      const config = loader.validate({
        project: 'acme',
        title: 'Acme API',
        logo: './logo.png',
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
      expect(config.theme).toBe('light');
    });
  });
});
