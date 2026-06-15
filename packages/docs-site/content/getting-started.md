---
title: Getting Started
description: Install Cortex and generate your first SDK from an OpenAPI spec.
order: 1
---

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
- `docs/quickstart.md` — starter documentation page
- `docs/REST_INTRO.md` — starter intro document (rendered at the top of the API Reference)
- `assets/logo.svg` — default logo (shown in the docs header)

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

Opens a local server with interactive documentation for REST endpoints, WebSocket channels, and MCP tools.

## Supported Languages

Cortex generates SDKs for **11 languages**:

| Language   | Package Format | HTTP Client |
|-----------|---------------|-------------|
| TypeScript | npm           | fetch       |
| Python     | pip           | httpx       |
| Go         | Go module     | net/http    |
| Java       | Maven         | HttpClient  |
| Kotlin     | Gradle        | HttpClient  |
| Ruby       | gem           | Faraday     |
| PHP        | Composer      | Guzzle      |
| C#         | NuGet         | HttpClient  |
| Rust       | Cargo         | reqwest     |
| C++        | CMake         | cpp-httplib |
| C          | CMake         | libcurl     |

## What's Next

- [Configuration](/docs/configuration) — Full config reference
- [SDK Generation](/docs/sdk-generation) — How code generation works
- [Documentation](/docs/api-docs) — REST, WebSocket, and MCP docs
- [WebSocket SDKs](/docs/websocket-sdks) — AsyncAPI and real-time clients
- [GraphQL](/docs/graphql) — Generate GraphQL client SDKs
- [gRPC](/docs/grpc) — Generate gRPC clients from Protocol Buffer definitions
- [MCP Servers](/docs/mcp-servers) — Generate AI agent tools
- [Publishing](/docs/publishing) — Publish SDKs to registries
