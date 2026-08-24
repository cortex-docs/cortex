import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  ParsedSpec,
  AsyncApiSpec,
  GraphQLSpec,
  OpenRpcSpec,
  CortexConfig,
} from '@cortex-docs/core';
import {
  mapOperationsToTools,
  mapChannelsToTools,
  mapGraphQLToTools,
  mapOpenRpcToTools,
  type McpTool,
} from './tool-mapper';

export interface McpToolInfo {
  name: string;
  source: 'rest' | 'websocket' | 'graphql' | 'openrpc' | 'docs';
  description: string;
  method?: string;
  path?: string;
  channel?: string;
  operationType?: string;
  serviceName?: string;
  parameters: Array<{ name: string; type: string; required: boolean; description?: string }>;
}

export interface McpStaticTool extends McpToolInfo {
  content: string;
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
  spec?: ParsedSpec;
  asyncApiSpec?: AsyncApiSpec;
  graphqlSpec?: GraphQLSpec;
  openRpcSpec?: OpenRpcSpec;
  config?: CortexConfig;
  configDir?: string;
}

export function buildConfigToolDefinitions(
  config: CortexConfig,
  configDir: string,
): McpStaticTool[] {
  const tools: McpStaticTool[] = [];
  const names = new Map<string, number>();
  const slug = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'reference';
  const uniqueName = (base: string) => {
    const count = (names.get(base) ?? 0) + 1;
    names.set(base, count);
    return count === 1 ? base : `${base}_${count}`;
  };

  if (config.docs) {
    for (const section of config.docs) {
      for (const doc of section.sources) {
        if (!doc.document || !doc.title) continue;
        const docPath = path.resolve(configDir, doc.document);
        if (fs.existsSync(docPath)) {
          tools.push({
            name: uniqueName(`docs_${slug(doc.title)}`),
            source: 'docs',
            description: `Read documentation: ${doc.title} (${section.section ?? 'Docs'}). Returns full markdown content.`,
            parameters: [],
            content: fs.readFileSync(docPath, 'utf-8'),
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
          source.type === 'openapi-spec'
            ? 'rest'
            : source.type === 'asyncapi-spec'
              ? 'websocket'
              : source.type === 'graphql-spec'
                ? 'graphql'
                : source.type === 'openrpc-spec'
                  ? 'openrpc'
                  : source.type;
        tools.push({
          name: uniqueName(`intro_${slug(specKey)}`),
          source: 'docs',
          description: `Read the ${source.title} introduction. Returns overview, base URL, rate limiting, and other essential context for the ${source.title}.`,
          parameters: [],
          content: fs.readFileSync(introPath, 'utf-8'),
        });
      }
    }
  }

  const seenSdks = new Set<string>();
  for (const lang of config.languages) {
    const key = `${lang.language}:${lang.package_name}`;
    if (seenSdks.has(key)) continue;
    seenSdks.add(key);
    const readmePath = path.resolve(configDir, lang.output_dir, 'README.md');
    if (!fs.existsSync(readmePath)) continue;
    tools.push({
      name: uniqueName(`sdk_${slug(lang.language)}_${slug(lang.package_name)}`),
      source: 'docs',
      description: `Read SDK reference: ${lang.package_name} (${lang.language}). Returns full README with installation, initialization, typed resources, and code examples.`,
      parameters: [],
      content: fs.readFileSync(readmePath, 'utf-8'),
    });
  }

  return tools;
}

export function buildConfigTools(config: CortexConfig, configDir: string): McpToolInfo[] {
  return buildConfigToolDefinitions(config, configDir).map(
    ({ content: _content, ...tool }) => tool,
  );
}

export function buildToolInfos(options: BuildToolInfosOptions): McpToolInfo[] {
  const restTools = options.spec ? mapOperationsToTools(options.spec.operations) : [];
  const wsTools = options.asyncApiSpec ? mapChannelsToTools(options.asyncApiSpec.channels) : [];
  const gqlTools = options.graphqlSpec
    ? mapGraphQLToTools(
        options.graphqlSpec.queries,
        options.graphqlSpec.mutations,
        options.graphqlSpec.subscriptions,
      )
    : [];
  const openRpcTools = options.openRpcSpec ? mapOpenRpcToTools(options.openRpcSpec.methods) : [];

  const specTools = toolsToInfos([...restTools, ...wsTools, ...gqlTools, ...openRpcTools]);
  const configTools =
    options.config && options.configDir ? buildConfigTools(options.config, options.configDir) : [];

  const sourceOrder: Record<string, number> = {
    docs: 0,
    rest: 1,
    websocket: 2,
    graphql: 3,
    openrpc: 4,
  };
  const allTools = [...specTools, ...configTools];
  allTools.sort((a, b) => (sourceOrder[a.source] ?? 5) - (sourceOrder[b.source] ?? 5));

  return allTools;
}
