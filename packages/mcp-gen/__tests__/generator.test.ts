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
    };

    const result = await generator.generate(spec, config, { outputDir });

    expect(result.files).toContain('package.json');
    expect(result.files).toContain('src/server.ts');
    expect(result.files).toContain('src/handlers.ts');
    expect(result.files).toContain('src/main.ts');

    expect(fs.existsSync(path.join(outputDir, 'src/server.ts'))).toBe(true);

    fs.rmSync(outputDir, { recursive: true });
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

  it('includes request body fields in input schema', async () => {
    const parser = new OpenAPIParser();
    const spec = await parser.parse(FIXTURE_PATH);
    const tools = mapOperationsToTools(spec.operations);

    const createPetTool = tools.find((t) => t.name === 'pets_create')!;
    expect(createPetTool.inputSchema.properties).toHaveProperty('name');
    expect(createPetTool.inputSchema.properties).toHaveProperty('species');
  });
});
