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
  cpSync(join(docsSiteDir, 'docs'), join(demoDir, 'docs'), { recursive: true });
  writeFileSync(
    join(demoDir, 'assets', 'custom.css'),
    ':root { --cortex-custom-head-loaded: yes; }\n',
    'utf8',
  );

  const languages = sourceLanguages();
  const config = {
    project: 'cortex-demo',
    title: 'Cortex Docs Demo',
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
      title: 'Cortex Docs Demo',
      description:
        'Explore API documentation, generated SDKs, and MCP tools for the Petstore example.',
      cta: { label: 'Open API Reference', href: '/api-reference' },
      sections: [
        {
          title: 'API Reference',
          description: 'Send requests to the Worker-native Petstore API.',
          badge: 'Live demo',
          href: '/api-reference',
          icon: 'assets/docs-icon.svg',
        },
        {
          title: 'SDKs',
          description: 'Review generated clients for all supported languages.',
          badge: 'Libraries',
          href: '/sdks',
          icon: 'assets/sdks-icon.svg',
        },
        {
          title: 'MCP',
          description: 'Review the generated MCP server and tool definitions.',
          badge: 'AI agents',
          href: '/mcp',
          icon: 'assets/mcp-icon.svg',
        },
      ],
    },
    docs: [
      {
        section: 'Getting Started',
        sources: [
          { title: 'Quickstart', document: 'docs/quickstart.md' },
          { title: 'Configuration', document: 'docs/configuration.md' },
        ],
      },
      {
        section: 'Features',
        sources: [
          { title: 'SDK Generation', document: 'docs/sdk-generation.md' },
          { title: 'MCP Servers', document: 'docs/mcp-servers.md' },
          { title: 'Publishing', document: 'docs/publishing.md' },
        ],
      },
    ],
    sources: [
      {
        title: 'REST API V1',
        type: 'openapi-spec',
        spec: './specs/petstore.yaml',
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
