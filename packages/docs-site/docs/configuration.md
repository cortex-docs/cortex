
# Configuration

`cortex init` scaffolds a new project with a `cortex.config.yml` and starter files:

```bash
cortex init my-project
```

After initialization, add your API sources to the config and run `cortex generate` to generate SDKs.

## Config File

```yaml
project: my-project
title: My Project Documentation
logo: ./assets/logo.svg
theme: system
primaryColor: '#ffffff'

sources:
  - title: 'REST API V1'
    type: openapi-spec
    spec: ./specs/openapi.yaml
    intro: ./docs/REST_INTRO.md
    languages:
      - language: typescript
        package_name: '@my-org/typescript-client-sdk'
        github_repository: 'github.com/my-org/typescript-client-sdk'
      - language: python
        package_name: 'my-org-python-sdk'
        github_repository: 'github.com/my-org/python-sdk'

  - title: 'WebSocket API'
    type: asyncapi-spec
    spec: ./specs/asyncapi.yaml
    languages:
      - language: typescript
        package_name: '@my-org/typescript-client-sdk'
        github_repository: 'github.com/my-org/typescript-client-sdk'

  - title: 'GraphQL'
    type: graphql-spec
    spec: ./specs/schema.graphql
    languages:
      - language: typescript
        package_name: '@my-org/typescript-client-sdk'

  - title: 'JSON-RPC'
    type: openrpc-spec
    spec: ./specs/api-openrpc.json
    languages:
      - language: typescript
        package_name: '@my-org/typescript-client-sdk'

output:
  base_dir: ./generated

docs:
  - section: 'Get started'
    sources:
      - title: 'Quickstart'
        document: 'docs/quickstart.md'
  - section: 'Guides'
    sources:
      - title: 'Authentication'
        document: 'docs/auth.md'

mcp:
  package_name: '@my-org/mcp'
  github_repository: 'github.com/my-org/mcp'
```

## Top-level Fields

| Field             | Type   | Required | Description                                                                                                                                                                                                                                                                                  |
| ----------------- | ------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project`         | string | Yes      | Your project name (the only required `init` argument)                                                                                                                                                                                                                                        |
| `title`           | string | No       | Documentation site title (default: `"{project} Docs"`) — shown in the header and home page                                                                                                                                                                                                   |
| `logo`            | string | No       | Path to a logo file — PNG, JPG, or SVG (default: `./assets/logo.svg`, created by `init`)                                                                                                                                                                                                     |
| `favicon`         | string | No       | Path to a custom favicon                                                                                                                                                                                                                                                                     |
| `theme`           | string | No       | Color theme: `light`, `dark`, or `system` (default: `system`)                                                                                                                                                                                                                                |
| `primaryColor`    | string | No       | Brand accent color as a hex code (e.g. `"#01FFB2"`). Styles buttons, active nav icons, card tints, and hover accents. Automatically adjusts brightness per theme for readability — dark colors brighten on dark backgrounds, light colors deepen on light backgrounds (default: `"#ffffff"`) |
| `sources`         | array  | Yes      | List of API spec sources (see below)                                                                                                                                                                                                                                                         |
| `output.base_dir` | string | No       | Base output directory (default: `./generated`)                                                                                                                                                                                                                                               |

## Sources

The `sources` array is the primary way to define your API specs. Each source represents a single spec file and its language targets.

### Source Fields

| Field       | Type   | Required | Description                                                             |
| ----------- | ------ | -------- | ----------------------------------------------------------------------- |
| `title`     | string | Yes      | Display title (shown in docs sidebar)                                   |
| `type`      | string | Yes      | One of: `openapi-spec`, `asyncapi-spec`, `graphql-spec`, `openrpc-spec` |
| `spec`      | string | Yes      | Path or URL to your spec file                                           |
| `intro`     | string | No       | Path to a Markdown file rendered at the top of the spec section in docs |
| `languages` | array  | Yes      | Language targets (at least one)                                         |

### Source Types

| Type            | Description                                         |
| --------------- | --------------------------------------------------- |
| `openapi-spec`  | OpenAPI 3.x specification (REST API)                |
| `asyncapi-spec` | AsyncAPI specification (WebSocket/event-driven API) |
| `graphql-spec`  | GraphQL schema definition                           |
| `openrpc-spec`  | OpenRPC specification (JSON-RPC API)                |

### Intro Documents

Each source supports an optional `intro` field that points to a Markdown file. This content renders at the top of that spec's section in the API Reference, directly under the section title and before any operations.

```yaml
sources:
  - title: 'REST API V1'
    type: openapi-spec
    spec: ./specs/openapi.yaml
    intro: ./docs/REST_INTRO.md
    languages:
      - language: typescript
        package_name: '@my-org/typescript-client-sdk'
