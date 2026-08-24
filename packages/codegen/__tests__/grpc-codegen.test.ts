import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GrpcParser } from '@cortex-docs/core';
import {
  GrpcTemplateEngine,
  createGrpcPluginForLanguage,
} from '../src/languages/grpc-template-plugin';

const GRPC_FIXTURE = path.join(__dirname, '../../core/__fixtures__/petstore.proto');
const languages = [
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

async function generateGrpc(language: string) {
  const spec = await new GrpcParser().parse(GRPC_FIXTURE);
  const languageConfig = createGrpcPluginForLanguage(language)!;
  return new GrpcTemplateEngine().generate(
    spec,
    `test-${language}`,
    '0.1.0',
    languageConfig,
    'PetStore',
  );
}

describe('gRPC Codegen — streaming', () => {
  for (const language of languages) {
    it(`${language} generates the client, types, proto, and server stream`, async () => {
      const files = await generateGrpc(language);
      const client = files.find((file) => file.path.includes('grpc-client'));

      expect(client?.content).toBeTruthy();
      expect(files.some((file) => file.path.includes('grpc-types'))).toBe(true);
      expect(files.find((file) => file.path.endsWith('/service.proto'))?.content).toContain(
        'stream Pet',
      );
      expect(client!.content.toLowerCase()).toContain('watch');
      expect(client!.content.toLowerCase()).toContain('stream');
    });
  }
});
