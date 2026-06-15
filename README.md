# Cortex

**Generate typed SDKs, API Documentation, WebSocket clients, GraphQL clients, gRPC clients, and MCP servers from your OpenAPI, AsyncAPI, GraphQL, and Protocol Buffer specs.**

Cortex takes your specifications and produces production-ready client libraries in 11 languages, real-time WebSocket SDKs, GraphQL and gRPC clients, interactive API documentation, and MCP servers that expose your entire API surface to AI agents.

---

## Features

- **SDK generation** for TypeScript, Python, Go, Java, Kotlin, Ruby, PHP, C#, Rust, C++, and C
- **WebSocket SDK generation** from AsyncAPI specs
- **GraphQL SDK generation** from GraphQL schemas
- **gRPC client generation** from Protocol Buffer definitions
- **Interactive documentation** for REST, WebSockets, GraphQL, gRPC, and MCP — with dark/light mode
- **MCP server generation** so AI agents can integrate your API/SDKs easier [Model Context Protocol](https://modelcontextprotocol.io)
- **Source-based config** — multiple sources, multiple specs, multiple languages, one config file
- **Vendor extensions** (`x-cortex-*`) for fine-grained control over generated output
- **Accepts YAML and JSON** specs from local files or remote URLs

## Quick Start

```bash
# Install
npm install -g @cortex/cli

# Initialize project
cortex init my-project

# Add your API sources to cortex.config.yml (see Configuration docs)
# Then generate SDKs
cortex generate

# Preview documentation
cortex docs serve

# Build static documentation site
cortex docs build --output ./docs

# Publish generated SDKs to package registries
cortex publish
```

## Configuration

`cortex init` scaffolds `cortex.config.yml`. Add your sources and run `cortex generate`:

```yaml
project: my-project
title: My Project Docs
logo: ./assets/logo.svg
theme: system

sources:
  - title: 'REST API V1'
    type: openapi-spec
    spec: ./openapi.yaml
    languages:
      - language: typescript
        package_name: '@my-project/typescript-client-sdk'
        github_repository: 'github.com/my-project/typescript-client-sdk'
      - language: python
        package_name: 'my-project-python-sdk'

  - title: 'WebSocket API'
    type: asyncapi-spec
    spec: ./asyncapi.yaml
    languages:
      - language: typescript
        package_name: '@my-project/typescript-client-sdk'

  - title: 'GraphQL'
    type: graphql-spec
    spec: ./schema.graphql
    languages:
      - language: typescript
        package_name: '@my-project/typescript-client-sdk'

output:
  base_dir: ./generated

docs:
  - section: 'Get started'
    sources:
      - title: 'Quickstart'
        document: 'docs/quickstart.md'

mcp:
  package_name: '@my-project/mcp'
  github_repository: 'github.com/my-project/mcp'
```

Multiple sources can share the same `package_name` — protocol-specific code (REST, WebSocket, GraphQL, gRPC) is merged into a single SDK package. Output directories are computed automatically from the package name.

## Generated SDK Example

```typescript
// REST API
import { MyProjectClient } from '@my-project/typescript-client-sdk';
const client = new MyProjectClient({ bearerToken: 'token' });
const pets = await client.pets.list({ limit: 10 });

// WebSocket
import { WsClient } from '@my-project/typescript-client-sdk';
const ws = new WsClient({ url: 'wss://api.example.com/ws' });
ws.onChatMessages((msg) => console.log(msg));

// GraphQL
import { GqlClient } from '@my-project/typescript-client-sdk';
const gql = new GqlClient({ endpoint: 'https://api.example.com/graphql' });
const result = await gql.pets({ limit: 10 });

// gRPC
import { PetServiceClient } from '@my-project/typescript-client-sdk';
const grpc = new PetServiceClient('localhost:50051');
const pet = await grpc.getPet({ id: 'pet-123' });
```

## CLI Reference

| Command                                 | Description                                           |
| --------------------------------------- | ----------------------------------------------------- |
| `cortex init <name>`                    | Scaffold a new project with config and starter files  |
| `cortex generate`                       | Generate SDKs and MCP server from `cortex.config.yml` |
| `cortex generate --language typescript` | Generate a specific language only                     |
| `cortex generate --dry-run`             | Preview without writing files                         |
| `cortex generate --no-mcp`              | Skip MCP server generation                            |
| `cortex publish`                        | Publish generated SDKs to package registries          |
| `cortex publish --dry-run`              | Preview publish commands                              |
| `cortex validate`                       | Validate your spec and config                         |
| `cortex docs serve`                     | Preview documentation locally                         |
| `cortex docs build`                     | Build static documentation site                       |
| `cortex mcp generate`                   | Generate an MCP server standalone                     |

## Supported Languages

| Language   | Package Format   | HTTP Client       | Generated Structure                  |
| ---------- | ---------------- | ----------------- | ------------------------------------ |
| TypeScript | npm              | `fetch`           | Client + Resources + Types           |
| Python     | pip (setuptools) | `httpx`           | Client + Resources + Pydantic models |
| Go         | Go module        | `net/http`        | Client + Resources + Structs         |
| Java       | Maven            | `java.net.http`   | Client + Resources + POJOs           |
| Kotlin     | Gradle           | `java.net.http`   | Client + Resources + Data classes    |
| Ruby       | gem              | `faraday`         | Client + Resources + Module          |
| PHP        | Composer         | `guzzlehttp`      | Client + Resources + Classes         |
| C#         | NuGet (.csproj)  | `HttpClient`      | Client + Resources + Records         |
| Rust       | Cargo            | `reqwest`/`tonic` | Client + Resources + Structs         |
| C++        | CMake            | `cpp-httplib`     | Client + Resources + Structs         |
| C          | Makefile         | `libcurl`         | Client + Resources + Structs         |

## Vendor Extensions

Use `x-cortex-*` extensions in your OpenAPI spec for fine-grained control:

```yaml
paths:
  /users:
    get:
      x-cortex-resource: users # Override resource grouping
      x-cortex-method-name: list # Override generated method name
```

## Architecture

Cortex is a monorepo with focused packages:

```
packages/
  core/        OpenAPI + AsyncAPI + GraphQL + Protobuf parsing, config loading, shared types
  codegen/     SDK generation engine + language plugins + WebSocket + GraphQL + gRPC plugins
  cli/         NestJS Commander CLI
  mcp-gen/     MCP server generator (REST + WebSocket + GraphQL + gRPC tools)
  docs-ui/     API reference viewer (Next.js) — REST + WebSocket + GraphQL + gRPC tabs
  docs-site/   Product documentation (Next.js + Markdown)
```

## Documentation

Full documentation is available at the [docs site](packages/docs-site/content/):

- [Getting Started](packages/docs-site/content/getting-started.md)
- [Configuration Reference](packages/docs-site/content/configuration.md)
- [SDK Generation](packages/docs-site/content/sdk-generation.md)
- [MCP Servers](packages/docs-site/content/mcp-servers.md)
- [Documentation](packages/docs-site/content/api-docs.md)
- [WebSocket SDKs](packages/docs-site/content/websocket-sdks.md)
- [GraphQL](packages/docs-site/content/graphql.md)
- [gRPC](packages/docs-site/content/grpc.md)
- [Publishing](packages/docs-site/content/publishing.md)

## Contributing

See [DEVELOPMENT.md](DEVELOPMENT.md) for setup instructions, project structure, and contribution guidelines.

## License

[![GitHub license](https://img.shields.io/badge/license-MIT-lightgrey.svg?maxAge=2592000)](https://raw.githubusercontent.com/apollostack/apollo-ios/master/LICENSE)

MIT — see [LICENSE](LICENSE) for details.