```

Use intro documents to provide context like base URLs, authentication guides, rate limiting policies, or overview content specific to that protocol. The `cortex init` command creates a starter `docs/REST_INTRO.md` automatically.

Intro content is also:

- Embedded in the MCP server agent instructions
- Available as `intro_*` tools for AI agents

### Language Config (per source)

Each language entry within a source configures how the SDK is generated for that language:

| Field               | Type   | Required | Description                                                                   |
| ------------------- | ------ | -------- | ----------------------------------------------------------------------------- |
| `language`          | string | Yes      | One of: typescript, python, go, java, kotlin, ruby, php, csharp, rust, cpp, c |
| `package_name`      | string | Yes      | Package name for the generated SDK                                            |
| `github_repository` | string | No       | Repository URL for documentation links                                        |

### Shared Package Names

Multiple sources can share the same `package_name` and `github_repository`. When they do, all protocol-specific code (REST, WebSocket, GraphQL, JSON-RPC) is merged into a single SDK package:

```yaml
sources:
  - title: 'REST API V1'
    type: openapi-spec
    spec: ./specs/openapi.yaml
    languages:
      - language: typescript
        package_name: '@my-org/sdk'
  - title: 'WebSocket API'
    type: asyncapi-spec
    spec: ./specs/asyncapi.yaml
    languages:
      - language: typescript
        package_name: '@my-org/sdk' # Same package — files are merged
```

### Output Directory

The `output_dir` for each language is computed automatically from the `output.base_dir`, language, and `package_name`:

```
{output.base_dir}/{language}/{sanitized_package_name}
```

For example, `@my-org/typescript-client-sdk` with `base_dir: ./generated` and language `typescript` produces `./generated/typescript/my-org-typescript-client-sdk`. This ensures SDKs for different languages never overwrite each other, even when sharing the same package name.

### Spec Input

Each source's `spec` field accepts:

- **Local file paths**: `./specs/openapi.yaml`, `./specs/api.json`
- **Remote URLs**: `https://example.com/api/openapi.json`
- **YAML or JSON**: Both formats are auto-detected

## Versioning

Versions are **auto-incremented per package** — there is no `version` field in the config. Each time you run `cortex generate`, the patch version is bumped automatically for each generated package (`0.1.0` → `0.1.1` → `0.1.2`, etc.). The version is tracked in each package's manifest file (`package.json`, `setup.py`, `pom.xml`, etc.).

## Documentation Pages

The `docs` field is an array of sections that configures documentation displayed in the Cortex docs UI. Each section contains one or more Markdown documents:

```yaml
docs:
  - section: 'Get started'
    sources:
      - title: 'Quickstart'
        document: 'docs/quickstart.md'
  - section: 'Guides'
    sources:
      - title: 'Authentication'
        document: 'docs/auth.md'
      - title: 'Pagination'
        document: 'docs/pagination.md'
```

### Section Fields

| Field     | Type   | Required | Description                              |
| --------- | ------ | -------- | ---------------------------------------- |
| `section` | string | Yes      | Section heading displayed in the sidebar |
| `sources` | array  | Yes      | List of documents in this section        |

### Document Fields

| Field      | Type   | Required | Description                                  |
| ---------- | ------ | -------- | -------------------------------------------- |
| `title`    | string | Yes      | Document title displayed in the sidebar      |
| `document` | string | Yes      | Path to a Markdown file (relative to config) |

