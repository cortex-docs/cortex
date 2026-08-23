import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  ParsedSpec,
  CortexConfig,
  AsyncApiSpec,
  GraphQLSpec,
  OpenRpcSpec,
} from '@cortex/core';
import { gitRepositoryUrl, normalizeRepositoryUrl } from '@cortex/core';
import {
  mapOperationsToTools,
  mapChannelsToTools,
  mapGraphQLToTools,
  mapOpenRpcToTools,
} from './tool-mapper';
import { toolsToInfos, buildConfigToolDefinitions, type McpStaticTool } from './tool-info';
import { generateReadme } from './readme-content';
import { McpTemplateRenderer, type McpTemplateOptions } from './template-renderer';

export interface McpGenOptions extends McpTemplateOptions {
  serverName?: string;
  packageName?: string;
  transport?: 'stdio' | 'sse';
  outputDir: string;
  configDir?: string;
  asyncApiSpec?: AsyncApiSpec;
  graphqlSpec?: GraphQLSpec;
  openRpcSpec?: OpenRpcSpec;
  specPaths?: Partial<Record<SpecType, string | string[]>>;
  instructions?: string;
}

type SpecType = 'openapi' | 'asyncapi' | 'graphql' | 'grpc' | 'openrpc';

interface SpecResource {
  name: string;
  uri: string;
  description: string;
  mimeType: string;
  fileName: string;
}

export interface McpGenResult {
  files: string[];
}

export interface McpTemplateData {
  serverName: string;
  packageName: string;
  version: string;
  repositoryUrl?: string;
  gitRepositoryUrl?: string;
  specTitle: string;
  baseUrl: string;
  graphqlEndpoint: string;
  openRpcUrl: string;
  tools: ReturnType<typeof mapOperationsToTools>;
  toolInfos: ReturnType<typeof toolsToInfos>;
  staticTools: McpStaticTool[];
  transport: 'stdio' | 'sse';
  specs: Record<SpecType, string[]>;
  specResources: SpecResource[];
  instructions?: string;
  esc: (value?: string) => string;
  zodType: (type: string, required: boolean, description?: string) => string;
}

