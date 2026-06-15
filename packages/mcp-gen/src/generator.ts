import * as fs from 'node:fs';
import * as path from 'node:path';
import { Eta } from 'eta';
import type { ParsedSpec, CortexConfig, AsyncApiSpec, GraphQLSpec, GrpcSpec } from '@cortex/core';
import { getFirstSpecPath } from '@cortex/core';
import { mapOperationsToTools, mapChannelsToTools, mapGraphQLToTools, mapGrpcToTools } from './tool-mapper';
import { toolsToInfos, buildConfigTools } from './tool-info';
import { generateReadme } from './readme-content';

export interface McpGenOptions {
  serverName?: string;
  packageName?: string;
  transport?: 'stdio' | 'sse';
  outputDir: string;
  configDir?: string;
  asyncApiSpec?: AsyncApiSpec;
  graphqlSpec?: GraphQLSpec;
  grpcSpec?: GrpcSpec;
  specPaths?: {
    openapi?: string;
    asyncapi?: string;
    graphql?: string;
    grpc?: string;
  };
  instructions?: string;
}

export interface McpGenResult {
  files: string[];
}

export class McpGenerator {
  private eta = new Eta({ autoEscape: false, autoTrim: false });

  async generate(spec: ParsedSpec, config: CortexConfig, options: McpGenOptions): Promise<McpGenResult> {
    const restTools = mapOperationsToTools(spec.operations);
    const wsTools = options.asyncApiSpec ? mapChannelsToTools(options.asyncApiSpec.channels) : [];
    const gqlTools = options.graphqlSpec
      ? mapGraphQLToTools(options.graphqlSpec.queries, options.graphqlSpec.mutations, options.graphqlSpec.subscriptions)
      : [];
    const grpcTools = options.grpcSpec
      ? mapGrpcToTools(options.grpcSpec.services, options.grpcSpec.messages)
      : [];
    const tools = [...restTools, ...wsTools, ...gqlTools, ...grpcTools];
    const serverName = options.serverName ?? `${config.project}-mcp`;
    const packageName = options.packageName ?? config.mcp?.package_name ?? `@${config.project}/mcp`;
    const transport = options.transport ?? 'stdio';
    const outputDir = path.resolve(options.outputDir);
    const baseUrl = spec.info.servers[0]?.url ?? 'http://localhost:3000';

    fs.mkdirSync(outputDir, { recursive: true });
    fs.mkdirSync(path.join(outputDir, 'src'), { recursive: true });

    const esc = (s?: string) => (s ?? '').replace(/'/g, "\\'").replace(/\n/g, ' ');

    const zodType = (type: string, required: boolean, description?: string) => {
      const base = type === 'number' ? 'z.number()' : type === 'boolean' ? 'z.boolean()' : type === 'array' ? 'z.array(z.unknown())' : type === 'object' ? 'z.object({})' : 'z.string()';
      const opt = required ? base : `${base}.optional()`;
      return description ? `${opt}.describe('${esc(description)}')` : opt;
    };

    const specToolInfos = toolsToInfos(tools);
    const configTools = options.configDir ? buildConfigTools(config, options.configDir) : [];
    const sourceOrder: Record<string, number> = { docs: 0, rest: 1, websocket: 2, graphql: 3, grpc: 4 };
    const toolInfos = [...specToolInfos, ...configTools]
      .sort((a, b) => (sourceOrder[a.source] ?? 5) - (sourceOrder[b.source] ?? 5));

    const templateData = {
      serverName,
      specTitle: spec.info.title,
      baseUrl,
      tools,
      toolInfos,
      transport,
      specs: options.specPaths ?? { openapi: getFirstSpecPath(config, 'openapi-spec') },
      esc,
      zodType,
    };

    const files: string[] = [];

    const templates: Array<{ name: string; output: string }> = [
      { name: 'package-json', output: 'package.json' },
      { name: 'tsconfig-json', output: 'tsconfig.json' },
      { name: 'server', output: 'src/server.ts' },
      { name: 'handlers', output: 'src/handlers.ts' },
      { name: transport === 'sse' ? 'main-sse' : 'main-stdio', output: 'src/main.ts' },
    ];

    for (const tpl of templates) {
      const templateContent = this.loadTemplate(tpl.name);
      const rendered = this.eta.renderString(templateContent, templateData);
      const filePath = path.join(outputDir, tpl.output);
      fs.writeFileSync(filePath, rendered, 'utf-8');
      files.push(tpl.output);
    }

    const readmeContent = generateReadme({
      serverName,
      packageName,
      specTitle: spec.info.title,
      transport,
      toolInfos,
      instructions: options.instructions,
    });
    fs.writeFileSync(path.join(outputDir, 'README.md'), readmeContent, 'utf-8');
    files.push('README.md');

    return { files };
  }

  private loadTemplate(name: string): string {
    const fromDist = path.resolve(__dirname, '../templates', `${name}.ejs`);
    if (fs.existsSync(fromDist)) return fs.readFileSync(fromDist, 'utf-8');
    const fromSrc = path.resolve(__dirname, '../../templates', `${name}.ejs`);
    if (fs.existsSync(fromSrc)) return fs.readFileSync(fromSrc, 'utf-8');
    throw new Error(`MCP template not found: ${name}.ejs`);
  }
}
