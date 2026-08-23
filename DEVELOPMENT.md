# Development Guide

This document explains how to contribute to Cortex Docs.

## Prerequisites

- **Node.js** >= 20.0.0
- **npm** >= 10.0.0
- **Git**

For E2E tests:

- **Playwright** Chromium browser

## Setup

```bash
# Clone the repo
git clone https://github.com/cortex-docs/cortex.git
cd cortex

# Install all dependencies (workspaces handled automatically)
npm install

# Build all packages in dependency order
npm run build

# Run unit tests
npm run test

# Run E2E tests (installs Playwright browsers on first run)
npx playwright install chromium
npm run test:e2e
```

## Project Structure

```
cortex/
  package.json              Root workspace config + shared scripts
  turbo.json                Turborepo build pipeline
  tsconfig.base.json        Shared TypeScript config
  playwright.config.ts      E2E test configuration
  e2e/                      Playwright E2E tests

  packages/
    core/                   @cortex/core
    codegen/                @cortex/codegen
    cli/                    @cortex/cli
    mcp-gen/                @cortex/mcp-gen
    docs-ui/                @cortex/docs-ui
    docs-site/              @cortex/docs-site
```

### Package Dependency Graph

```
core
  +---> codegen
  +---> mcp-gen

core + codegen + mcp-gen
  +---> docs-ui

core + codegen + mcp-gen + docs-ui
  +---> cli
          +---> docs-site
```

Build order is enforced by Turborepo — `npm run build` handles it automatically.

### Package Overview

| Package             | Purpose                                           | Tech                                                   |
| ------------------- | ------------------------------------------------- | ------------------------------------------------------ |
| `@cortex/core`      | OpenAPI parsing, config loading, naming utilities | `@apidevtools/swagger-parser`, `zod`, `js-yaml`        |
| `@cortex/codegen`   | SDK code generation engine with language plugins  | Programmatic string templates                          |
| `@cortex/cli`       | Command-line interface                            | `nest-commander` (NestJS)                              |
| `@cortex/mcp-gen`   | MCP server code generation                        | Programmatic templates                                 |
| `@cortex/docs-ui`   | API reference documentation viewer                | Next.js 16, `@scalar/api-reference-react`, Tailwind v4 |
| `@cortex/docs-site` | Cortex Docs product documentation configuration   | Markdown and the Cortex Docs CLI                       |

## Development Workflow

### Docs UI Development Server

`npm run --workspace=@cortex/docs-ui dev` runs a full pre-production simulation of `cortex docs serve`. It mirrors the end-user experience (init, generate, serve) so you can develop and test the documentation UI against realistic conditions.

**What it does on startup:**

1. **Builds library packages** if the CLI hasn't been compiled yet (`npm run build`).
2. **Initializes `test-project/`** at the workspace root (if no `cortex.config.yml` exists there). This copies the fixture specs from `packages/core/__fixtures__/` and generates a config.
3. **Runs `cortex generate`** against the test project to produce SDKs in `test-project/generated/`.
4. **Starts the mock server** (`e2e/docker/mock-server.js`) — REST on `:4010`, GraphQL on `:4010/graphql`, WebSocket on `:4010/ws`, gRPC on `:50051`.
5. **Starts the Next.js dev server** on `:3012` with all `CORTEX_*` environment variables pointing to `test-project/` specs.

**File watching:**

- **`test-project/` changes** (specs, config) — re-runs `cortex generate` automatically. Next.js picks up updated specs on the next request since API routes read them on each call.
- **`packages/*/src/` changes** (excluding `dist`, `docs-ui`, `docs-site`) — rebuilds library packages via Turbo and re-runs generate so the docs UI reflects template or parser changes.
- **`packages/docs-ui/` changes** — handled by Next.js HMR (hot module replacement) natively.

**Environment variables (override defaults):**

| Variable    | Default | Description                      |
| ----------- | ------- | -------------------------------- |
| `PORT`      | `3012`  | Next.js dev server port          |
| `MOCK_PORT` | `4010`  | Mock HTTP/WS/GraphQL server port |
| `GRPC_PORT` | `50051` | Mock gRPC server port            |

**The docs UI relies exclusively on `test-project/` for all spec data** — it does not fall back to `packages/core/__fixtures__/`. This ensures you're always testing the same flow an end user would see with `cortex docs serve`.

To reset the test project, delete `test-project/` and re-run the dev command:

```bash
rm -rf test-project
npm run --workspace=@cortex/docs-ui dev
```

To run only the Next.js server without the orchestration (e.g., if you already have the mock server running):

```bash
npm run --workspace=@cortex/docs-ui dev:next
```

### Building

```bash
# Build everything
npm run build

# Build a single package
npx tsc -p packages/core/tsconfig.json

# Clean all build artifacts
npm run clean
```

### Testing

```bash
# Run all unit tests
npm run test

# Run tests for a single package
cd packages/core && npx vitest run
cd packages/codegen && npx vitest run
cd packages/mcp-gen && npx vitest run

# Run E2E tests (starts docs-ui dev server automatically)
npm run test:e2e

# Run E2E tests with UI mode
npx playwright test --ui

# Run a specific E2E test
npx playwright test e2e/docs-ui.spec.ts
```

### SDK Integration Tests (Docker)

The SDK integration tests generate real SDKs for all supported languages, then run each against a mock server that implements REST, GraphQL, WebSocket, and gRPC protocols.

**Prerequisites:** Docker and Docker Compose.