export class McpGenerator {
  async generate(
    spec: ParsedSpec,
    config: CortexConfig,
    options: McpGenOptions,
  ): Promise<McpGenResult> {
    const configuredRoot = config.generators?.templates;
    const templateRoot =
      options.templateRoot ??
      (configuredRoot
        ? path.resolve(options.configDir ?? process.cwd(), configuredRoot)
        : undefined);
    const renderer = new McpTemplateRenderer({ templateRoot });
    const restTools = mapOperationsToTools(spec.operations);
    const wsTools = options.asyncApiSpec ? mapChannelsToTools(options.asyncApiSpec.channels) : [];
    const gqlTools = options.graphqlSpec
      ? mapGraphQLToTools(
          options.graphqlSpec.queries,
          options.graphqlSpec.mutations,
          options.graphqlSpec.subscriptions,
        )
      : [];
    const openRpcTools = options.openRpcSpec ? mapOpenRpcToTools(options.openRpcSpec.methods) : [];
    const tools = [...restTools, ...wsTools, ...gqlTools, ...openRpcTools];
    const serverName = options.serverName ?? `${config.project}-mcp`;
    const packageName = options.packageName ?? config.mcp?.package_name ?? `@${config.project}/mcp`;
    const transport = options.transport ?? 'stdio';
    const instructions =
      options.instructions ??
      "Read the project documentation and SDK reference tools before writing integration code. Prefer a generated SDK when one supports the user's language. Use direct API tools when no suitable SDK is available.";
    const outputDir = path.resolve(options.outputDir);
    const baseUrl = spec.info.servers[0]?.url ?? 'http://localhost:3000';
    const version = this.existingVersion(outputDir);
    const repositoryUrl = config.mcp?.github_repository
      ? normalizeRepositoryUrl(config.mcp.github_repository)
      : undefined;

    fs.mkdirSync(outputDir, { recursive: true });
    fs.mkdirSync(path.join(outputDir, 'src'), { recursive: true });

    const esc = (s?: string) => (s ?? '').replace(/'/g, "\\'").replace(/\n/g, ' ');

    const zodType = (type: string, required: boolean, description?: string) => {
      const base =
        type === 'number'
          ? 'z.number()'
          : type === 'boolean'
            ? 'z.boolean()'
            : type === 'array'
              ? 'z.array(z.unknown())'
              : type === 'object'
                ? 'z.object({})'
                : 'z.string()';
      const opt = required ? base : `${base}.optional()`;
      return description ? `${opt}.describe('${esc(description)}')` : opt;
    };

    const specToolInfos = toolsToInfos(tools);
    const staticTools = options.configDir
      ? buildConfigToolDefinitions(config, options.configDir)
      : [];
    const sourceOrder: Record<string, number> = {
      docs: 0,
      rest: 1,
      websocket: 2,
      graphql: 3,
      openrpc: 4,
    };
    const toolInfos = [...specToolInfos, ...staticTools].sort(
      (a, b) => (sourceOrder[a.source] ?? 5) - (sourceOrder[b.source] ?? 5),
    );

    const specs = this.normalizeSpecPaths(
      options.specPaths ?? {
        openapi: config.sources
          ?.filter((source) => source.type === 'openapi-spec')
          .map((source) => source.spec),
        asyncapi: config.sources
          ?.filter((source) => source.type === 'asyncapi-spec')
          .map((source) => source.spec),
        graphql: config.sources
          ?.filter((source) => source.type === 'graphql-spec')
          .map((source) => source.spec),
        grpc: config.sources
          ?.filter((source) => source.type === 'grpc-spec')
          .map((source) => source.spec),
        openrpc: config.sources
          ?.filter((source) => source.type === 'openrpc-spec')
          .map((source) => source.spec),
      },
    );
    const specResources = await this.writeSpecResources(outputDir, specs);

    const templateData: McpTemplateData = {
      serverName,
      packageName,
      version,
      repositoryUrl,
      gitRepositoryUrl: config.mcp?.github_repository
        ? gitRepositoryUrl(config.mcp.github_repository)
        : undefined,
      specTitle: spec.info.title,
      baseUrl,
      graphqlEndpoint: options.graphqlSpec?.endpoint ?? `${baseUrl.replace(/\/$/, '')}/graphql`,
      openRpcUrl: options.openRpcSpec?.servers[0]?.url ?? baseUrl,
      tools,
      toolInfos,
      staticTools,
      transport,
      specs,
      specResources,
      instructions,
      esc,
      zodType,
    };

    const files: string[] = specResources.map((resource) => `specs/${resource.fileName}`);

    const templates: Array<{ name: string; output: string }> = [
      { name: 'package-json', output: 'package.json' },
      { name: 'tsconfig-json', output: 'tsconfig.json' },
      { name: 'server', output: 'src/server.ts' },
      { name: 'handlers', output: 'src/handlers.ts' },
      { name: transport === 'sse' ? 'main-sse' : 'main-stdio', output: 'src/main.ts' },
    ];

    for (const tpl of templates) {
      const rendered = renderer.render(tpl.name, templateData);
      if (rendered === null) throw new Error(`MCP template not found: ${tpl.name}.ejs`);
      const filePath = path.join(outputDir, tpl.output);
      fs.writeFileSync(filePath, rendered, 'utf-8');
      files.push(tpl.output);
    }

    let readmeContent = renderer.render('readme', templateData);
    if (readmeContent === null) {
      readmeContent = generateReadme({
        serverName,
        packageName,
        specTitle: spec.info.title,
        transport,
        toolInfos,
        instructions,
      });
      if (repositoryUrl) {
        const heading = readmeContent.match(/^# .+$/m);
        if (heading?.index !== undefined) {
          const insertAt = heading.index + heading[0].length;
          readmeContent = `${readmeContent.slice(0, insertAt)}\n\n[Source repository](${repositoryUrl})${readmeContent.slice(insertAt)}`;
        }
      }
    }
    fs.writeFileSync(path.join(outputDir, 'README.md'), readmeContent, 'utf-8');
    files.push('README.md');

    fs.writeFileSync(
      path.join(outputDir, '.cortex-package.json'),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          kind: 'mcp-server',
          language: 'typescript',
          packageName,
          version,
          ...(repositoryUrl ? { githubRepository: repositoryUrl } : {}),
        },
        null,
        2,
      )}\n`,
      'utf-8',
    );
    files.push('.cortex-package.json');

    for (const outputPath of files) {
      const filePath = path.join(outputDir, outputPath);
      const file = {
        path: outputPath,
        content: fs.readFileSync(filePath, 'utf-8'),
        overwrite: true,
      };
      const override = renderer.render(`files/${outputPath}.ejs`, {
        ...templateData,
        generator: 'mcp',
        file,
      });
      if (override !== null) fs.writeFileSync(filePath, override, 'utf-8');
    }

    return { files };
  }

  private normalizeSpecPaths(
    paths: NonNullable<McpGenOptions['specPaths']>,
  ): Record<SpecType, string[]> {
    const normalize = (value?: string | string[]) =>
      (Array.isArray(value) ? value : value ? [value] : []).filter(Boolean);
    return {
      openapi: normalize(paths.openapi),
      asyncapi: normalize(paths.asyncapi),
      graphql: normalize(paths.graphql),
      grpc: normalize(paths.grpc),
      openrpc: normalize(paths.openrpc),
    };
  }

  private async writeSpecResources(
    outputDir: string,
    specs: Record<SpecType, string[]>,
  ): Promise<SpecResource[]> {
    const metadata: Record<SpecType, { description: string; mimeType: string; extension: string }> =
      {
        openapi: {
          description: 'OpenAPI specification — full REST API documentation',
          mimeType: 'text/yaml',
          extension: '.yaml',
        },
        asyncapi: {
          description: 'AsyncAPI specification — WebSocket channels and messages',
          mimeType: 'text/yaml',
          extension: '.yaml',
        },
        graphql: {
          description: 'GraphQL schema — types, queries, mutations, and subscriptions',
          mimeType: 'text/plain',
          extension: '.graphql',
        },
        grpc: {
          description: 'Protocol Buffer definition — gRPC services and messages',
          mimeType: 'text/plain',
          extension: '.proto',
        },
        openrpc: {
          description: 'OpenRPC specification — JSON-RPC methods and schemas',
          mimeType: 'application/json',
          extension: '.json',
        },
      };
    const resources: SpecResource[] = [];
    const specsDir = path.join(outputDir, 'specs');
    fs.mkdirSync(specsDir, { recursive: true });

    for (const type of Object.keys(specs) as SpecType[]) {
      const entries = specs[type];
      for (let index = 0; index < entries.length; index += 1) {
        const source = entries[index];
        const suffix = index === 0 ? '' : `-${index + 1}`;
        const fileName = `${type}${suffix}${metadata[type].extension}`;
        const content = await this.readSpec(source);
        fs.writeFileSync(path.join(specsDir, fileName), content, 'utf-8');
        resources.push({
          name: `${type}-spec${suffix}`,
          uri: `api://specs/${type}${index === 0 ? '' : `/${index + 1}`}`,
          description: metadata[type].description,
          mimeType: metadata[type].mimeType,
          fileName,
        });
      }
    }

    return resources;
  }

  private async readSpec(specPath: string): Promise<string> {
    if (/^https?:\/\//i.test(specPath)) {
      const response = await fetch(specPath, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) {
        throw new Error(`Failed to fetch ${specPath}: ${response.status}`);
      }
      return response.text();
    }
    return fs.readFileSync(specPath, 'utf-8');
  }

  private existingVersion(outputDir: string): string {
    try {
      const metadata = JSON.parse(
        fs.readFileSync(path.join(outputDir, '.cortex-package.json'), 'utf8'),
      ) as { version?: unknown };
      if (typeof metadata.version === 'string' && /^\d+\.\d+\.\d+$/.test(metadata.version))
        return metadata.version;
    } catch {
      // A new package starts at 0.0.0. The publish command selects its first release version.
    }
    return '0.0.0';
  }
}
