import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { Command, CommandRunner } from 'nest-commander';
import type { CortexConfig, SourceLanguageConfig } from '@cortex/core';
import { LoggerService } from '../../services/logger.service';

function buildIntroTemplate(projectName: string, baseUrl: string): string {
  return `Welcome to the ${projectName} API. This API provides endpoints for managing resources.

## Base URL

\`\`\`
${baseUrl}
\`\`\`

## Rate Limiting

API requests are rate-limited to **1000 requests per minute** per API key. When you exceed the limit, requests return a \`429 Too Many Requests\` response. The \`Retry-After\` header indicates how long to wait before retrying.
`;
}

const QUICKSTART_TEMPLATE = `# Quickstart

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

function getFixturesDir(): string {
  const corePath = require.resolve('@cortex/core');
  return path.resolve(path.dirname(corePath), '..', '__fixtures__');
}

const FIXTURE_FILES: Record<string, string> = {
  'petstore.yaml': 'petstore.yaml',
  'chat-asyncapi.yaml': 'chat-asyncapi.yaml',
  'petstore.graphql': 'petstore.graphql',
  'petstore.proto': 'petstore.proto',
};

const PETSTORE_TEMPLATE = `openapi: "3.1.0"
info:
  title: Petstore API
  version: "1.0.0"
  description: A sample API for managing pets.
servers:
  - url: https://api.example.com
paths:
  /pets:
    get:
      operationId: listPets
      summary: List all pets
      x-cortex-resource: pets
      x-cortex-method-name: list
      parameters:
        - name: limit
          in: query
          schema:
            type: integer
          description: Maximum number of pets to return
      responses:
        "200":
          description: A list of pets
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items:
                      $ref: "#/components/schemas/Pet"
    post:
      operationId: createPet
      summary: Create a pet
      x-cortex-resource: pets
      x-cortex-method-name: create
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CreatePetRequest"
      responses:
        "201":
          description: The created pet
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Pet"
  /pets/{petId}:
    get:
      operationId: getPet
      summary: Get a pet by ID
      x-cortex-resource: pets
      x-cortex-method-name: get
      parameters:
        - name: petId
          in: path
          required: true
          schema:
            type: string
          description: The ID of the pet
      responses:
        "200":
          description: The pet
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Pet"
    delete:
      operationId: deletePet
      summary: Delete a pet
      x-cortex-resource: pets
      x-cortex-method-name: delete
      parameters:
        - name: petId
          in: path
          required: true
          schema:
            type: string
      responses:
        "204":
          description: Pet deleted
components:
  schemas:
    Pet:
      type: object
      required: [id, name]
      properties:
        id:
          type: string
        name:
          type: string
        species:
          type: string
        status:
          type: string
    CreatePetRequest:
      type: object
      required: [name]
      properties:
        name:
          type: string
        species:
          type: string
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
security:
  - bearerAuth: []
`;

const ASYNCAPI_TEMPLATE = `asyncapi: '2.6.0'
info:
  title: Chat WebSocket API
  version: 1.0.0
  description: A real-time chat API using WebSockets.
servers:
  production:
    url: wss://api.example.com/ws
    protocol: ws
channels:
  chat/messages:
    description: Channel for chat messages
    subscribe:
      operationId: onMessage
      summary: Receive a chat message
      message:
        name: ChatMessage
        contentType: application/json
        payload:
          type: object
          required: [id, userId, text, timestamp]
          properties:
            id:
              type: string
            userId:
              type: string
            text:
              type: string
            timestamp:
              type: string
              format: date-time
    publish:
      operationId: sendMessage
      summary: Send a chat message
      message:
        name: SendMessagePayload
        contentType: application/json
        payload:
          type: object
          required: [text]
          properties:
            text:
              type: string
            replyTo:
              type: string
  chat/typing:
    description: Channel for typing indicators
    subscribe:
      operationId: onTyping
      summary: Receive typing indicator
      message:
        name: TypingEvent
        payload:
          type: object
          required: [userId, isTyping]
          properties:
            userId:
              type: string
            isTyping:
              type: boolean
    publish:
      operationId: startTyping
      summary: Send typing indicator
      message:
        name: TypingPayload
        payload:
          type: object
          required: [isTyping]
          properties:
            isTyping:
              type: boolean
  chat/presence:
    description: Channel for user presence updates
    subscribe:
      operationId: onPresence
      summary: Receive presence updates
      message:
        name: PresenceEvent
        payload:
          type: object
          required: [userId, status]
          properties:
            userId:
              type: string
            status:
              type: string
              enum: [online, offline, away]
