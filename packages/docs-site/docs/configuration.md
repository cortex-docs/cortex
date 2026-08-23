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
        template: ./cortex-templates/typescript-rest
        publish:
          github:
            token_env: GITHUB_TOKEN
      - language: python
        package_name: 'my-org-python-sdk'
        github_repository: 'github.com/my-org/python-sdk'

  - title: 'WebSocket API'
    type: asyncapi-spec
    spec: ./specs/asyncapi.yaml
    websocket:
      heartbeat:
        format: json
        interval_ms: 30000
        timeout_ms: 10000
        client:
          message:
            type: ping
          response:
            type: pong
        server:
          message:
            type: ping
          response:
            type: pong
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

  - title: 'OpenRPC'
    type: openrpc-spec
    spec: ./specs/api-openrpc.json
    languages:
      - language: typescript
        package_name: '@my-org/typescript-client-sdk'

output:
  base_dir: ./generated

generators:
  templates: ./cortex-templates

publish:
  mcp:
    url: https://registry.npmjs.org
    token_env: NPM_TOKEN
    access: public
    github:
      token_env: GITHUB_TOKEN
  registries:
    typescript:
      url: https://registry.npmjs.org
      token_env: NPM_TOKEN
      access: public
    python:
      url: https://upload.pypi.org/legacy/
      token_env: PYPI_TOKEN

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

| Field                  | Type    | Required | Description                                                                                                                                                                                                                                                                                  |
| ---------------------- | ------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project`              | string  | Yes      | Your project name (the only required `init` argument)                                                                                                                                                                                                                                        |
| `title`                | string  | No       | Documentation site title (default: `"{project} Docs"`) — shown in the header and home page                                                                                                                                                                                                   |
| `logo`                 | string  | No       | Path to a logo file — PNG, JPG, or SVG (default: `./assets/logo.svg`, created by `init`)                                                                                                                                                                                                     |
| `logo_dark`            | string  | No       | Logo for the dark theme                                                                                                                                                                                                                                                                      |
| `logo_light`           | string  | No       | Logo for the light theme                                                                                                                                                                                                                                                                     |
| `logoHeight`           | number  | No       | Logo height in pixels                                                                                                                                                                                                                                                                        |
| `showLogoDocsLabel`    | boolean | No       | Show the `Docs` label next to the logo                                                                                                                                                                                                                                                       |
| `favicon`              | string  | No       | Path to a custom favicon                                                                                                                                                                                                                                                                     |
| `theme`                | string  | No       | Color theme: `light`, `dark`, or `system` (default: `system`)                                                                                                                                                                                                                                |
| `primaryColor`         | string  | No       | Brand accent color as a hex code (e.g. `"#01FFB2"`). Styles buttons, active nav icons, card tints, and hover accents. Automatically adjusts brightness per theme for readability — dark colors brighten on dark backgrounds, light colors deepen on light backgrounds (default: `"#ffffff"`) |
| `sources`              | array   | Yes      | List of API spec sources (see below)                                                                                                                                                                                                                                                         |
| `output.base_dir`      | string  | No       | Base output directory (default: `./generated`)                                                                                                                                                                                                                                               |
| `generators.templates` | string  | No       | Root directory for sparse Eta template overrides. Relative paths start from the configuration directory.                                                                                                                                                                                     |
| `home`                 | object  | No       | Landing-page content and navigation cards                                                                                                                                                                                                                                                    |
| `docs`                 | array   | No       | Markdown navigation sections                                                                                                                                                                                                                                                                 |
| `mcp`                  | object  | No       | Generated MCP package settings                                                                                                                                                                                                                                                               |
| `publish`              | object  | No       | Package registry and GitHub publication settings                                                                                                                                                                                                                                             |

See [Custom Generators](/docs/custom-generators) for export commands, template data, and override rules.

## Sources

The `sources` array is the primary way to define your API specs. Each source represents a single spec file and its language targets.

### Source Fields

| Field       | Type   | Required | Description                                                                          |
| ----------- | ------ | -------- | ------------------------------------------------------------------------------------ |
| `title`     | string | Yes      | Display title (shown in docs sidebar)                                                |
| `type`      | string | Yes      | One of: `openapi-spec`, `asyncapi-spec`, `graphql-spec`, `grpc-spec`, `openrpc-spec` |
| `spec`      | string | Yes      | Path or URL to your spec file                                                        |
| `endpoint`  | string | No       | Runtime URL for a `graphql-spec` source                                              |
| `intro`     | string | No       | Path to a Markdown file rendered at the top of the spec section in docs              |
| `websocket` | object | No       | Generated WebSocket behavior. This field is valid only for an `asyncapi-spec` source |
| `languages` | array  | Yes      | Language targets (at least one)                                                      |

### Source Types

| Type            | Description                                         |
| --------------- | --------------------------------------------------- |
| `openapi-spec`  | OpenAPI 3.x specification (REST API)                |
| `asyncapi-spec` | AsyncAPI specification (WebSocket/event-driven API) |
| `graphql-spec`  | GraphQL schema definition                           |
| `grpc-spec`     | Protocol Buffer definition                          |
| `openrpc-spec`  | OpenRPC specification (JSON-RPC API)                |

Local paths for specifications, introductions, templates, output, assets, and Markdown files start from the configuration directory. HTTP and HTTPS specification URLs remain unchanged.

### WebSocket Heartbeat

WebSocket does not define a universal application heartbeat payload. Configure the heartbeat on each `asyncapi-spec` source that requires one.

```yaml
sources:
  - title: 'Realtime API'
    type: asyncapi-spec
    spec: ./specs/asyncapi.yaml
    websocket:
      heartbeat:
        enabled: true
        format: json
        interval_ms: 30000
        timeout_ms: 10000
        client:
          message:
            action: heartbeat
          response:
            action: heartbeat_ack
        server:
          message:
            action: heartbeat_request
          response:
            action: heartbeat_response
    languages:
      - language: typescript
        package_name: '@my-org/sdk'