Documentation pages are:

- Available in the docs UI under the "Docs" tab
- Searchable via the search bar (Cmd+K)
- Exposed as tools in the MCP server

When you run `cortex init`, a `docs/quickstart.md` is created automatically with a starter template.

## Home Page

The `home` field configures the documentation landing page:

```yaml
home:
  title: 'My Project Docs'
  description: 'Explore the full API surface and grab a client SDK.'
  cta:
    label: 'Getting Started'
    href: '/docs'
  sections:
    - title: 'API Reference'
      description: 'Try endpoints, visualize schema, and check out code samples.'
      badge: 'Reference'
      href: '/reference'
      background: 'assets/diamonds.svg'
    - title: 'SDKs'
      description: 'Typed client libraries for every major language.'
      badge: 'Libraries'
      href: '/sdks'
      background: 'assets/hexagons.svg'
    - title: 'MCP'
      description: 'Hook up AI coding agents via our MCP in seconds.'
      badge: 'AI Agents'
      href: '/mcp'
      background: 'assets/circuits.svg'
```

### Home Fields

| Field         | Type   | Required | Description                                             |
| ------------- | ------ | -------- | ------------------------------------------------------- |
| `title`       | string | No       | Hero title (default: site `title`)                      |
| `description` | string | No       | Hero subtitle text                                      |
| `cta.label`   | string | No       | Call-to-action button text (default: "Getting Started") |
| `cta.href`    | string | No       | CTA link target (default: "/docs")                      |
| `sections`    | array  | No       | Cards displayed below the hero                          |

### Section Fields

| Field         | Type   | Required | Description                                                              |
| ------------- | ------ | -------- | ------------------------------------------------------------------------ |
| `title`       | string | Yes      | Card title                                                               |
| `description` | string | Yes      | Card description                                                         |
| `badge`       | string | Yes      | Small uppercase badge label                                              |
| `href`        | string | Yes      | Link target when clicked                                                 |
| `background`  | string | No       | Path to an SVG file for the card background (e.g. `assets/diamonds.svg`) |

Three animated SVG backgrounds are created by `cortex init`: `assets/diamonds.svg`, `assets/hexagons.svg`, and `assets/circuits.svg`. You can replace them with your own SVGs or add new ones.

You can add as many sections as needed — they render in a responsive grid. When no `home` config is provided, the default 3-section layout (API Reference, SDKs, MCP) is used.

## MCP Server

The `mcp` field configures the generated MCP (Model Context Protocol) server that lets AI agents interact with your API:

```yaml
mcp:
  package_name: '@my-org/mcp'
  github_repository: 'github.com/my-org/mcp'
```

| Field               | Type   | Required | Description                                                                                      |
| ------------------- | ------ | -------- | ------------------------------------------------------------------------------------------------ |
| `package_name`      | string | No       | Package name for the MCP server (default: `"@{project}/mcp"`) — used with `npx` for client setup |
| `github_repository` | string | No       | Repository URL for the MCP package                                                               |

The generated MCP server automatically includes tools for:

- **REST endpoints** from OpenAPI sources
- **WebSocket channels** from AsyncAPI sources
- **GraphQL operations** from GraphQL sources
- **JSON-RPC methods** from OpenRPC sources
- **Documentation pages** from `docs` sections
- **SDK references** for each configured language/package

The server also includes agent instructions that guide AI assistants to prioritize SDK integration over direct API calls, adjusted to the user's codebase.

## Vendor Extensions

You can use `x-cortex-*` extensions in your OpenAPI spec to control generation:

```yaml
paths:
  /users:
    get:
      x-cortex-resource: users
      x-cortex-method-name: list
```

| Extension              | Description                    |
| ---------------------- | ------------------------------ |
| `x-cortex-resource`    | Override resource grouping     |
| `x-cortex-method-name` | Override generated method name |

## Config File Discovery

When running `cortex generate` without a spec argument, Cortex searches for config files in this order:

1. `cortex.config.yml`
2. `cortex.config.yaml`
3. `cortex.yml`

It walks up the directory tree up to 10 levels looking for a config file.
