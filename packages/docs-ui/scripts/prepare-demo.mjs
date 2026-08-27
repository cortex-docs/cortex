#!/usr/bin/env node

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const docsUiDir = resolve(scriptDir, '..');
const workspaceRoot = resolve(docsUiDir, '..', '..');
const demoDir = join(docsUiDir, '.cortex-demo');
const fixturesDir = join(workspaceRoot, 'packages', 'core', '__fixtures__');
const docsSiteDir = join(workspaceRoot, 'packages', 'docs-site');

const quickstart = `# Quickstart

Welcome to your API documentation! This guide will help you get started.

## API Reference

Browse the full API reference to see all available endpoints, request/response schemas, and authentication details.

## SDKs

Cortex generates type-safe SDKs for your API in multiple languages. Install the SDK for your language of choice and start making API calls in minutes.

## MCP Server

An MCP (Model Context Protocol) server is generated alongside your SDKs, enabling AI assistants to interact with your API using structured tool calls.

## Next Steps

- Explore the **API Reference** tab for endpoint details
- Visit the **SDKs** tab to download generated clients
- Check the **MCP** tab for AI integration setup
`;

const apiReferenceIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
  <polyline points="14 2 14 8 20 8"/>
  <line x1="16" y1="13" x2="8" y2="13"/>
  <line x1="16" y1="17" x2="8" y2="17"/>
  <polyline points="10 9 9 9 8 9"/>
</svg>`;

function buildLogo(textColor) {
  const name = 'Petstore';
  const totalWidth = Math.ceil(22 + 4 + name.length * 8.5);
  const fillOpacity = textColor === '#ffffff' ? '0.1' : '0.08';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} 21">
  <g stroke="${textColor}" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9,2.5 Q11,1 13,2.5 L18,5 Q20,6 18,7 L13,9.5 Q11,11 9,9.5 L4,7 Q2,6 4,5 Z" stroke-width="1.5" fill="${textColor}" fill-opacity="${fillOpacity}"/>
    <path d="M3,10 L9,13.5 Q11,14.8 13,13.5 L19,10" stroke-width="1.5"/>
    <path d="M3,13.5 L9,17 Q11,18.3 13,17 L19,13.5" stroke-width="1.5" stroke-opacity="0.5"/>
  </g>
  <text x="26" y="15" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="600" fill="${textColor}">${name}</text>
</svg>`;
}

function copyFixture(sourceName, targetName, transform = (content) => content) {
  const content = readFileSync(join(fixturesDir, sourceName), 'utf8');
  writeFileSync(join(demoDir, 'specs', targetName), transform(content), 'utf8');
}

function sourceLanguages() {
  return [
    ['typescript', '@petstore/typescript-client-sdk', 'github.com/petstore/typescript-client-sdk'],
    ['python', 'petstore-python-sdk', 'github.com/petstore/python-sdk'],
    ['go', 'github.com/petstore/go-sdk', 'github.com/petstore/go-sdk'],
    ['java', 'com.petstore.sdk', 'github.com/petstore/java-sdk'],
    ['kotlin', 'com.petstore.sdk', 'github.com/petstore/kotlin-sdk'],
    ['ruby', 'petstore-sdk', 'github.com/petstore/ruby-sdk'],
    ['php', 'petstore/sdk', 'github.com/petstore/php-sdk'],
    ['csharp', 'petstore.Sdk', 'github.com/petstore/dotnet-sdk'],
    ['rust', 'petstore-sdk', 'github.com/petstore/rust-sdk'],
    ['cpp', 'petstore-sdk', 'github.com/petstore/cpp-sdk'],
    ['c', 'petstore-sdk', 'github.com/petstore/c-sdk'],
  ].map(([language, packageName, repository]) => ({
    language,
    package_name: packageName,
    github_repository: repository,
  }));
}

