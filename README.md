# Cortex Docs

[![CI](https://github.com/cortex-docs/cortex/actions/workflows/ci.yml/badge.svg)](https://github.com/cortex-docs/cortex/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Cortex Docs generates typed SDKs, interactive API documentation, and Model Context Protocol (MCP) servers from API specifications and custom markdown docs.

One project can combine OpenAPI, AsyncAPI, GraphQL, Protocol Buffer, and OpenRPC sources. Cortex Docs generates one package for each configured language.

## Live demo

**[Open the Cortex Docs demo →](https://demo.cortexdocs.dev)**

## Features

- Generate SDKs for TypeScript, Python, Go, Java, Kotlin, Ruby, PHP, C#, Rust, C++, and C.
- Combine multiple specification files in one generated SDK.
- Generate HTTP, WebSocket, GraphQL, gRPC, and JSON-RPC clients.
- Generate a production documentation server with interactive API reference pages.
- Generate MCP tools for REST, GraphQL, OpenRPC, and WebSocket payload preparation.
- Add Markdown pages, SDK guides, and all API specifications to the MCP server.
- Customize generated output with sparse Eta template overrides.
- Publish generated packages to language registries and GitHub repositories.

## Requirements

- Node.js 20 or later
- npm 10 or later

Some generated SDKs require the normal compiler or package manager for their target language.

## Quick start

```bash
npm install --global @cortex-docs/cli
cortex init my-api
cd my-api
cortex validate
cortex generate
cortex docs serve
```

Open `http://localhost:3012` unless you selected another port.

## Configuration

`cortex init` creates `cortex.config.yml`. Relative paths start from the directory that contains this file.

```yaml
project: my-api
title: My API Docs
logo: ./assets/logo.svg
theme: system

sources:
  - title: REST API
    type: openapi-spec
    spec: ./specs/openapi.yaml
    intro: ./docs/rest.md
    languages:
      - language: typescript
        package_name: '@my-org/my-api'
      - language: python
        package_name: my-api

  - title: Realtime API
    type: asyncapi-spec
    spec: ./specs/asyncapi.yaml
    languages:
      - language: typescript
        package_name: '@my-org/my-api'

  - title: GraphQL API
    type: graphql-spec
    spec: ./specs/schema.graphql
    endpoint: https://api.example.com/graphql
    languages:
      - language: typescript
        package_name: '@my-org/my-api'

output:
  base_dir: ./generated

docs:
  - section: Get started
    sources:
      - title: Quickstart
        document: ./docs/quickstart.md

mcp:
  package_name: '@my-org/my-api-mcp'
```

Sources that use the same language and `package_name` are merged into one SDK. Cortex Docs rejects duplicate operation and type names that would make a merge ambiguous.

See the [configuration reference](packages/docs-site/docs/configuration.md) for all fields.

## Commands

| Command                                   | Result                                                |
| ----------------------------------------- | ----------------------------------------------------- |
| `cortex init <name>`                      | Create a project and sample files.                    |
| `cortex validate`                         | Validate the config and every API source.             |
| `cortex generate`                         | Generate configured SDKs and the MCP server.          |
| `cortex generate --language typescript`   | Generate one configured language.                     |
| `cortex generate --dry-run`               | Show planned output without writing files.            |
| `cortex docs serve`                       | Start the development server and watch project files. |
| `cortex docs build --output .cortex/docs` | Create a production Node.js documentation build.      |
| `cortex docs start --output .cortex/docs` | Start a production documentation build.               |
| `cortex mcp generate`                     | Generate only the MCP server.                         |
| `cortex publish --dry-run`                | Check package publication without uploading.          |
| `cortex publish`                          | Publish enabled generated packages.                   |

## Protocol support

| Source          | Generated SDK                             | Documentation                 | Generated MCP server                |
| --------------- | ----------------------------------------- | ----------------------------- | ----------------------------------- |
| OpenAPI         | REST clients                              | Interactive API reference     | Callable tools and embedded specs   |
| AsyncAPI        | WebSocket clients                         | Channel and message reference | Payload-preparation tools and specs |
| GraphQL SDL     | Query, mutation, and subscription clients | Operation and type reference  | Callable tools and embedded schema  |
| Protocol Buffer | Unary and streaming gRPC clients          | Service and message reference | Embedded `.proto` resources         |
| OpenRPC         | JSON-RPC clients                          | Method and schema reference   | Callable tools and embedded specs   |

The generated MCP server does not call gRPC methods. It exposes Protocol Buffer files as MCP resources so an agent can inspect the service contract.

## Production documentation

The build command creates a self-contained Next.js server. It is not a static HTML export.

```bash
cortex docs build --output .cortex/docs
NODE_ENV=production cortex docs start --output .cortex/docs --port 3000
```

Deploy the output directory to a service that can run Node.js. Keep `cortex.config.yml` and its referenced specifications available at runtime.

## MCP output

```bash
cortex mcp generate --output .cortex/mcp-server
cd .cortex/mcp-server
npm install
npm run build
npm start
```

The generated package contains local copies of every configured specification. It also embeds configured Markdown and generated SDK README files as tools.

## Packages

| Package                | Purpose                                        |
| ---------------------- | ---------------------------------------------- |
| `@cortex-docs/cli`     | Command-line interface and project workflow    |
| `@cortex-docs/core`    | Configuration loader and specification parsers |
| `@cortex-docs/codegen` | SDK generation engine and language templates   |
| `@cortex-docs/mcp-gen` | MCP server generator                           |
| `@cortex-docs/docs-ui` | Documentation runtime used by the CLI          |

## Documentation

- [Quickstart](packages/docs-site/docs/quickstart.md)
- [Configuration](packages/docs-site/docs/configuration.md)
- [SDK generation](packages/docs-site/docs/sdk-generation.md)
- [WebSocket SDKs](packages/docs-site/docs/websocket-sdks.md)
- [GraphQL](packages/docs-site/docs/graphql.md)
- [gRPC](packages/docs-site/docs/grpc.md)
- [OpenRPC](packages/docs-site/docs/openrpc.md)
- [MCP servers](packages/docs-site/docs/mcp-servers.md)
- [Publishing](packages/docs-site/docs/publishing.md)

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [DEVELOPMENT.md](DEVELOPMENT.md) before you open a pull request.

Report vulnerabilities through the private process in [SECURITY.md](SECURITY.md).

## License

Cortex Docs is available under the [MIT License](LICENSE).
