import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { OpenAPIParser } from '@cortex/core';
import type { CortexConfig } from '@cortex/core';
import { McpGenerator } from '../src/generator';
import { mapOperationsToTools } from '../src/tool-mapper';

const FIXTURE_PATH = path.join(__dirname, '../../core/__fixtures__/petstore.yaml');

describe('McpGenerator', () => {
  const generator = new McpGenerator();

  it('generates MCP server files', async () => {
    const parser = new OpenAPIParser();
    const spec = await parser.parse(FIXTURE_PATH);
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-mcp-'));

    const config: CortexConfig = {
      project: 'test',
      sources: [
        {
          title: 'REST API V1',
          type: 'openapi-spec',
          spec: FIXTURE_PATH,
          languages: [{ language: 'typescript', package_name: 'test' }],
        },
      ],
      output: { base_dir: './generated' },
      languages: [{ language: 'typescript', package_name: 'test', output_dir: './out' }],
      mcp: { github_repository: 'github.com/acme/mcp' },
    };

    const result = await generator.generate(spec, config, { outputDir });

    expect(result.files).toContain('package.json');
    expect(result.files).toContain('src/server.ts');
    expect(result.files).toContain('src/handlers.ts');
    expect(result.files).toContain('src/main.ts');
    expect(result.files).toContain('.cortex-package.json');
    expect(result.files).toContain('specs/openapi.yaml');

    expect(fs.existsSync(path.join(outputDir, 'src/server.ts'))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(outputDir, 'package.json'), 'utf8'))).toMatchObject(
      {
        name: '@test/mcp',
        version: '0.0.0',
        main: './dist/server.js',
        repository: { type: 'git', url: 'git+https://github.com/acme/mcp.git' },
      },
    );
    expect(
      JSON.parse(fs.readFileSync(path.join(outputDir, '.cortex-package.json'), 'utf8')),
    ).toEqual({
      schemaVersion: 1,
      kind: 'mcp-server',
      language: 'typescript',
      packageName: '@test/mcp',
      version: '0.0.0',
      githubRepository: 'https://github.com/acme/mcp',
    });
    expect(fs.readFileSync(path.join(outputDir, 'README.md'), 'utf8')).toContain(
      '[Source repository](https://github.com/acme/mcp)',
    );
    expect(fs.readFileSync(path.join(outputDir, 'specs/openapi.yaml'), 'utf8')).toContain(
      "openapi: '3.1.0'",
    );
    expect(fs.readFileSync(path.join(outputDir, 'src/server.ts'), 'utf8')).toContain(
      "path.resolve(__dirname, '../specs/openapi.yaml')",
    );

    fs.rmSync(outputDir, { recursive: true });
  });

  it('embeds every configured specification as a distinct resource', async () => {
    const parser = new OpenAPIParser();
    const spec = await parser.parse(FIXTURE_PATH);
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-mcp-specs-'));
    const config: CortexConfig = {
      project: 'test',
      sources: [],
      output: { base_dir: './generated' },
      languages: [],
    };

    const result = await generator.generate(spec, config, {
      outputDir,
      specPaths: { openapi: [FIXTURE_PATH, FIXTURE_PATH] },
    });

    expect(result.files).toEqual(
      expect.arrayContaining(['specs/openapi.yaml', 'specs/openapi-2.yaml']),
    );
    const server = fs.readFileSync(path.join(outputDir, 'src/server.ts'), 'utf8');
    expect(server).toContain("uri: 'api://specs/openapi'");
    expect(server).toContain("uri: 'api://specs/openapi/2'");
    fs.rmSync(outputDir, { recursive: true });
  });

  it('registers configured documentation and SDK references as working tools', async () => {
    const parser = new OpenAPIParser();
    const spec = await parser.parse(FIXTURE_PATH);
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-mcp-docs-'));
    const outputDir = path.join(workspace, 'mcp');
    fs.mkdirSync(path.join(workspace, 'sdk'), { recursive: true });
    fs.writeFileSync(path.join(workspace, 'guide.md'), '# Integration guide\n', 'utf-8');
    fs.writeFileSync(path.join(workspace, 'intro.md'), '# REST introduction\n', 'utf-8');
    fs.writeFileSync(path.join(workspace, 'sdk', 'README.md'), '# TypeScript SDK\n', 'utf-8');
    const config: CortexConfig = {
      project: 'test',
      docs: [
        {
          section: 'Start',
          sources: [{ title: 'Guide', document: 'guide.md' }],
        },
      ],
      sources: [
        {
          title: 'REST',
          type: 'openapi-spec',
          spec: FIXTURE_PATH,
          intro: 'intro.md',
          languages: [{ language: 'typescript', package_name: '@test/sdk' }],
        },
      ],
      output: { base_dir: workspace },
      languages: [
        {
          language: 'typescript',
          package_name: '@test/sdk',
          output_dir: 'sdk',
        },
      ],
    };

    await generator.generate(spec, config, { outputDir, configDir: workspace });

    const server = fs.readFileSync(path.join(outputDir, 'src/server.ts'), 'utf-8');
    expect(server).toContain("'docs_guide'");
    expect(server).toContain("'intro_rest'");
    expect(server).toContain("'sdk_typescript_test_sdk'");
    expect(server).toContain('# Integration guide');
    expect(server).toContain('# TypeScript SDK');
    fs.rmSync(workspace, { recursive: true });
  });

  it('uses named and final-file MCP overrides', async () => {
    const parser = new OpenAPIParser();
    const spec = await parser.parse(FIXTURE_PATH);
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-mcp-custom-'));
    const outputDir = path.join(workspace, 'output');
    const templateRoot = path.join(workspace, 'templates');
    fs.mkdirSync(path.join(templateRoot, 'mcp', 'files'), { recursive: true });
    fs.writeFileSync(
      path.join(templateRoot, 'mcp', 'server.ejs'),
      '// custom server: <%= it.serverName %>\n',
      'utf-8',
    );
    fs.writeFileSync(
      path.join(templateRoot, 'mcp', 'readme.ejs'),
      '# Custom <%= it.specTitle %> MCP\n',
      'utf-8',
    );
    fs.writeFileSync(
      path.join(templateRoot, 'mcp', 'files', 'package.json.ejs'),
      '<%= JSON.stringify({ name: it.packageName, custom: it.generator }) %>\n',
      'utf-8',
    );

    const config: CortexConfig = {
      project: 'test',
      sources: [
        {
          title: 'REST API V1',
          type: 'openapi-spec',
          spec: FIXTURE_PATH,
          languages: [{ language: 'typescript', package_name: 'test' }],
        },
      ],
      output: { base_dir: './generated' },
      generators: { templates: templateRoot },
      languages: [{ language: 'typescript', package_name: 'test', output_dir: './out' }],
    };

    await generator.generate(spec, config, { outputDir });

    expect(fs.readFileSync(path.join(outputDir, 'src/server.ts'), 'utf-8')).toContain(
      'custom server: test-mcp',
    );
    expect(fs.readFileSync(path.join(outputDir, 'README.md'), 'utf-8')).toContain(
      '# Custom Petstore API MCP',
    );
    expect(JSON.parse(fs.readFileSync(path.join(outputDir, 'package.json'), 'utf-8'))).toEqual({
      name: '@test/mcp',
      custom: 'mcp',
    });
    fs.rmSync(workspace, { recursive: true });
  });
});

