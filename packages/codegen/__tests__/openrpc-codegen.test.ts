import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { OpenRpcParser } from '@cortex/core';
import {
  OpenRpcTemplateEngine,
  createOpenRpcPluginForLanguage,
} from '../src/languages/openrpc-template-plugin';

const OPENRPC_FIXTURE = path.join(__dirname, '../../core/__fixtures__/petstore-openrpc.json');
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

async function generateOpenRpc(language: string) {
  const spec = await new OpenRpcParser().parse(OPENRPC_FIXTURE);
  const languageConfig = createOpenRpcPluginForLanguage(language)!;
  return new OpenRpcTemplateEngine().generate(
    spec,
    `test-${language}`,
    '0.1.0',
    languageConfig,
    'Petstore JSON-RPC',
  );
}

describe('OpenRPC code generation', () => {
  for (const language of languages) {
    it(`${language} generates a client and schema types for every method`, async () => {
      const files = await generateOpenRpc(language);
      const client = files.find((file) => file.path.includes('openrpc-client'));
      const types = files.find((file) => file.path.includes('openrpc-types'));

      expect(client?.content).toBeTruthy();
      expect(types?.content).toBeTruthy();

      const clientText = client!.content.toLowerCase();
      expect(clientText).toMatch(/url|endpoint/);
      for (const method of ['listpets', 'getpet', 'createpet', 'deletepet', 'listowners']) {
        expect(clientText.replaceAll('_', '')).toContain(method);
      }

      const typeText = types!.content.toLowerCase();
      expect(typeText).toContain('pet');
      expect(typeText).toContain('owner');
      expect(typeText).toContain('species');
      expect(typeText).toContain('petstatus');
    });
  }

  it('returns null for an unsupported language', () => {
    expect(createOpenRpcPluginForLanguage('unsupported')).toBeNull();
  });
});
