import * as fs from 'node:fs';
import * as path from 'node:path';
import { NextResponse } from 'next/server';
import { gitRepositoryUrl, normalizeRepositoryUrl } from '@cortex-docs/core';
import { locationExists } from '@/lib/load-location';
import {
  buildToolInfos,
  generateReadme,
  generateSetupSection,
  renderMcpTemplate,
  type McpToolInfo,
} from '@cortex-docs/mcp-gen';

interface McpInfo {
  serverName: string;
  packageName: string;
  githubRepository?: string;
  instructions: string;
  instructionsHtml: string;
  tools: McpToolInfo[];
  readme: string;
  setupMarkdown: string;
  setupHtml: string;
}

function findDocsConfig(): string | null {
  const configPath = process.env.CORTEX_CONFIG_PATH;
  if (configPath && fs.existsSync(configPath)) return configPath;

  const specPath = process.env.CORTEX_SPEC_PATH;
  if (specPath) {
    const dir = path.dirname(specPath);
    for (const name of ['cortex.config.yml', 'cortex.config.yaml', 'cortex.yml']) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

export async function GET() {
  const specPath = process.env.CORTEX_SPEC_PATH;
  const asyncApiPath = process.env.CORTEX_ASYNCAPI_PATH;

  try {
    const configPath = findDocsConfig();
    let config;
    let configDir: string | undefined;
    if (configPath) {
      try {
        const { ConfigLoader } = await import('@cortex-docs/core');
        const loader = new ConfigLoader();
        config = await loader.load(configPath);
        configDir = path.dirname(configPath);
      } catch {
        // Config loading failed; skip
      }
    }

    let spec;
    if (specPath && locationExists(specPath)) {
      const { OpenAPIParser } = await import('@cortex-docs/core');
      const parser = new OpenAPIParser();
      spec = await parser.parse(specPath);
    }

    let asyncApiSpec;
    if (asyncApiPath && locationExists(asyncApiPath)) {
      try {
        const { AsyncAPIParser } = await import('@cortex-docs/core');
        const asyncParser = new AsyncAPIParser();
        asyncApiSpec = await asyncParser.parse(asyncApiPath);
      } catch {
        // AsyncAPI parsing failed; skip
      }
    }

    let graphqlSpec;
    const graphqlPath = process.env.CORTEX_GRAPHQL_PATH;
    if (graphqlPath && locationExists(graphqlPath)) {
      try {
        const { GraphQLParser } = await import('@cortex-docs/core');
        const gqlParser = new GraphQLParser();
        const graphqlSource = config?.sources?.find(
          (source: { type?: string; spec?: string }) =>
            source.type === 'graphql-spec' && source.spec === graphqlPath,
        );
        graphqlSpec = await gqlParser.parse(graphqlPath, graphqlSource?.endpoint);
      } catch {
        // GraphQL parsing failed; skip
      }
    }

    let openRpcSpec;
    const openRpcPath = process.env.CORTEX_OPENRPC_PATH;
    if (openRpcPath && locationExists(openRpcPath)) {
      try {
        const { OpenRpcParser } = await import('@cortex-docs/core');
        const openRpcParser = new OpenRpcParser();
        openRpcSpec = await openRpcParser.parse(openRpcPath);
      } catch {
        // OpenRPC parsing failed; skip
      }
    }

    const tools = buildToolInfos({
      spec,
      asyncApiSpec,
      graphqlSpec,
      openRpcSpec,
      config,
      configDir,
    });

    const configSources = config?.sources ?? [];

    const sdkEntries: Array<{ language: string; packageName: string; install: string }> = [];
    const seenForInstructions = new Set<string>();
    for (const source of configSources) {
      for (const lang of source.languages) {
        const key = `${lang.language}:${lang.package_name}`;
        if (seenForInstructions.has(key)) continue;
        seenForInstructions.add(key);
        const installCmdsMap: Record<string, (p: string) => string> = {
          typescript: (p) => `npm install ${p}`,
          python: (p) => `pip install ${p}`,
          go: (p) => `go get ${p}`,
          ruby: (p) => `gem install ${p}`,
          php: (p) => `composer require ${p}`,
          csharp: (p) => `dotnet add package ${p}`,
          rust: (p) => `cargo add ${p}`,
        };
        sdkEntries.push({
          language: lang.language,
          packageName: lang.package_name,
          install: installCmdsMap[lang.language]?.(lang.package_name) ?? lang.package_name,
        });
      }
    }

    const sdkBlock = sdkEntries.map((s) => `  - ${s.language}: ${s.install}`).join('\n');
    const title = config?.title || spec?.info.title || config?.project || 'API';

    const introBlocks: string[] = [];
    for (const source of configSources) {
      if (source.intro) {
        const introPath = path.resolve(path.dirname(configPath ?? specPath ?? '.'), source.intro);
        if (fs.existsSync(introPath)) {
          const content = fs.readFileSync(introPath, 'utf-8').trim();
          introBlocks.push(`### ${source.title}\n\n${content}`);
        }
      }
    }

    const instructions = [
      `You are an AI coding assistant for ${title}.`,
      '',
      ...(introBlocks.length > 0 ? ['## Overview', '', ...introBlocks, ''] : []),
      '## How to help users',
      '',
      '1. ALWAYS prefer the SDK over raw HTTP calls. The SDK provides typed methods, error handling, and auth built in.',
      sdkBlock ? `\nAvailable SDKs:\n${sdkBlock}\n` : '',
      "2. When the user's language has an SDK, show the install command first, then a working code example using the SDK client.",
      "3. Adapt examples to the user's existing codebase — match their import style, error handling patterns, and variable naming.",
      "4. Only fall back to direct HTTP/curl calls if no SDK exists for the user's language.",
      '5. Use the `docs_*` and `sdk_*` tools to look up quickstart guides and SDK references before writing code.',
      '',
      '## Tool categories',
      '',
      '- `docs_*`, `intro_*` — Documentation pages, intro guides, and SDK references. Read these first for context.',
    ].join('\n');

    const mcpPackageName = config?.mcp?.package_name ?? `@${config?.project ?? 'my-org'}/mcp`;

    const { renderMarkdown } = await import('@/lib/markdown');
    const instructionsHtml = await renderMarkdown(instructions);

    const serverName =
      (spec?.info.title || config?.project || 'api').toLowerCase().replace(/\s+/g, '-') + '-mcp';
    const readmeData = {
      serverName,
      packageName: mcpPackageName,
      specTitle: spec?.info.title || config?.title || config?.project || 'API',
      transport: 'stdio' as const,
      toolInfos: tools,
      instructions,
    };

    const setupMarkdown = generateSetupSection(readmeData);
    const setupHtml = await renderMarkdown(setupMarkdown);
    const customReadme = renderMcpTemplate(
      'readme',
      {
        ...readmeData,
        version: '0.0.0',
        repositoryUrl: config?.mcp?.github_repository
          ? normalizeRepositoryUrl(config.mcp.github_repository)
          : undefined,
        gitRepositoryUrl: config?.mcp?.github_repository
          ? gitRepositoryUrl(config.mcp.github_repository)
          : undefined,
        specTitle: readmeData.specTitle,
        baseUrl: spec?.info.servers[0]?.url ?? 'http://localhost:3000',
        tools: [],
        esc: (value?: string) => (value ?? '').replace(/'/g, "\\'").replace(/\n/g, ' '),
        zodType: () => 'z.unknown()',
        specs: {
          openapi: process.env.CORTEX_SPEC_PATH,
          asyncapi: process.env.CORTEX_ASYNCAPI_PATH,
          graphql: process.env.CORTEX_GRAPHQL_PATH,
          openrpc: process.env.CORTEX_OPENRPC_PATH,
        },
      },
      { templateRoot: process.env.CORTEX_TEMPLATE_ROOT },
    );

    const mcpInfo: McpInfo = {
      serverName,
      packageName: mcpPackageName,
      githubRepository: config?.mcp?.github_repository
        ? normalizeRepositoryUrl(config.mcp.github_repository)
        : undefined,
      instructions,
      instructionsHtml,
      tools,
      readme: customReadme ?? generateReadme(readmeData),
      setupMarkdown,
      setupHtml,
    };

    return NextResponse.json(mcpInfo);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate MCP info' },
      { status: 500 },
    );
  }
}
