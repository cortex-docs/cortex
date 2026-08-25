# Getting Started

Cortex Docs generates typed SDKs, interactive documentation, and Model Context Protocol (MCP) servers.

Generated SDKs include HTTP timeouts, chunked-response streams, connection recovery, WebSocket heartbeats, and gRPC streams.

## Main Features

- Combine multiple API specifications in one project and one generated SDK.
- Generate typed clients for 11 programming languages.
- Build interactive documentation for each API source.
- Add custom Markdown pages and SDK guides to the documentation site.
- Generate MCP tools and resources from API specifications, custom Markdown pages, and SDK guides.
- Publish generated packages to language registries and GitHub repositories.

## Supported API Sources

| Source          | Generated SDK                             | Documentation                 | Generated MCP server               |
| --------------- | ----------------------------------------- | ----------------------------- | ---------------------------------- |
| OpenAPI         | REST clients                              | Interactive API reference     | Callable tools and specifications  |
| AsyncAPI        | WebSocket clients                         | Channel and message reference | Payload tools and specifications   |
| GraphQL SDL     | Query, mutation, and subscription clients | Operation and type reference  | Callable tools and embedded schema |
| Protocol Buffer | Unary and streaming gRPC clients          | Service and message reference | Embedded `.proto` resources        |
| OpenRPC         | JSON-RPC clients                          | Method and schema reference   | Callable tools and specifications  |

The generated MCP server exposes Protocol Buffer files as resources. It does not call gRPC methods.

## Installation

```bash
npm install -g @cortex-docs/cli
```

## Quick Start

### Initialize a project

```bash
cortex init my-project
```

This command creates a new project with starter files:

- `cortex.config.yml` — project configuration
- `specs/` — sample API specification files (OpenAPI, AsyncAPI, GraphQL, OpenRPC, and Protocol Buffers)
- `docs/quickstart.md` — starter documentation page
- `docs/REST_INTRO.md` — starter intro document (rendered at the top of the API Reference)
- `assets/` — logos, favicon, and section icons

### Add your API sources

Edit `cortex.config.yml` to add your specification files. See the [Configuration](/docs/configuration) guide for the full reference.

### Add custom Markdown docs

Add Markdown files to the `docs` section of `cortex.config.yml`:

```yaml
docs:
  - section: Get started
    sources:
      - title: Quickstart
        document: ./docs/quickstart.md
      - title: Authentication
        document: ./docs/authentication.md
```

Cortex Docs adds these pages to the documentation site. The generated MCP server also includes their content as tools.

### Generate SDKs

```bash
cortex generate
```

This command generates SDKs, the MCP server, and documentation for all configured sources and languages.

### Generate only the MCP server

```bash
cortex mcp generate --output .cortex/mcp-server
```

The generated package contains local copies of each configured specification. It also includes custom Markdown pages and generated SDK guides.

### Preview documentation

```bash
cortex docs serve
```

This command starts a local documentation server. The server watches the configuration and source files, then regenerates the SDKs after changes.

## How It Works

1. **Parse** — Cortex parses and validates each API specification from a file or URL
2. **Resolve** — Cortex resolves local component references when code generation needs their values
3. **Transform** — Cortex groups operations into resources with tags or `x-cortex-resource`
4. **Generate** — Cortex creates SDKs, documentation, and an MCP server from the project configuration

## Connection and Stream Behavior

The generated SDK controls transport behavior at runtime. You do not need to regenerate an SDK to change these options.

| Protocol  | Behavior                                                                             | Default values                                      |
| --------- | ------------------------------------------------------------------------------------ | --------------------------------------------------- |
| HTTP      | Request timeout and incremental chunked-response consumption                         | 15-second timeout                                   |
| WebSocket | Reconnection, retry limit, and project-specific heartbeat messages                   | Heartbeat disabled until configured on the source   |
| GraphQL   | Subscription reconnection, active-operation restoration, keepalive, and HTTP timeout | 3-second retry, 10 attempts, 15-second HTTP timeout |
| gRPC      | Server streams plus runtime-supported client and bidirectional streams               | Behavior from the Protocol Buffer RPC declaration   |

The exact option names follow the conventions of each generated language. The SDK Generation guides contain examples for each protocol.

## CLI Usage

| Command                                 | Description                                                 |
| --------------------------------------- | ----------------------------------------------------------- |
| `cortex init <name>`                    | Create a new project with a configuration and starter files |
| `cortex generate`                       | Generate SDKs and an MCP server from `cortex.config.yml`    |
| `cortex generate --language typescript` | Generate a specific language only                           |
| `cortex generate --dry-run`             | Preview without writing files                               |
| `cortex generate --no-mcp`              | Skip MCP server generation                                  |
| `cortex publish`                        | Publish generated SDKs to package registries                |
| `cortex publish --dry-run`              | Preview publish commands                                    |
| `cortex validate`                       | Validate the configuration and each API specification       |
| `cortex docs serve`                     | Preview docs and regenerate SDKs after source changes       |
| `cortex docs build`                     | Build a production Node.js documentation server             |
| `cortex docs start`                     | Start a production documentation build                      |
| `cortex mcp generate`                   | Generate an MCP server standalone                           |

## Supported Languages

Cortex generates SDKs for **11 languages**:

| Language   | Package Format | HTTP Client |
| ---------- | -------------- | ----------- |
| TypeScript | npm            | fetch       |
| Python     | pip            | httpx       |
| Go         | Go module      | net/http    |
| Java       | Maven          | HttpClient  |
| Kotlin     | Gradle         | HttpClient  |
| Ruby       | gem            | Faraday     |
| PHP        | Composer       | Guzzle      |
| C#         | NuGet          | HttpClient  |
| Rust       | Cargo          | reqwest     |
| C++        | CMake          | cpp-httplib |
| C          | CMake          | libcurl     |

## Naming Conventions

Cortex follows each language's idiomatic conventions:

| Language   | Classes    | Methods    | Properties | Files      |
| ---------- | ---------- | ---------- | ---------- | ---------- |
| TypeScript | PascalCase | camelCase  | camelCase  | kebab-case |
| Python     | PascalCase | snake_case | snake_case | snake_case |
| Go         | PascalCase | PascalCase | PascalCase | snake_case |
| Java       | PascalCase | camelCase  | camelCase  | PascalCase |
| Kotlin     | PascalCase | camelCase  | camelCase  | PascalCase |
| Ruby       | PascalCase | snake_case | snake_case | snake_case |
| PHP        | PascalCase | camelCase  | camelCase  | PascalCase |
| C#         | PascalCase | PascalCase | PascalCase | PascalCase |
| Rust       | PascalCase | snake_case | snake_case | snake_case |
| C++        | PascalCase | snake_case | snake_case | snake_case |
| C          | PascalCase | snake_case | snake_case | snake_case |

## Next Steps

- [Configuration](/docs/configuration) — Full configuration reference
- [OpenAPI](/docs/sdk-generation) — HTTP timeouts and chunked responses
- [WebSocket SDKs](/docs/websocket-sdks) — AsyncAPI and real-time clients
- [GraphQL](/docs/graphql) — Generate GraphQL client SDKs
- [gRPC](/docs/grpc) — Generate unary and streaming RPC clients
- [OpenRPC](/docs/openrpc) — Generate JSON-RPC clients from OpenRPC specifications
- [Documentation](/docs/api-docs) — REST, WebSocket, and MCP docs
- [MCP Servers](/docs/mcp-servers) — Generate AI agent tools
- [Publishing](/docs/publishing) — Publish SDK and MCP packages to registries