describe('mapOperationsToTools', () => {
  it('maps operations to MCP tools', async () => {
    const parser = new OpenAPIParser();
    const spec = await parser.parse(FIXTURE_PATH);
    const tools = mapOperationsToTools(spec.operations);

    expect(tools.length).toBe(spec.operations.length);

    const listPetsTool = tools.find((t) => t.name === 'pets_list');
    expect(listPetsTool).toBeDefined();
    expect(listPetsTool!.description).toBe('List all pets');
    expect(listPetsTool!.inputSchema.type).toBe('object');
  });

  it('includes parameters in input schema', async () => {
    const parser = new OpenAPIParser();
    const spec = await parser.parse(FIXTURE_PATH);
    const tools = mapOperationsToTools(spec.operations);

    const listPetsTool = tools.find((t) => t.name === 'pets_list')!;
    expect(listPetsTool.inputSchema.properties).toHaveProperty('limit');
    expect(listPetsTool.inputSchema.properties).toHaveProperty('cursor');
  });

  it('preserves OpenAPI number parameter types', async () => {
    const parser = new OpenAPIParser();
    const spec = await parser.parse(
      path.join(__dirname, '../../core/__fixtures__/openapi-tolerant.yaml'),
    );
    const tools = mapOperationsToTools(spec.operations);

    expect(tools[0].inputSchema.properties.from.type).toBe('number');
  });

  it('includes request body fields in input schema', async () => {
    const parser = new OpenAPIParser();
    const spec = await parser.parse(FIXTURE_PATH);
    const tools = mapOperationsToTools(spec.operations);

    const createPetTool = tools.find((t) => t.name === 'pets_create')!;
    expect(createPetTool.inputSchema.properties).toHaveProperty('name');
    expect(createPetTool.inputSchema.properties).toHaveProperty('species');
  });
});