`;

const GRAPHQL_TEMPLATE = `type Pet {
  id: ID!
  name: String!
  species: Species!
  breed: String
  age: Int
  status: PetStatus!
}

type Owner {
  id: ID!
  name: String!
  email: String!
  phone: String
}

enum Species { DOG, CAT, BIRD, FISH, REPTILE }
enum PetStatus { AVAILABLE, ADOPTED, PENDING }

input CreatePetInput { name: String!, species: Species!, breed: String, age: Int }
input UpdatePetInput { name: String, breed: String, age: Int, status: PetStatus, ownerId: String }
input CreateOwnerInput { name: String!, email: String!, phone: String }

type PetConnection { data: [Pet!]!, nextCursor: String }
type OwnerConnection { data: [Owner!]! }

type Query {
  pets(limit: Int, cursor: String): PetConnection!
  pet(id: ID!): Pet
  owners(limit: Int): OwnerConnection!
  owner(id: ID!): Owner
}

type Mutation {
  createPet(input: CreatePetInput!): Pet!
  updatePet(id: ID!, input: UpdatePetInput!): Pet!
  deletePet(id: ID!): Boolean!
  createOwner(input: CreateOwnerInput!): Owner!
}

type Subscription {
  petAdopted(species: Species): Pet!
  ownerActivity(ownerId: ID!): Owner!
}
`;

const GRPC_TEMPLATE = `syntax = "proto3";

package petstore.v1;

service PetService {
  rpc ListPets(ListPetsRequest) returns (ListPetsResponse);
  rpc GetPet(GetPetRequest) returns (Pet);
  rpc CreatePet(CreatePetRequest) returns (Pet);
  rpc DeletePet(DeletePetRequest) returns (DeletePetResponse);
  rpc WatchPets(WatchPetsRequest) returns (stream Pet);
}

service OwnerService {
  rpc ListOwners(ListOwnersRequest) returns (ListOwnersResponse);
  rpc GetOwner(GetOwnerRequest) returns (Owner);
  rpc CreateOwner(CreateOwnerRequest) returns (Owner);
}

enum Species { SPECIES_UNSPECIFIED = 0; SPECIES_DOG = 1; SPECIES_CAT = 2; SPECIES_BIRD = 3; }
enum PetStatus { PET_STATUS_UNSPECIFIED = 0; PET_STATUS_AVAILABLE = 1; PET_STATUS_ADOPTED = 2; }

message Pet { string id = 1; string name = 2; Species species = 3; optional string breed = 4; optional int32 age = 5; PetStatus status = 6; optional string owner_id = 7; string created_at = 8; string updated_at = 9; }
message Owner { string id = 1; string name = 2; string email = 3; optional string phone = 4; string created_at = 5; }
message ListPetsRequest { optional int32 limit = 1; optional string cursor = 2; }
message ListPetsResponse { repeated Pet data = 1; optional string next_cursor = 2; }
message GetPetRequest { string id = 1; }
message CreatePetRequest { string name = 1; Species species = 2; optional string breed = 3; optional int32 age = 4; }
message DeletePetRequest { string id = 1; }
message DeletePetResponse {}
message WatchPetsRequest { optional Species species_filter = 1; }
message ListOwnersRequest { optional int32 limit = 1; }
message ListOwnersResponse { repeated Owner data = 1; }
message GetOwnerRequest { string id = 1; }
message CreateOwnerRequest { string name = 1; string email = 2; optional string phone = 3; }
`;

const API_REFERENCE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
  <polyline points="14 2 14 8 20 8"/>
  <line x1="16" y1="13" x2="8" y2="13"/>
  <line x1="16" y1="17" x2="8" y2="17"/>
  <polyline points="10 9 9 9 8 9"/>
</svg>`;

const SDKS_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="16 18 22 12 16 6"/>
  <polyline points="8 6 2 12 8 18"/>
</svg>`;

const MCP_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
  <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
  <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
  <line x1="6" y1="6" x2="6.01" y2="6"/>
  <line x1="6" y1="18" x2="6.01" y2="18"/>
</svg>`;

