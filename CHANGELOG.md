# Changelog

This file records notable changes to Cortex Docs.

The project uses Semantic Versioning. Each release contains the same three change sections.

## Unreleased

### New Features

- None.

### Bug Fixes

- None.

### Improvements

- None.

## [0.1.12] - 2026-08-25

### New Features

- Added `custom_head_html` configuration option to inject trusted HTML (metadata, stylesheets, analytics scripts) into the `<head>` of every documentation page.

### Bug Fixes

- Fixed the generated PHP GraphQL client to properly reconnect after receiving WebSocket close frames instead of treating them as regular messages.

### Improvements

- None.

## [0.1.11] - 2026-08-25

### New Features

- None.

### Bug Fixes

- None.

### Improvements

- Clarified documentation to describe the generated MCP server (rather than MCP tools) for REST, GraphQL, OpenRPC, and WebSocket payload preparation.
- Clarified that generated packages and the MCP server can be published to language registries and GitHub repositories.

## [0.1.10] - 2026-08-25

### New Features

- None.

### Bug Fixes

- Fixed `cortex docs serve` not picking up changes to docs UI source files (app, components, hooks, lib, public) during local preview, requiring a manual restart.

### Improvements

- Renamed the "Built by Cortex" footer badge to "Built with Cortex," with updated branding, sizing, and asset URLs (`/images/built-with-cortex.svg`), plus backward-compatible redirects from the old badge URLs.
- Expanded the Getting Started guide with a features overview, a supported API sources table, a link to the live demo, guidance on adding custom Markdown docs, and instructions for generating the MCP server standalone.

## [0.1.9] - 2026-08-25

### New Features

- None.

### Bug Fixes

- None.

### Improvements

- Redesigned the "Built by Cortex" footer badge into a themed card with a new transparent, dark-mode-aware logo.
- The Cortex logo is now served from a dedicated static asset host (`static.cortexdocs.dev`), with the previous asset URL permanently redirecting to it for backward compatibility.

## [0.1.8] - 2026-08-25

### New Features

- None.

### Bug Fixes

- Fixed a race condition in generated Ruby WebSocket clients where the reader thread could fire an open or close event before callbacks were registered, causing missed connection events.

### Improvements

- None.

## [0.1.7] - 2026-08-24

### New Features

- None.

### Bug Fixes

- None.

### Improvements

- None.

## [0.1.6] - 2026-08-24

### New Features

- Published `@cortex-docs/mcp`, an MCP server that exposes the Cortex Docs product documentation.
- Deployed the Cortex Docs product documentation site at https://docs.cortexdocs.dev.

### Bug Fixes

- None.

### Improvements

- Added a "Live sites" section to the README linking to both the documentation site and the demo.
- Documented the full release flow, including MCP package generation/publishing and product docs deployment, in RELEASING.md and CONTRIBUTING.md.

## [0.1.5] - 2026-08-24

### New Features

- The "Built by Cortex" badge on docs pages is now served as an image from a Cloudflare-hosted endpoint instead of inline markup.

### Bug Fixes

- None.

### Improvements

- None.

## [0.1.4] - 2026-08-24

### New Features

- None.

### Bug Fixes

- None.

### Improvements

- Added a live demo link to the README so users can try Cortex Docs online.

## [0.1.3] - 2026-08-24

### New Features

- None.

### Bug Fixes

- None.

### Improvements

- None.

## [0.1.2] - 2026-08-24

### New Features

- Added a "Try now" button to the mobile SDK reference code panel for quickly opening the interactive request tester.

### Bug Fixes

- Fixed the docs dev script not waiting for the demo API worker to become healthy before starting, which could cause flaky local development and demo failures.
- Fixed SVG logo sanitization stripping text elements and their typography (font family, size, weight, decoration, anchor), so text-based logos now render correctly.
- Fixed the demo API worker's GraphQL module resolution via an explicit `graphql` alias in the Wrangler config.
- Packages are now published under the `@cortex-docs` npm scope instead of `@cortex`; update install commands (e.g. `npm install --global @cortex-docs/cli`) accordingly.

### Improvements

- The mobile SDK code panel now truncates long labels and keeps the expand toggle icon from shrinking, improving layout on small screens.

## [0.1.1] - 2026-08-24

### New Features

- Added support for generating MCP servers from OpenRPC specifications, including a new Eta-based template renderer for MCP tool handlers.
- Added automatic OpenAPI server URL resolution so generated SDKs can determine the correct base URL from the spec.
- Added comprehensive documentation covering quickstart, configuration, OpenAPI/GraphQL/OpenRPC/WebSocket SDK generation, MCP servers, and publishing SDKs to package registries.

### Bug Fixes

- Fixed generated SDK identifiers colliding with reserved language keywords by hardening the naming utilities.
- Fixed incomplete OpenAPI validation and error handling in the OpenAPI parser.
- Fixed the "Try Now" modal not surfacing API request errors correctly.
- Fixed generated SDK handlers not normalizing the API base URL, which could produce malformed requests.

### Improvements

- Broadened OpenRPC version validation to accept a wider range of spec versions.
- Improved gRPC and WebSocket handling in generated SDK snippets and reference docs.