```

| Field             | Required    | Default      | Description                                                   |
| ----------------- | ----------- | ------------ | ------------------------------------------------------------- |
| `enabled`         | No          | `true`       | Enables both configured heartbeat flows                       |
| `format`          | No          | `json`       | Uses `json` value matching or exact `text` matching           |
| `interval_ms`     | No          | `30000`      | Delay between client heartbeat messages                       |
| `timeout_ms`      | No          | `10000`      | Wait time for activity after a client heartbeat               |
| `client.message`  | No          | None         | Message sent periodically by the generated client             |
| `client.response` | No          | Any activity | Server response that acknowledges the client heartbeat        |
| `server.message`  | No          | None         | Server heartbeat that the generated client consumes           |
| `server.response` | Conditional | None         | Client response. This field is required with `server.message` |

If the heartbeat block is absent, the generated client does not send or answer application heartbeat messages.

For `json`, matching compares decoded values. Object key order and whitespace do not affect the match.

For `text`, all configured message and response values must be non-empty strings. Matching uses the exact text value.

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
| `github_repository` | string | No       | Canonical source repository URL for docs and package metadata                 |
| `template`          | string | No       | Directory with sparse templates for this source and language                  |
| `publish`           | object | No       | Registry and GitHub settings for this package                                 |

A relative `template` path starts from the directory that contains `cortex.config.yml`.
The directory contains the language template files directly. For example, use
`rest/client.ejs`, not `languages/typescript/rest/client.ejs`.

The source template has precedence over `generators.templates`. Cortex uses its built-in
template when neither directory contains the requested file. See
[Custom Generators](/docs/custom-generators) for the directory layout and export command.

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

## Release versions

Do not configure a release version. `cortex publish` reads the current version from each enabled registry and GitHub repository.

The command also reads the Cortex checksum from the latest published package. It calculates a new SHA-256 checksum for each generated package.

If the checksums are equal, Cortex skips the package. If the checksums are different, Cortex increases the semantic version and publishes the package. Thus, an ephemeral CI job does not need a version-state file.

When one destination is behind, Cortex publishes the existing version only to that destination. It does not create an extra version.

## Publishing

The `publish.registries` object contains one default registry definition for each SDK language. The `publish.mcp` object contains the destination settings for the MCP server:

```yaml
publish:
  mcp:
    url: https://registry.npmjs.org
    token_env: MCP_NPM_TOKEN
    access: public
    github:
      token_env: GITHUB_TOKEN
      branch: main
  registries:
    typescript:
      url: https://registry.npmjs.org
      token_env: NPM_TOKEN
      access: public