```bash
# Run all language SDK tests
npm run test:sdk

# Run tests for specific languages only (much faster for iteration)
TEST_LANGUAGES=typescript,java npm run test:sdk
TEST_LANGUAGES=kotlin npm run test:sdk
```

Supported language values: `typescript`, `python`, `go`, `java`, `kotlin`, `ruby`, `php`, `csharp`, `rust`, `cpp`, `c`, `mcp`.

When `TEST_LANGUAGES` is not set, all languages and the MCP server test run. When set, only the listed languages run. MCP runs by default unless you explicitly filter — include `mcp` in the list to keep it, or omit it to skip.

The test pipeline:

1. Builds the base Docker image (`Dockerfile` in project root) with all language runtimes (Node, Python, Go, Java, Ruby, PHP, .NET, Rust, C/C++)
2. Builds the test image (`e2e/docker/Dockerfile`) which extends the base, copies the project, and builds the TypeScript packages
3. Runs `cortex init` to generate SDKs from the fixture specs in `packages/core/__fixtures__/`
4. Starts a mock server (`e2e/docker/mock-server.js`) serving REST, GraphQL subscriptions, WebSocket, and gRPC-over-HTTP
5. Runs each language's test suite against the mock server
6. Reports pass/fail per language

Test files live in `e2e/docker/tests/test-<language>/`. The mock server and test orchestrator are in `e2e/docker/`.

### Formatting

```bash
npm run format
```

We use Prettier with single quotes, trailing commas, 100-char line width (see `.prettierrc`).

## Adding a New Language Plugin

Each language plugin lives in `packages/codegen/src/languages/<language>/index.ts` and implements the `LanguagePlugin` interface.

### Steps

1. **Create the plugin file:**

   ```
   packages/codegen/src/languages/<language>/index.ts
   ```

2. **Implement `LanguagePlugin`:**

   ```typescript
   import type { LanguagePlugin, CodegenContext, GeneratedFile } from '../../plugin';

   export class MyLanguagePlugin implements LanguagePlugin {
     readonly language = 'mylang';
     readonly displayName = 'MyLanguage';
     readonly fileExtension = '.ml';

     async generate(context: CodegenContext): Promise<GeneratedFile[]> {
       // Return an array of files to write
     }
   }
   ```

   The `context` object provides:
   - `context.spec` — Parsed OpenAPI spec (resources, operations, schemas)
   - `context.config` — Full Cortex config
   - `context.languageConfig` — Language-specific config (package name, output dir)
   - `context.naming` — Naming conventions for the language (camelCase, snake_case, etc.)

3. **Register in `packages/codegen/src/index.ts`:**

   ```typescript
   import { MyLanguagePlugin } from './languages/mylang/index';
   // ...
   registry.register(new MyLanguagePlugin());
   ```

4. **Add naming conventions in `packages/codegen/src/naming.ts`** if needed.

5. **Add the language to the Zod schema** in `packages/core/src/config/schema.ts`.

6. **Write tests** in `packages/codegen/__tests__/`.

### What a Plugin Generates

Each plugin should generate a complete, standalone SDK project:

- **Package manifest** (package.json, setup.py, go.mod, pom.xml, etc.)
- **Client class** with base URL, auth, and a generic request method
- **Resource classes** with typed methods for each API operation
- **Type definitions** from OpenAPI schemas
- **Entry point / index** re-exporting public API

### Naming Conventions

Follow each language's idiomatic conventions. The `context.naming` object provides converters:

- `className(name)` — For classes/interfaces (usually PascalCase)
- `methodName(name)` — For methods (camelCase or snake_case)
- `propertyName(name)` — For fields/properties
- `fileName(name)` — For file names (kebab-case, snake_case, or PascalCase)

## Modifying the CLI

CLI commands live in `packages/cli/src/commands/`. Each command is a NestJS Commander class:

```typescript
@Command({
  name: 'mycommand',
  description: 'Does something useful',
})
export class MyCommand extends CommandRunner {
  constructor(
    private readonly logger: LoggerService,
    private readonly project: ProjectService,
  ) {
    super();
  }

  async run(params: string[], options: { flag?: string }): Promise<void> {
    // Implementation
  }

  @Option({ flags: '-f, --flag <value>', description: 'A flag' })
  parseFlag(val: string): string {
    return val;
  }
}
```

Register new commands in `packages/cli/src/app.module.ts`.

## Modifying the Docs UI

The docs UI is a Next.js 16 app using:

- **Scalar API Reference** for rendering the OpenAPI spec
- **Geist Sans + Geist Mono** fonts
- **Tailwind CSS v4** with oklch color tokens
- **next-themes** for system-based dark/light mode

The spec is served via the `/api/spec` route, which reads the file path from the `CORTEX_SPEC_PATH` environment variable.

## Docs Site Development Server

```bash
npm run --workspace=@cortex/docs-site dev
```

Starts the product documentation site locally on `:3200` with hot reload. Edit a Markdown file in `packages/docs-site/docs/` to update a page.

## Modifying the Docs Site

The product site reads Markdown files from `packages/docs-site/docs/`. Add each page to the `docs` array in `packages/docs-site/cortex.config.yml`.

The array order controls the sidebar order. Each entry supplies the page title and Markdown path.

## Commit Guidelines

- Write clear, concise commit messages
- One logical change per commit
- Run `npm run test` before pushing
- Run `npm run format` to ensure consistent style

## Reporting Issues

Open an issue with:

- Steps to reproduce
- Expected behavior
- Actual behavior
- Your OpenAPI, Websockets (AsyncAPI), GraphQL or gRPC spec (or a minimal reproduction) if relevant
- Node.js and npm versions (`node -v`, `npm -v`)
