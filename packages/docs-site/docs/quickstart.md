# Getting Started

Cortex generates typed SDKs, WebSocket clients, interactive documentation, and MCP servers from your OpenAPI and AsyncAPI specifications.

## Installation

```bash
npm install -g @cortex/cli
```

## Quick Start

### Initialize a project

```bash
cortex init my-project
```

This scaffolds a new project with starter files:

- `cortex.config.yml` — project configuration
- `specs/` — sample API spec files (OpenAPI, AsyncAPI, GraphQL, OpenRPC)
- `docs/quickstart.md` — starter documentation page
- `docs/REST_INTRO.md` — starter intro document (rendered at the top of the API Reference)
- `assets/` — logos, favicon, and section icons

### Add your API sources

Edit `cortex.config.yml` to add your spec files. See the [Configuration](/docs/configuration) guide for the full reference.

### Generate SDKs

```bash
cortex generate
```

This reads your config and generates SDKs, MCP server, and documentation for all configured sources and languages.

### Preview documentation

```bash
cortex docs serve
```

Opens a local server with interactive documentation for your project. Watches for spec and config changes and auto-regenerates SDKs.

## How It Works

1. **Parse** — Your API specs are parsed and validated (from file or URL)
2. **Resolve** — All `$ref` references are resolved and schemas are flattened
3. **Transform** — Operations are grouped into resources based on tags or `x-cortex-resource`
4. **Generate** — Each language plugin produces native code with proper types and naming conventions

## CLI Usage

| Command                                 | Description                                                         |
| --------------------------------------- | ------------------------------------------------------------------- |
| `cortex init <name>`                    | Scaffold a new project with config and starter files                |
| `cortex generate`                       | Generate SDKs and MCP server from `cortex.config.yml`               |
| `cortex generate --language typescript` | Generate a specific language only                                   |
| `cortex generate --dry-run`             | Preview without writing files                                       |
| `cortex generate --no-mcp`              | Skip MCP server generation                                          |
| `cortex publish`                        | Publish generated SDKs to package registries                        |
| `cortex publish --dry-run`              | Preview publish commands                                            |
| `cortex validate`                       | Validate your spec and config                                       |
| `cortex docs serve`                     | Preview docs locally (auto-regenerates SDKs on spec/config changes) |
| `cortex docs build`                     | Build static documentation site                                     |
| `cortex mcp generate`                   | Generate an MCP server standalone                                   |

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

## What's Next

- [Configuration](/docs/configuration) — Full config reference
- [OpenAPI](/docs/sdk-generation) — REST SDK generation from OpenAPI specs
- [WebSocket SDKs](/docs/websocket-sdks) — AsyncAPI and real-time clients
- [GraphQL](/docs/graphql) — Generate GraphQL client SDKs
- [OpenRPC / JSON-RPC](/docs/openrpc) — Generate JSON-RPC clients from OpenRPC specifications
- [Documentation](/docs/api-docs) — REST, WebSocket, and MCP docs
- [MCP Servers](/docs/mcp-servers) — Generate AI agent tools
- [Publishing](/docs/publishing) — Publish SDKs to registries
