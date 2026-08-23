# Custom Generators

Cortex uses [Eta](https://eta.js.org/) templates to generate SDKs, examples, and MCP servers. You can replace any existing template.

Use sparse overrides. Add only the templates that you want to change. Cortex uses its built-in template when an override is absent.

The export command copies templates from your installed Cortex version. Use these files as the source for your custom templates.

## Configure a Source Template Directory

Set `template` on a language entry when one source needs custom templates:

```yaml
sources:
  - title: REST API V1
    type: openapi-spec
    spec: ./specs/petstore.yaml
    intro: ./docs/REST_INTRO.md
    languages:
      - language: typescript
        package_name: '@petstore/typescript-client-sdk'
        github_repository: github.com/petstore/typescript-client-sdk
        template: ./cortex-templates/custom_template
```

A relative path starts from the directory that contains `cortex.config.yml`.
The directory contains the language templates directly:

```text
cortex-templates/custom_template/
├── rest/
│   ├── client.ejs
│   └── snippet.ejs
├── readme.ejs
└── files/
    └── package.json.ejs
```

Add only the files that you want to change. You can set a different `template` path for
each source and language.

## Configure a Shared Template Root

Use `generators.templates` for templates that apply to all sources:

```yaml
generators:
  templates: ./cortex-templates
```

A relative path starts from the directory that contains `cortex.config.yml`. You can also use an absolute path.

The root directory must exist during generation. Cortex stops generation if it cannot find the directory.

The export command creates the root directory when it does not exist.

## Export Installed Templates

Export all templates for one SDK language:

```bash
cortex generators export --language typescript
```

If the selected source language has a `template` path, the command copies the files
directly into that directory. If more than one source has a path, the command copies the
files into each directory.

If no source path exists, the command uses `generators.templates`. It preserves the
shared-root paths below that directory.

Export a different language by changing the language name:

```bash
cortex generators export --language python
cortex generators export --language go
cortex generators export --language csharp
```

Export only one protocol for a language:

```bash
cortex generators export --language typescript --protocol rest
cortex generators export --language typescript --protocol graphql
```

The protocol can be `rest`, `graphql`, `websocket`, `grpc`, or `openrpc`.

Export the MCP server templates:

```bash
cortex generators export --mcp
```

Export all language and MCP templates:

```bash
cortex generators export --all
```

MCP and `--all` exports require `generators.templates` or `--output`.

Use an explicit shared root to ignore configured source paths:

```bash
cortex generators export --language typescript --output ./cortex-templates
```

The command keeps existing files by default. It reports each file that it skips.

CAUTION: `--force` replaces existing templates in the selected export scope. Copy important changes before you use this option.

```bash
cortex generators export --language typescript --force
```

The command does not remove extra files from the template root.

| Option                  | Description                                                     |
| ----------------------- | --------------------------------------------------------------- |
| `--language <language>` | Export all built-in templates for one SDK language              |
| `--protocol <protocol>` | Export one protocol for the selected language                   |
| `--mcp`                 | Export MCP server templates                                     |
| `--all`                 | Export all SDK and MCP templates                                |
| `--output <directory>`  | Export to this shared template root instead of configured paths |
| `--config <path>`       | Read a specified Cortex configuration file                      |
| `--force`               | Replace existing templates in the selected export scope         |

## Directory Layout

A source-language `template` directory starts at the language level. It does not contain
the `languages/<language>` prefix:

```text
custom_template/
├── rest/
├── graphql/
├── websocket/
├── grpc/
├── openrpc/
├── readme.ejs
└── files/
```

A shared `generators.templates` root contains language and MCP directories.

```text
cortex-templates/
├── languages/
│   └── typescript/
│       ├── rest/
│       │   ├── client.ejs
│       │   └── snippet.ejs
│       ├── graphql/
│       │   └── client.ejs
│       ├── websocket/
│       │   └── client.ejs
│       ├── grpc/
│       │   └── client.ejs
│       ├── openrpc/
│       │   └── client.ejs
│       ├── readme.ejs
│       └── files/
│           ├── package.json.ejs
│           └── src/client.ts.ejs
└── mcp/
    ├── server.ejs
    ├── handlers.ejs
    ├── main-stdio.ejs
    ├── main-sse.ejs
    ├── package-json.ejs
    ├── tsconfig-json.ejs
    ├── readme.ejs (optional custom template)
    └── files/
        ├── package.json.ejs
        └── src/server.ts.ejs
```

The language name must match a configured language. Supported names include `typescript`, `python`, `go`, `java`, and all other Cortex languages.

You can override every built-in `.ejs` file at its relative path. This includes client, type, partial, example, snippet, package, and README templates.

Cortex selects a template in this order:

1. The `template` directory on the matching source-language entry.
2. The matching language directory below `generators.templates`.
3. The built-in template.

## Override an SDK Template

First, export the installed templates for the language:

```bash
cortex generators export --language typescript
```

Then edit the template at its exported path. With a source path, this file controls the
TypeScript REST client:

```text
cortex-templates/custom_template/rest/client.ejs
```

With a shared root, use this path:

```text
cortex-templates/languages/typescript/rest/client.ejs
```

Eta exposes template data through `it`:

```ejs
// Generated for <%= it.spec.info.title %>
// Package: <%= it.config.languageConfig.package_name %>

export class <%= it.clientClass %>Client {
  constructor(readonly baseUrl = '<%= it.spec.info.servers[0]?.url ?? "" %>') {}
}
```

Run generation after you save the template:

```bash
cortex generate
```

`cortex docs serve` watches shared and source-language template directories. It
regenerates SDKs and refreshes the documentation after a template change.

## Override Code Snippets

Snippet templates use the protocol name and `snippet.ejs`:

```text
languages/typescript/rest/snippet.ejs
languages/typescript/graphql/snippet.ejs
languages/typescript/websocket/snippet.ejs
languages/typescript/grpc/snippet.ejs
languages/typescript/openrpc/snippet.ejs
```

Remove `languages/typescript/` from these paths when you use a source-language
`template` directory.

For example, create `languages/typescript/rest/snippet.ejs`:

```ejs
const result = await client.<%= it.resource.name %>.<%= it.op.name %>();
console.log(result);
```

Custom snippets appear in the documentation site. They also appear in generated SDK README files when those files include snippet partials.

## Override Generated Files

Some files do not come from a named template. Examples include metadata files, project files, and copied Protocol Buffer files.

Use a final-file template to replace one of these files:

```text
languages/typescript/files/package.json.ejs
languages/typescript/files/.cortex-package.json.ejs
languages/typescript/files/src/grpc/service.proto.ejs
mcp/files/README.md.ejs
mcp/files/.cortex-package.json.ejs
```

Remove `languages/typescript/` from a language path when you use a source-language
`template` directory.

The path after `files/` must match an existing generated output path. A final-file template cannot create a new output file.

The export command does not create final-file templates. Create these templates only for programmatic outputs that you want to replace.

Final-file templates receive the normal generator data. They also receive these fields:

| Field               | Description                                                                     |
| ------------------- | ------------------------------------------------------------------------------- |
| `it.generator`      | Generator name: `language`, `websocket`, `graphql`, `grpc`, `openrpc`, or `mcp` |
| `it.file.path`      | Generated output path                                                           |
| `it.file.content`   | Content before the final override                                               |
| `it.file.overwrite` | Existing overwrite setting                                                      |

This example adds an extra field to a generated JSON file:

```ejs
<%
const manifest = JSON.parse(it.file.content);
manifest.private = true;
%><%= JSON.stringify(manifest, null, 2) %>
```

The final-file template has the highest precedence. Cortex applies it after the normal generator creates the file content.

## Override MCP Templates

MCP templates use the `mcp` directory. These named templates are available:

Export the installed MCP templates before you edit them:

```bash
cortex generators export --mcp
```

| Template            | Output                                               |
| ------------------- | ---------------------------------------------------- |
| `package-json.ejs`  | `package.json`                                       |
| `tsconfig-json.ejs` | `tsconfig.json`                                      |
| `server.ejs`        | `src/server.ts`                                      |
| `handlers.ejs`      | `src/handlers.ts`                                    |
| `main-stdio.ejs`    | `src/main.ts` for stdio                              |
| `main-sse.ejs`      | `src/main.ts` for SSE                                |
| `readme.ejs`        | `README.md` (optional custom template; not exported) |

Run either command to apply MCP overrides:

```bash
cortex generate
cortex mcp generate
```

## Template Data

Language templates receive the parsed specification, configuration, naming functions, and protocol data. Common fields include:

| Field            | Description                                              |
| ---------------- | -------------------------------------------------------- |
| `it.spec`        | Parsed OpenAPI, AsyncAPI, GraphQL, gRPC, or OpenRPC data |
| `it.config`      | Generation context and Cortex configuration              |
| `it.packageName` | Package name in protocol and MCP templates               |
| `it.version`     | Current generated package version                        |
| `it.clientClass` | Client class name                                        |
| `it.resources`   | REST resources                                           |
| `it.schemas`     | Generated schema data                                    |
| `it.naming`      | Naming functions for the selected language               |
| `it.utils`       | Shared case conversion and type helpers                  |

Protocol templates also receive their protocol collections. Examples include `it.channels`, `it.operations`, `it.services`, and `it.methods`.

MCP templates receive `it.tools`, `it.toolInfos`, `it.transport`, `it.specs`, and package metadata.

Start with the exported built-in template. Keep its data accesses when you need the same behavior.

## Include Partials

Use Eta's `include` function to compose templates:

```ejs
<%~ include("rest/init", it) %>
```

Cortex looks for the partial in the source-language directory first. It then checks the
shared root and the built-in templates.

This fallback lets you replace a small partial without copying its parent template.

## Error Handling

Cortex reports the full custom template path when rendering fails. Fix the Eta syntax or a missing data field, then run generation again.

Templates can execute JavaScript during generation. Use templates only from sources that you trust.
