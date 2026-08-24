import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { Command, CommandRunner } from 'nest-commander';
import type { CortexConfig, SourceLanguageConfig } from '@cortex-docs/core';
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
  const corePath = require.resolve('@cortex-docs/core');
  return path.resolve(path.dirname(corePath), '..', '__fixtures__');
}

const FIXTURE_FILES: Record<string, string> = {
  'specs/petstore.yaml': 'petstore.yaml',
  'specs/chat-asyncapi.yaml': 'chat-asyncapi.yaml',
  'specs/petstore.graphql': 'petstore.graphql',
  'specs/petstore-openrpc.json': 'petstore-openrpc.json',
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
          multipart/form-data:
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
  /uploads/raw:
    post:
      operationId: uploadFile
      summary: Upload one raw file
      tags: [uploads]
      requestBody:
        required: true
        content:
          application/pdf:
            schema:
              type: string
              format: binary
      responses:
        "201":
          description: The uploaded file metadata
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/UploadResult"
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
        profile_pic_filename:
          type: string
        profile_pic_size:
          type: integer
        profile_pic_content_type:
          type: string
        attachment_count:
          type: integer
        attachment_content_types:
          type: array
          items:
            type: string
    CreatePetRequest:
      type: object
      required: [name, species]
      properties:
        name:
          type: string
        species:
          type: string
        profilePic:
          type: string
          format: binary
        attachments:
          type: array
          items:
            type: string
            format: binary
    UploadResult:
      type: object
      required: [size, content_type]
      properties:
        size:
          type: integer
        content_type:
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

const OPENRPC_TEMPLATE = JSON.stringify(
  {
    openrpc: '1.3.2',
    info: {
      title: 'Petstore OpenRPC API',
      version: '1.0.0',
      description: 'A sample JSON-RPC API for managing pets.',
    },
    servers: [{ url: 'https://api.example.com/rpc' }],
    methods: [
      {
        name: 'listPets',
        summary: 'List all pets',
        params: [
          {
            name: 'limit',
            required: false,
            schema: { type: 'integer' },
            description: 'Maximum number of pets to return',
          },
          {
            name: 'cursor',
            required: false,
            schema: { type: 'string' },
            description: 'Pagination cursor',
          },
        ],
        result: {
          name: 'petList',
          schema: {
            type: 'object',
            properties: {
              data: { type: 'array', items: { $ref: '#/components/schemas/Pet' } },
              nextCursor: { type: 'string' },
            },
          },
        },
        tags: [{ name: 'pets' }],
      },
      {
        name: 'getPet',
        summary: 'Get a pet by ID',
        params: [
          { name: 'id', required: true, schema: { type: 'string' }, description: 'The pet ID' },
        ],
        result: { name: 'pet', schema: { $ref: '#/components/schemas/Pet' } },
        tags: [{ name: 'pets' }],
      },
      {
        name: 'createPet',
        summary: 'Create a new pet',
        params: [
          { name: 'name', required: true, schema: { type: 'string' } },
          { name: 'species', required: true, schema: { $ref: '#/components/schemas/Species' } },
          { name: 'breed', required: false, schema: { type: 'string' } },
          { name: 'age', required: false, schema: { type: 'integer' } },
        ],
        result: { name: 'pet', schema: { $ref: '#/components/schemas/Pet' } },
        tags: [{ name: 'pets' }],
      },
      {
        name: 'deletePet',
        summary: 'Delete a pet',
        params: [{ name: 'id', required: true, schema: { type: 'string' } }],
        result: { name: 'success', schema: { type: 'boolean' } },
        tags: [{ name: 'pets' }],
      },
      {
        name: 'listOwners',
        summary: 'List all owners',
        params: [{ name: 'limit', required: false, schema: { type: 'integer' } }],
        result: {
          name: 'ownerList',
          schema: {
            type: 'object',
            properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Owner' } } },
          },
        },
        tags: [{ name: 'owners' }],
      },
      {
        name: 'getOwner',
        summary: 'Get an owner by ID',
        params: [{ name: 'id', required: true, schema: { type: 'string' } }],
        result: { name: 'owner', schema: { $ref: '#/components/schemas/Owner' } },
        tags: [{ name: 'owners' }],
      },
      {
        name: 'createOwner',
        summary: 'Create a new owner',
        params: [
          { name: 'name', required: true, schema: { type: 'string' } },
          { name: 'email', required: true, schema: { type: 'string' } },
          { name: 'phone', required: false, schema: { type: 'string' } },
        ],
        result: { name: 'owner', schema: { $ref: '#/components/schemas/Owner' } },
        tags: [{ name: 'owners' }],
      },
    ],
    components: {
      schemas: {
        Pet: {
          type: 'object',
          required: ['id', 'name', 'species', 'status'],
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            species: { $ref: '#/components/schemas/Species' },
            breed: { type: 'string' },
            age: { type: 'integer' },
            status: { $ref: '#/components/schemas/PetStatus' },
            ownerId: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Owner: {
          type: 'object',
          required: ['id', 'name', 'email'],
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string' },
            phone: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Species: { type: 'string', enum: ['dog', 'cat', 'bird', 'fish', 'reptile'] },
        PetStatus: { type: 'string', enum: ['available', 'adopted', 'pending'] },
      },
    },
  },
  null,
  2,
);

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

const DEFAULT_FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-linecap="round" stroke-linejoin="round">
  <path d="M10,3.5 Q12,2 14,3.5 L19,7 Q21,8 19,9 L14,12.5 Q12,14 10,12.5 L5,9 Q3,8 5,7 Z" stroke-width="1.8" fill="#ffffff" fill-opacity="0.1"/>
  <path d="M4,12 L10,16 Q12,17.2 14,16 L20,12" stroke-width="1.8"/>
  <path d="M4,16 L10,20 Q12,21.2 14,20 L20,16" stroke-width="1.8" stroke-opacity="0.5"/>
</svg>`;

function buildLogo(name: string, textColor: string): string {
  const escaped = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const textWidth = escaped.length * 8.5;
  const iconWidth = 22;
  const gap = 4;
  const height = 21;
  const totalWidth = Math.ceil(iconWidth + gap + textWidth);
  const fillOpacity = textColor === '#ffffff' ? '0.1' : '0.08';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${height}">
  <g stroke="${textColor}" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9,2.5 Q11,1 13,2.5 L18,5 Q20,6 18,7 L13,9.5 Q11,11 9,9.5 L4,7 Q2,6 4,5 Z" stroke-width="1.5" fill="${textColor}" fill-opacity="${fillOpacity}"/>
    <path d="M3,10 L9,13.5 Q11,14.8 13,13.5 L19,10" stroke-width="1.5"/>
    <path d="M3,13.5 L9,17 Q11,18.3 13,17 L19,13.5" stroke-width="1.5" stroke-opacity="0.5"/>
  </g>
  <text x="${iconWidth + gap}" y="15" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="600" fill="${textColor}">${escaped}</text>
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
      logoHeight: 24,
      showLogoDocsLabel: true,
      favicon: './assets/favicon.svg',
      theme: 'system',
      sources: [
        {
          title: 'REST API V1',
          type: 'openapi-spec',
          spec: './specs/petstore.yaml',
          intro: './docs/REST_INTRO.md',
          languages: langConfigs,
        },
        {
          title: 'WebSocket API',
          type: 'asyncapi-spec',
          spec: './specs/chat-asyncapi.yaml',
          languages: langConfigs,
        },
        {
          title: 'GraphQL',
          type: 'graphql-spec',
          spec: './specs/petstore.graphql',
          endpoint: 'http://localhost:4000/graphql',
          languages: langConfigs,
        },
        {
          title: 'OpenRPC',
          type: 'openrpc-spec',
          spec: './specs/petstore-openrpc.json',
          languages: langConfigs,
        },
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
      publish: {
        mcp: { url: 'https://registry.npmjs.org', token_env: 'NPM_TOKEN', access: 'public' },
        registries: {
          typescript: {
            url: 'https://registry.npmjs.org',
            token_env: 'NPM_TOKEN',
            access: 'public',
          },
          python: { url: 'https://upload.pypi.org/legacy/', token_env: 'PYPI_TOKEN' },
          go: {
            url: `https://github.com/${clean}/go-sdk.git`,
            token_env: 'GIT_TOKEN',
            username_env: 'GIT_USERNAME',
          },
          java: { token_env: 'MAVEN_TOKEN', username_env: 'MAVEN_USERNAME' },
          kotlin: { token_env: 'MAVEN_TOKEN', username_env: 'MAVEN_USERNAME' },
          ruby: { url: 'https://rubygems.org', token_env: 'GEM_HOST_API_KEY' },
          php: {
            url: `https://github.com/${clean}/php-sdk.git`,
            token_env: 'GIT_TOKEN',
            username_env: 'GIT_USERNAME',
          },
          csharp: { url: 'https://api.nuget.org/v3/index.json', token_env: 'NUGET_API_KEY' },
          rust: { token_env: 'CARGO_REGISTRY_TOKEN' },
          cpp: {
            name: 'company-conan',
            token_env: 'CONAN_PASSWORD',
            username_env: 'CONAN_LOGIN_USERNAME',
          },
          c: {
            name: 'company-conan',
            token_env: 'CONAN_PASSWORD',
            username_env: 'CONAN_LOGIN_USERNAME',
          },
        },
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
      publish: config.publish,
    };
    const configContent = `# Cortex Configuration\n\n${yaml.dump(serializable, { lineWidth: 120, noRefs: true }).replace(/^theme: system$/m, 'theme: system # system, light, dark')}`;
    fs.writeFileSync(configPath, configContent, 'utf-8');
    this.logger.success('Created cortex.config.yml');

    const specsDir = path.join(process.cwd(), 'specs');
    fs.mkdirSync(specsDir, { recursive: true });

    const fixturesDir = getFixturesDir();
    for (const [target, source] of Object.entries(FIXTURE_FILES)) {
      const filePath = path.join(process.cwd(), target);
      if (!fs.existsSync(filePath)) {
        const fixturePath = path.join(fixturesDir, source);
        if (fs.existsSync(fixturePath)) {
          fs.copyFileSync(fixturePath, filePath);
        } else {
          const fallback: Record<string, string> = {
            'specs/petstore.yaml': PETSTORE_TEMPLATE,
            'specs/chat-asyncapi.yaml': ASYNCAPI_TEMPLATE,
            'specs/petstore.graphql': GRAPHQL_TEMPLATE,
            'specs/petstore-openrpc.json': OPENRPC_TEMPLATE,
          };
          fs.writeFileSync(filePath, fallback[target] ?? '', 'utf-8');
        }
        this.logger.success(`Created ${target}`);
      }
    }

    let baseUrl = 'https://api.example.com';
    const petstorePath = path.join(process.cwd(), 'specs', 'petstore.yaml');
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
    fs.writeFileSync(
      path.join(assetsDir, 'logo_dark.svg'),
      buildLogo(projectName, '#ffffff'),
      'utf-8',
    );
    this.logger.success('Created assets/logo_dark.svg');
    fs.writeFileSync(
      path.join(assetsDir, 'logo_light.svg'),
      buildLogo(projectName, '#0a0a0a'),
      'utf-8',
    );
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
      'Edit cortex.config.yml to add your own API specs — see docs at https://docs.cortexdocs.dev/configuration',
    ]);
  }
}