const DEFAULT_FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
</svg>`;

function buildLogo(name: string, textColor: string): string {
  const escaped = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const textWidth = escaped.length * 8.5;
  const iconSize = 24;
  const gap = 6;
  const totalWidth = iconSize + gap + textWidth;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${iconSize}" viewBox="0 0 ${totalWidth} ${iconSize}">
  <g stroke="${textColor}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="7.5 4.21 12 6.81 16.5 4.21"/>
    <polyline points="7.5 19.79 7.5 14.6 3 12"/>
    <polyline points="21 12 16.5 14.6 16.5 19.79"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
    <line x1="12" y1="22.08" x2="12" y2="12"/>
  </g>
  <text x="${iconSize + gap}" y="17" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="600" fill="${textColor}">${escaped}</text>
</svg>`;
}

@Command({
  name: 'init',
  description: 'Initialize a Cortex project: create config, docs, and assets',
  arguments: '<project-name>',
})
export class InitCommand extends CommandRunner {
  constructor(private readonly logger: LoggerService) {
    super();
  }

  async run(params: string[]): Promise<void> {
    this.logger.header('Cortex Init');

    const projectName = params[0];
    if (!projectName) {
      this.logger.error('Project name is required.');
      this.logger.info('');
      this.logger.info('Usage: cortex init <project-name>');
      this.logger.info('');
      this.logger.info('Examples:');
      this.logger.list(['cortex init my-api', 'cortex init petstore']);
      process.exitCode = 1;
      return;
    }

    const clean = projectName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();

    const langConfigs: SourceLanguageConfig[] = [
      {
        language: 'typescript',
        package_name: `@${clean}/typescript-client-sdk`,
        github_repository: `github.com/${clean}/typescript-client-sdk`,
      },
      {
        language: 'python',
        package_name: `${clean}-python-sdk`,
        github_repository: `github.com/${clean}/python-sdk`,
      },
      {
        language: 'go',
        package_name: `github.com/${clean}/go-sdk`,
        github_repository: `github.com/${clean}/go-sdk`,
      },
      {
        language: 'java',
        package_name: `com.${clean}.sdk`,
        github_repository: `github.com/${clean}/java-sdk`,
      },
      {
        language: 'kotlin',
        package_name: `com.${clean}.sdk`,
        github_repository: `github.com/${clean}/kotlin-sdk`,
      },
      {
        language: 'ruby',
        package_name: `${clean}-sdk`,
        github_repository: `github.com/${clean}/ruby-sdk`,
      },
      {
        language: 'php',
        package_name: `${clean}/sdk`,
        github_repository: `github.com/${clean}/php-sdk`,
      },
      {
        language: 'csharp',
        package_name: `${clean}.Sdk`,
        github_repository: `github.com/${clean}/dotnet-sdk`,
      },
      {
        language: 'rust',
        package_name: `${clean}-sdk`,
        github_repository: `github.com/${clean}/rust-sdk`,
      },
      {
        language: 'cpp',
        package_name: `${clean}-sdk`,
        github_repository: `github.com/${clean}/cpp-sdk`,
      },
      {
        language: 'c',
        package_name: `${clean}-sdk`,
        github_repository: `github.com/${clean}/c-sdk`,
      },
    ];

    const config: CortexConfig = {
      project: projectName,
      title: `${projectName} Docs`,
      logo_dark: './assets/logo_dark.svg',
      logo_light: './assets/logo_light.svg',
      logoHeight: 28,
      showLogoDocsLabel: true,
      favicon: './assets/favicon.svg',
      theme: 'system',
      sources: [
        {
          title: 'REST API V1',
          type: 'openapi-spec',
          spec: './petstore.yaml',
          intro: './docs/REST_INTRO.md',
          languages: langConfigs,
        },
        {
          title: 'WebSocket API',
          type: 'asyncapi-spec',
          spec: './chat-asyncapi.yaml',
          languages: langConfigs,
        },
        {
          title: 'GraphQL',
          type: 'graphql-spec',
          spec: './petstore.graphql',
          languages: langConfigs,
        },
        { title: 'gRPC', type: 'grpc-spec', spec: './petstore.proto', languages: langConfigs },
      ],
      output: { base_dir: './generated' },
      languages: [],
      docs: [
        {
          section: 'Get started',
          sources: [{ title: 'Quickstart', document: 'docs/quickstart.md' }],
        },
      ],
      mcp: {
        package_name: `@${clean}/mcp`,
        github_repository: `github.com/${clean}/${clean}-mcp`,
      },
    };

    this.logger.info(`Project: ${projectName}`);
    this.logger.info('');

    const configPath = path.join(process.cwd(), 'cortex.config.yml');
    if (fs.existsSync(configPath)) {
      this.logger.warn('cortex.config.yml already exists — overwriting.');
    }

    const serializable: Record<string, unknown> = {
      project: config.project,
      title: config.title,
      logo_dark: config.logo_dark,
      logo_light: config.logo_light,
      logoHeight: config.logoHeight,
      showLogoDocsLabel: config.showLogoDocsLabel,
      favicon: config.favicon,
      theme: config.theme,
      primaryColor: '#ffffff',
      home: {
        title: `${projectName} Docs`,
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
      docs: config.docs,
      sources: config.sources,
      output: config.output,
      mcp: config.mcp,
    };
    const configContent = `# Cortex Configuration\n\n${yaml.dump(serializable, { lineWidth: 120, noRefs: true }).replace(/^theme: system$/m, 'theme: system # system, light, dark')}`;
    fs.writeFileSync(configPath, configContent, 'utf-8');
    this.logger.success('Created cortex.config.yml');

    const fixturesDir = getFixturesDir();
    for (const [target, source] of Object.entries(FIXTURE_FILES)) {
      const filePath = path.join(process.cwd(), target);
      if (!fs.existsSync(filePath)) {
        const fixturePath = path.join(fixturesDir, source);
        if (fs.existsSync(fixturePath)) {
          fs.copyFileSync(fixturePath, filePath);
        } else {
          const fallback: Record<string, string> = {
            'petstore.yaml': PETSTORE_TEMPLATE,
            'chat-asyncapi.yaml': ASYNCAPI_TEMPLATE,
            'petstore.graphql': GRAPHQL_TEMPLATE,
            'petstore.proto': GRPC_TEMPLATE,
          };
          fs.writeFileSync(filePath, fallback[target] ?? '', 'utf-8');
        }
        this.logger.success(`Created ${target}`);
      }
    }

    let baseUrl = 'https://api.example.com';
    const petstorePath = path.join(process.cwd(), 'petstore.yaml');
    if (fs.existsSync(petstorePath)) {
      const specContent = fs.readFileSync(petstorePath, 'utf-8');
      const urlMatch = specContent.match(/url:\s*(https?:\/\/[^\s]+)/);
      if (urlMatch) baseUrl = urlMatch[1];
    }

    const docsDir = path.join(process.cwd(), 'docs');
    fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(path.join(docsDir, 'quickstart.md'), QUICKSTART_TEMPLATE, 'utf-8');
    this.logger.success('Created docs/quickstart.md');
    fs.writeFileSync(
      path.join(docsDir, 'REST_INTRO.md'),
      buildIntroTemplate(projectName, baseUrl),
      'utf-8',
    );
    this.logger.success('Created docs/REST_INTRO.md');

    const assetsDir = path.join(process.cwd(), 'assets');
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(path.join(assetsDir, 'logo_dark.svg'), buildLogo(projectName, '#ffffff'), 'utf-8');
    this.logger.success('Created assets/logo_dark.svg');
    fs.writeFileSync(path.join(assetsDir, 'logo_light.svg'), buildLogo(projectName, '#0a0a0a'), 'utf-8');
    this.logger.success('Created assets/logo_light.svg');
    fs.writeFileSync(path.join(assetsDir, 'favicon.svg'), DEFAULT_FAVICON, 'utf-8');
    this.logger.success('Created assets/favicon.svg');

    const iconAssets: Array<[string, string]> = [
      ['api-reference-icon.svg', API_REFERENCE_ICON],
      ['sdks-icon.svg', SDKS_ICON],
      ['mcp-icon.svg', MCP_ICON],
    ];
    for (const [name, content] of iconAssets) {
      const iconPath = path.join(assetsDir, name);
      if (!fs.existsSync(iconPath)) {
        fs.writeFileSync(iconPath, content, 'utf-8');
        this.logger.success(`Created assets/${name}`);
      }
    }

    this.logger.info('');
    this.logger.success('Project initialized!');
    this.logger.info('');
    this.logger.info('Next steps:');
    this.logger.list([
      'cortex generate                   — generate SDKs and MCP server from the sample petstore spec',
      'cortex docs serve                 — preview API documentation',
      'Edit cortex.config.yml to add your own API specs — see docs at https://cortex.dev/docs/configuration',
    ]);
  }
}
