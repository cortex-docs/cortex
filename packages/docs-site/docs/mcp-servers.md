# MCP Servers

Cortex Docs can generate [Model Context Protocol](https://modelcontextprotocol.io) servers from API specifications and project documentation.

You can replace server, handler, entry point, package, README, and final-file templates. See [Custom Generators](/docs/custom-generators).

## What is MCP?

MCP is a standard for connecting AI models to tools and data sources. Cortex Docs maps supported operations to tools and adds specification files as resources.

## Generating an MCP Server

```bash
cortex mcp generate
```

This creates a standalone Node.js project with:

- `src/server.ts` — MCP server with tool registrations
- `src/handlers.ts` — Handler functions for each API operation
- `src/main.ts` — Entry point (stdio transport)
- `specs/` — Local copies of every configured API specification
- `package.json` — Dependencies including `@modelcontextprotocol/sdk`
- `.cortex-package.json` — Managed package metadata for `cortex publish`

## Configuration

Configure MCP in `cortex.config.yml`:

```yaml
mcp:
  package_name: '@my-org/mcp'
  github_repository: 'github.com/my-org/mcp'
```

| Field               | Type   | Description                                                        |
| ------------------- | ------ | ------------------------------------------------------------------ |
| `package_name`      | string | Package name for the MCP server — used with `npx` for client setup |
| `github_repository` | string | Repository URL for the MCP package                                 |

## Publish the MCP Server

Set the package name and publish destinations in `cortex.config.yml`:

```yaml
mcp:
  package_name: '@my-org/mcp'
  github_repository: https://github.com/my-org/mcp

publish:
  mcp:
    url: https://registry.npmjs.org
    token_env: NPM_TOKEN
    access: public
    github:
      token_env: GITHUB_TOKEN
      branch: main
```

Create an npm automation token. Set the token before publication:

```bash
export NPM_TOKEN='npm_...'
export GITHUB_TOKEN='github_pat_...'
```

Do not put the token value in `cortex.config.yml`. The `token_env` field contains only the environment-variable name.

Generate and publish the package:

```bash
cortex generate
cortex publish --mcp --dry-run
cortex publish --mcp
```

Cortex installs dependencies, builds the server, and checks the npm package contents. It publishes the npm package and pushes the generated source with a `v<version>` Git tag.

The GitHub repository must exist before publication. The token must have read and write access to repository contents.

To publish only to npm, remove `github` from `publish.mcp`. To publish only to GitHub, set `publish.mcp.enabled: false` and keep `publish.mcp.github`.

You can also publish output from the standalone MCP command:

```bash
cortex mcp generate --output .cortex/mcp-server
cortex publish .cortex/mcp-server --mcp
```

If you omit `publish.mcp`, Cortex uses the TypeScript registry in `publish.registries.typescript`. See [Publish SDK and MCP packages](/docs/publishing) for all destination, credential, version, and checksum rules.

## Client Setup

After publication, users can connect to the MCP server with `npx`:

```bash
npx @my-org/mcp
```

For example, in Claude Code:

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

| OpenAPI                   | MCP Tool      |
| ------------------------- | ------------- |
| `GET /pets` (listPets)    | `pets_list`   |
| `POST /pets` (createPet)  | `pets_create` |
| `GET /pets/{id}` (getPet) | `pets_get`    |

Path parameters, query parameters, and request body fields are all exposed as tool input parameters with their descriptions and types from the spec.

The MCP server also includes:

- **Documentation pages** from `docs` sections in your config
- **SDK references** for each configured language/package
- **WebSocket channel descriptions and payload preparation**
- **GraphQL and JSON-RPC operation tools**
- **All specification files as MCP resources**

Protocol Buffer files are available as resources. The generated server does not call gRPC methods.

## Agent Instructions

The generated MCP server includes built-in instructions that guide AI agents to:

1. Prioritize SDK integration adjusted to the user's codebase
2. Show SDK installation via the appropriate package manager
3. Fall back to direct API calls only if no SDK is available for the user's language
