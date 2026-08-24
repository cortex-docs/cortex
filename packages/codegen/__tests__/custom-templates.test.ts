import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AsyncAPIParser, OpenAPIParser, type CortexConfig } from '@cortex/core';
import {
  CodegenEngine,
  FileEmitter,
  WsTemplateEngine,
  assertTemplateRoot,
  createDefaultRegistry,
  createWsPluginForLanguage,
  renderSnippet,
} from '../src';

const REST_FIXTURE = path.join(__dirname, '../../core/__fixtures__/petstore.yaml');
const WS_FIXTURE = path.join(__dirname, '../../core/__fixtures__/chat-asyncapi.yaml');

function writeTemplate(root: string, relativePath: string, content: string): void {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf-8');
}

describe('custom generator templates', () => {
  it('removes the legacy blank-tag resource artifact during regeneration', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-codegen-legacy-resource-'));
    const outputDir = path.join(workspace, 'output');
    const legacyResource = path.join(outputDir, 'src', 'resources', '.ts');
    writeTemplate(outputDir, 'src/resources/.ts', '');

    const spec = await new OpenAPIParser().parse(REST_FIXTURE);
    const config: CortexConfig = {
      project: 'test',
      sources: [
        {
          title: 'REST API V1',
          type: 'openapi-spec',
          spec: REST_FIXTURE,
          languages: [{ language: 'typescript', package_name: '@test/sdk' }],
        },
      ],
      output: { base_dir: outputDir },
      languages: [{ language: 'typescript', package_name: '@test/sdk', output_dir: outputDir }],
    };

    const result = await new CodegenEngine(createDefaultRegistry(), new FileEmitter()).generate(
      spec,
      config,
    );

    expect(result.errors).toEqual([]);
    expect(fs.existsSync(legacyResource)).toBe(false);
    fs.rmSync(workspace, { recursive: true });
  });

  it('uses sparse language overrides and final-file overrides', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-codegen-custom-'));
    const templateRoot = path.join(workspace, 'templates');
    const outputDir = path.join(workspace, 'output');
    writeTemplate(
      templateRoot,
      'languages/typescript/rest/client.ejs',
      'export const customClient = "<%= it.clientClass %>";\n',
    );
    writeTemplate(
      templateRoot,
      'languages/typescript/files/package.json.ejs',
      '<%= JSON.stringify({ custom: true, generator: it.generator, previous: JSON.parse(it.file.content).name }) %>\n',
    );

    const spec = await new OpenAPIParser().parse(REST_FIXTURE);
    const config: CortexConfig = {
      project: 'test',
      sources: [
        {
          title: 'REST API V1',
          type: 'openapi-spec',
          spec: REST_FIXTURE,
          languages: [{ language: 'typescript', package_name: '@test/sdk' }],
        },
      ],
      output: { base_dir: outputDir },
      generators: { templates: templateRoot },
      languages: [{ language: 'typescript', package_name: '@test/sdk', output_dir: outputDir }],
    };

    const result = await new CodegenEngine(createDefaultRegistry(), new FileEmitter()).generate(
      spec,
      config,
    );

    expect(result.errors).toEqual([]);
    expect(fs.readFileSync(path.join(outputDir, 'src/client.ts'), 'utf-8')).toContain(
      'customClient',
    );
    expect(fs.existsSync(path.join(outputDir, 'src/types.ts'))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(outputDir, 'package.json'), 'utf-8'))).toEqual({
      custom: true,
      generator: 'language',
      previous: '@test/sdk',
    });
    fs.rmSync(workspace, { recursive: true });
  });

  it('uses source-language overrides before shared overrides', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-codegen-source-custom-'));
    const templateRoot = path.join(workspace, 'shared-templates');
    const sourceTemplateDir = path.join(workspace, 'source-templates');
    const outputDir = path.join(workspace, 'output');
    writeTemplate(
      templateRoot,
      'languages/typescript/rest/client.ejs',
      'export const selectedTemplate = "shared";\n',
    );
    writeTemplate(
      templateRoot,
      'languages/typescript/files/package.json.ejs',
      '<%= JSON.stringify({ fallback: "shared" }) %>\n',
    );
    writeTemplate(
      sourceTemplateDir,
      'rest/client.ejs',
      'export const selectedTemplate = "source";\n',
    );

    const spec = await new OpenAPIParser().parse(REST_FIXTURE);
    const config: CortexConfig = {
      project: 'test',
      sources: [
        {
          title: 'REST API V1',
          type: 'openapi-spec',
          spec: REST_FIXTURE,
          languages: [
            {
              language: 'typescript',
              package_name: '@test/sdk',
              template: './source-templates',
            },
          ],
        },
      ],
      output: { base_dir: outputDir },
      generators: { templates: templateRoot },
      languages: [{ language: 'typescript', package_name: '@test/sdk', output_dir: outputDir }],
    };

    const result = await new CodegenEngine(createDefaultRegistry(), new FileEmitter()).generate(
      spec,
      config,
      { configPath: path.join(workspace, 'cortex.config.yml') },
    );

    expect(result.errors).toEqual([]);
    expect(fs.readFileSync(path.join(outputDir, 'src/client.ts'), 'utf-8')).toContain(
      'selectedTemplate = "source"',
    );
    expect(JSON.parse(fs.readFileSync(path.join(outputDir, 'package.json'), 'utf-8'))).toEqual({
      fallback: 'shared',
    });
    fs.rmSync(workspace, { recursive: true });
  });

  it('uses custom snippets with built-in partial fallback', () => {
    const templateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-snippet-custom-'));
    writeTemplate(
      templateRoot,
      'languages/typescript/rest/snippet.ejs',
      '<%~ include("rest/init", it) %>\n// custom snippet\n',
    );

    const snippet = renderSnippet(
      'typescript',
      'rest/snippet',
      {
        clientClass: 'PetStoreClient',
        pkgName: '@test/sdk',
        baseUrl: 'https://api.example.com',
        config: { languageConfig: { package_name: '@test/sdk' } },
        spec: { info: { servers: [{ url: 'https://api.example.com' }] } },
      },
      { templateRoot },
    );

    expect(snippet).toContain("import { PetStoreClient } from '@test/sdk'");
    expect(snippet).toContain('// custom snippet');
    fs.rmSync(templateRoot, { recursive: true });
  });

  it('applies overrides in a protocol generator', async () => {
    const templateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-ws-custom-'));
    writeTemplate(
      templateRoot,
      'languages/typescript/websocket/client.ejs',
      '// named override for <%= it.clientClass %>\n',
    );
    writeTemplate(
      templateRoot,
      'languages/typescript/files/src/ws-client.ts.ejs',
      '<%= it.file.content %>// final <%= it.generator %> override\n',
    );

    const spec = await new AsyncAPIParser().parse(WS_FIXTURE);
    const files = await new WsTemplateEngine().generate(
      spec,
      '@test/sdk',
      '1.0.0',
      createWsPluginForLanguage('typescript')!,
      'Realtime',
      undefined,
      { templateRoot },
    );
    const client = files.find((file) => file.path === 'src/ws-client.ts');

    expect(client?.content).toContain('named override for Realtime');
    expect(client?.content).toContain('final websocket override');
    fs.rmSync(templateRoot, { recursive: true });
  });

  it('reports a missing template root', () => {
    expect(() => assertTemplateRoot('/path/that/does/not/exist')).toThrow(
      'Custom template root not found: /path/that/does/not/exist',
    );
  });

  it('reports the custom template path when Eta rendering fails', () => {
    const templateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-invalid-template-'));
    const relativePath = 'languages/typescript/rest/snippet.ejs';
    writeTemplate(templateRoot, relativePath, '<% if ( %>');

    expect(() => renderSnippet('typescript', 'rest/snippet', {}, { templateRoot })).toThrow(
      path.join(templateRoot, relativePath),
    );
    fs.rmSync(templateRoot, { recursive: true });
  });
});