export function prepareDemo(apiUrl = process.env.CORTEX_DEMO_API_URL || 'http://localhost:4010') {
  const parsedApiUrl = new URL(apiUrl);
  const websocketUrl = `${parsedApiUrl.protocol === 'https:' ? 'wss:' : 'ws:'}//${parsedApiUrl.host}/ws`;

  rmSync(demoDir, { recursive: true, force: true });
  mkdirSync(join(demoDir, 'specs'), { recursive: true });
  mkdirSync(join(demoDir, 'docs'), { recursive: true });
  mkdirSync(join(demoDir, 'assets'), { recursive: true });

  copyFixture('petstore.yaml', 'petstore.yaml', (content) =>
    content.replace(/https:\/\/api\.petstore\.example\.com\/v1/g, apiUrl),
  );
  copyFixture('chat-asyncapi.yaml', 'chat-asyncapi.yaml', (content) =>
    content.replace(/wss:\/\/chat\.example\.com\/ws/g, websocketUrl),
  );
  copyFixture('petstore.graphql', 'petstore.graphql');
  copyFixture('petstore.proto', 'petstore.proto');
  copyFixture('petstore-openrpc.json', 'petstore-openrpc.json', (content) => {
    const document = JSON.parse(content);
    document.servers = [{ url: `${apiUrl}/rpc` }];
    return `${JSON.stringify(document, null, 2)}\n`;
  });

  cpSync(join(docsSiteDir, 'assets'), join(demoDir, 'assets'), { recursive: true });
  writeFileSync(join(demoDir, 'docs', 'quickstart.md'), quickstart, 'utf8');
  writeFileSync(
    join(demoDir, 'docs', 'REST_INTRO.md'),
    `Welcome to the Petstore API. This API provides endpoints for managing resources.

## Base URL

\`\`\`
${apiUrl}
\`\`\`

## Rate Limiting

API requests are rate-limited to **1000 requests per minute** per API key. When you exceed the limit, requests return a \`429 Too Many Requests\` response. The \`Retry-After\` header indicates how long to wait before retrying.
`,
    'utf8',
  );
  writeFileSync(join(demoDir, 'assets', 'logo_dark.svg'), buildLogo('#ffffff'), 'utf8');
  writeFileSync(join(demoDir, 'assets', 'logo_light.svg'), buildLogo('#0a0a0a'), 'utf8');
  writeFileSync(join(demoDir, 'assets', 'api-reference-icon.svg'), apiReferenceIcon, 'utf8');
  writeFileSync(
    join(demoDir, 'assets', 'custom.css'),
    ':root { --cortex-custom-head-loaded: yes; }\n',
    'utf8',
  );

  const languages = sourceLanguages();
  const config = {
    project: 'Petstore',
    title: 'Petstore Docs',
    logo_dark: './assets/logo_dark.svg',
    logo_light: './assets/logo_light.svg',
    logoHeight: 24,
    showLogoDocsLabel: true,
    favicon: './assets/favicon.svg',
    custom_head_html: [
      '<meta name="theme-color" content="#ffffff">',
      '<link rel="stylesheet" href="/assets/custom.css">',
      "<script>document.documentElement.dataset.cortexCustomHead = 'loaded';</script>",
    ].join('\n'),
    theme: 'system',
    primaryColor: '#ffffff',
    home: {
      title: 'Petstore Docs',
      description:
        'Explore the full API surface, grab a client SDK, or wire up AI coding agents via our MCP for faster integration.',
      cta: { label: 'Getting Started', href: '/docs' },
      sections: [
        {
          title: 'API Reference',
          description: 'Try endpoints, visualize schema, and check out code samples.',
          badge: 'Reference',
          href: '/reference',
          icon: 'assets/api-reference-icon.svg',
        },
        {
          title: 'SDKs',
          description: 'Typed client libraries for every major language.',
          badge: 'Libraries',
          href: '/sdks',
          icon: 'assets/sdks-icon.svg',
        },
        {
          title: 'MCP',
          description: 'Hook up AI coding agents via our MCP in seconds.',
          badge: 'AI Agents',
          href: '/mcp',
          icon: 'assets/mcp-icon.svg',
        },
      ],
    },
    docs: [
      {
        section: 'Get started',
        sources: [{ title: 'Quickstart', document: 'docs/quickstart.md' }],
      },
    ],
    sources: [
      {
        title: 'REST API V1',
        type: 'openapi-spec',
        spec: './specs/petstore.yaml',
        intro: './docs/REST_INTRO.md',
        languages,
      },
      {
        title: 'WebSocket API',
        type: 'asyncapi-spec',
        spec: './specs/chat-asyncapi.yaml',
        languages,
      },
      {
        title: 'GraphQL',
        type: 'graphql-spec',
        spec: './specs/petstore.graphql',
        endpoint: `${apiUrl}/graphql`,
        languages,
      },
      {
        title: 'gRPC',
        type: 'grpc-spec',
        spec: './specs/petstore.proto',
        try_now_url: apiUrl,
        languages: [languages[0]],
      },
      {
        title: 'OpenRPC',
        type: 'openrpc-spec',
        spec: './specs/petstore-openrpc.json',
        languages,
      },
    ],
    output: { base_dir: './generated' },
    mcp: {
      package_name: '@petstore/mcp',
      github_repository: 'github.com/petstore/petstore-mcp',
    },
  };

  const configPath = join(demoDir, 'cortex.config.yml');
  writeFileSync(
    configPath,
    `# Generated Cortex demo configuration\n\n${yaml.dump(config, { lineWidth: 120, noRefs: true })}`,
    'utf8',
  );

  return {
    demoDir,
    configPath,
    specPath: join(demoDir, 'specs', 'petstore.yaml'),
    asyncApiPath: join(demoDir, 'specs', 'chat-asyncapi.yaml'),
    graphqlPath: join(demoDir, 'specs', 'petstore.graphql'),
    grpcPath: join(demoDir, 'specs', 'petstore.proto'),
    openRpcPath: join(demoDir, 'specs', 'petstore-openrpc.json'),
    logoPath: join(demoDir, 'assets', 'logo_light.svg'),
    faviconPath: join(demoDir, 'assets', 'favicon.svg'),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const prepared = prepareDemo();
  console.log(`Prepared the demo at ${prepared.demoDir}`);
}