```

| Field          | Type              | Required                         | Description                                                     |
| -------------- | ----------------- | -------------------------------- | --------------------------------------------------------------- |
| `enabled`      | boolean           | No                               | Set to `false` to disable registry publication for this package |
| `url`          | string            | Depends on language              | Registry, index, remote, or Git repository URL                  |
| `name`         | string            | No                               | Local alias for a Conan registry                                |
| `token_env`    | string            | Yes for authenticated registries | Environment variable that contains the registry token           |
| `username_env` | string            | No                               | Environment variable that contains the registry username        |
| `access`       | string            | No                               | npm visibility: `public` or `restricted`                        |
| `auth`         | boolean           | No                               | Set to `false` only for an anonymous registry                   |
| `github`       | boolean or object | No                               | Enable source publication to `github_repository`                |

The `github` object supports these fields:

| Field          | Type    | Required | Description                                                        |
| -------------- | ------- | -------- | ------------------------------------------------------------------ |
| `enabled`      | boolean | No       | Set to `false` to disable this GitHub destination                  |
| `token_env`    | string  | No       | GitHub token environment variable; default is `GITHUB_TOKEN`       |
| `username_env` | string  | No       | GitHub username environment variable; default is `GITHUB_USERNAME` |
| `auth`         | boolean | No       | Set to `false` only for an anonymous local Git repository          |
| `branch`       | string  | No       | Branch that receives generated source; default is `main`           |

Do not put token values in this file. Read [Publish SDK and MCP packages](/docs/publishing) for all registry and CI instructions.

Registry publication is enabled by default. GitHub publication is disabled until you set `github: true` or add a `github` object.

Set `enabled: false` and enable `github` for GitHub-only publication. Keep registry publication enabled and enable `github` to publish to both destinations.

If you omit `publish.mcp`, the MCP publisher uses `publish.registries.typescript`. Use `publish.mcp` when the MCP package needs separate destination settings.

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

| Field         | Type   | Required | Description                   |
| ------------- | ------ | -------- | ----------------------------- |
| `title`       | string | Yes      | Card title                    |
| `description` | string | Yes      | Card description              |
| `badge`       | string | Yes      | Small uppercase badge label   |
| `href`        | string | Yes      | Link target when clicked      |
| `icon`        | string | No       | Path to the card image or SVG |
| `background`  | string | No       | Deprecated alias for `icon`   |

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
| `github_repository` | string | No       | Canonical source repository URL for docs and package metadata                                    |

Use `publish.mcp` to publish this package to an npm-compatible registry, its GitHub repository, or both. Run `cortex publish --mcp` to publish only the MCP server target.

The generated MCP server automatically includes tools for:

- **REST endpoints** from OpenAPI sources
- **WebSocket channels** from AsyncAPI sources
- **GraphQL operations** from GraphQL sources
- **JSON-RPC methods** from OpenRPC sources
- **Documentation pages** from `docs` sections
- **SDK references** for each configured language/package
- **Specification resources** for OpenAPI, AsyncAPI, GraphQL, Protocol Buffer, and OpenRPC sources

The server includes instructions that tell an agent to read the project guides and prefer a generated SDK when one is available.

Protocol Buffer files are resources. Cortex Docs does not generate callable gRPC MCP tools.

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
