import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ParsedSpec, AsyncApiSpec, GraphQLSpec, GrpcSpec, CortexConfig } from '@cortex/core';
import { mapOperationsToTools, mapChannelsToTools, mapGraphQLToTools, mapGrpcToTools, type McpTool } from './tool-mapper';

export interface McpToolInfo {
  name: string;
  source: 'rest' | 'websocket' | 'graphql' | 'grpc' | 'docs';
  description: string;
  method?: string;
  path?: string;
  channel?: string;
  operationType?: string;
  serviceName?: string;
  parameters: Array<{ name: string; type: string; required: boolean; description?: string }>;
}

export function toolToInfo(tool: McpTool): McpToolInfo {
  return {
    name: tool.name,
    source: tool.source,
    description: tool.description,
    method: tool.method,
    path: tool.path,
    channel: tool.channelName,
    operationType: tool.operationType,
    serviceName: tool.serviceName,
    parameters: Object.entries(tool.inputSchema.properties).map(([name, schema]) => ({
      name,
      type: schema.type,
      required: tool.inputSchema.required.includes(name),
      description: schema.description,
    })),
  };
}

export function toolsToInfos(tools: McpTool[]): McpToolInfo[] {
  return tools.map(toolToInfo);
}

export interface BuildToolInfosOptions {
  spec: ParsedSpec;
  asyncApiSpec?: AsyncApiSpec;
  graphqlSpec?: GraphQLSpec;
  grpcSpec?: GrpcSpec;
  config?: CortexConfig;
  configDir?: string;
}

export function buildConfigTools(config: CortexConfig, configDir: string): McpToolInfo[] {
  const tools: McpToolInfo[] = [];

  if (config.docs) {
    for (const section of config.docs) {
      for (const doc of section.sources) {
        if (!doc.document || !doc.title) continue;
        const docPath = path.resolve(configDir, doc.document);
        if (fs.existsSync(docPath)) {
          tools.push({
            name: `docs_${doc.title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
            source: 'docs',
            description: `Read documentation: ${doc.title} (${section.section ?? 'Docs'}). Returns full markdown content.`,
            parameters: [],
          });
        }
      }
    }
  }

  for (const source of config.sources) {
    if (source.intro) {
      const introPath = path.resolve(configDir, source.intro);
      if (fs.existsSync(introPath)) {
        const specKey =
          source.type === 'openapi-spec' ? 'rest'
          : source.type === 'asyncapi-spec' ? 'websocket'
          : source.type === 'graphql-spec' ? 'graphql'
          : source.type === 'grpc-spec' ? 'grpc'
          : source.type;
        tools.push({
          name: `intro_${specKey}`,
          source: 'docs',
          description: `Read the ${source.title} introduction. Returns overview, base URL, rate limiting, and other essential context for the ${source.title}.`,
          parameters: [],
        });
      }
    }
  }

  const seenSdks = new Set<string>();
  for (const source of config.sources) {
    for (const lang of source.languages) {
      const key = `${lang.language}:${lang.package_name}`;
      if (seenSdks.has(key)) continue;
      seenSdks.add(key);
      tools.push({
        name: `sdk_${lang.language}_${lang.package_name.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`,
        source: 'docs',
        description: `Read SDK reference: ${lang.package_name} (${lang.language}). Returns full README with installation, initialization, typed resources, and code examples.`,
        parameters: [],
      });
    }
  }

  return tools;
}

export function buildToolInfos(options: BuildToolInfosOptions): McpToolInfo[] {
  const restTools = mapOperationsToTools(options.spec.operations);
  const wsTools = options.asyncApiSpec ? mapChannelsToTools(options.asyncApiSpec.channels) : [];
  const gqlTools = options.graphqlSpec
    ? mapGraphQLToTools(options.graphqlSpec.queries, options.graphqlSpec.mutations, options.graphqlSpec.subscriptions)
    : [];
  const grpcTools = options.grpcSpec
    ? mapGrpcToTools(options.grpcSpec.services, options.grpcSpec.messages)
    : [];

  const specTools = toolsToInfos([...restTools, ...wsTools, ...gqlTools, ...grpcTools]);
  const configTools = options.config && options.configDir
    ? buildConfigTools(options.config, options.configDir)
    : [];

  const sourceOrder: Record<string, number> = { docs: 0, rest: 1, websocket: 2, graphql: 3, grpc: 4 };
  const allTools = [...specTools, ...configTools];
  allTools.sort((a, b) => (sourceOrder[a.source] ?? 5) - (sourceOrder[b.source] ?? 5));

  return allTools;
}
