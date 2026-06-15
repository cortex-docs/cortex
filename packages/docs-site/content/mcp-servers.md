---
title: MCP Servers
description: Generate Model Context Protocol servers for AI agent integration.
order: 4
---

# MCP Servers

Cortex can generate [Model Context Protocol](https://modelcontextprotocol.io) servers from your API specs, enabling AI agents to interact with your API.

## What is MCP?

MCP (Model Context Protocol) is a standard for connecting AI models to external tools and data sources. Each API endpoint becomes an MCP "tool" that AI agents can discover and invoke.

## Generating an MCP Server

```bash
cortex mcp generate
```

This creates a standalone Node.js project with:

- `src/server.ts` — MCP server with tool registrations
- `src/handlers.ts` — Handler functions for each API operation
- `src/main.ts` — Entry point (stdio transport)
- `package.json` — Dependencies including `@modelcontextprotocol/sdk`

## Configuration

Configure MCP in `cortex.config.yml`:

```yaml
mcp:
  package_name: "@my-org/mcp"
  github_repository: "github.com/my-org/mcp"
```

| Field | Type | Description |
|-------|------|-------------|
| `package_name` | string | Package name for the MCP server — used with `npx` for client setup |
| `github_repository` | string | Repository URL for the MCP package |

## Client Setup

Once published, users connect to your MCP server with `npx` — no build step needed:

```bash
npx @my-org/mcp
```

Every major AI client supports this. For example, in Claude Code:

```bash
claude mcp add my-org-mcp -- npx @my-org/mcp
```

Or in any JSON-based client config (Claude Desktop, Cursor, VS Code, etc.):

```json
{
  "mcpServers": {
    "my-org-mcp": {
      "command": "npx",
      "args": ["@my-org/mcp"]
    }
  }
}
```

See the **MCP → Setup** page in the docs UI for per-client setup instructions.

## Tool Mapping

Each API operation becomes an MCP tool:

| OpenAPI | MCP Tool |
|---------|----------|
| `GET /pets` (listPets) | `pets_list` |
| `POST /pets` (createPet) | `pets_create` |
| `GET /pets/{id}` (getPet) | `pets_get` |

Path parameters, query parameters, and request body fields are all exposed as tool input parameters with their descriptions and types from the spec.

The MCP server also includes tools for:

- **Documentation pages** from `docs` sections in your config
- **SDK references** for each configured language/package
- **WebSocket channels**, **GraphQL operations**, and **gRPC services** if configured

## Agent Instructions

The generated MCP server includes built-in instructions that guide AI agents to:

1. Prioritize SDK integration adjusted to the user's codebase
2. Show SDK installation via the appropriate package manager
3. Fall back to direct API calls only if no SDK is available for the user's language
