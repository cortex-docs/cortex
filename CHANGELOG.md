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

## [0.1.28] - 2026-08-31

### New Features

- None.

### Bug Fixes

- Disabled analytics and cookie controls unless the current hostname is explicitly listed in `enabled_hosts`, instead of enabling tracking by default when the list was empty.

### Improvements

- Simplified the README header presentation.

## [0.1.27] - 2026-08-31

### New Features

- None.

### Bug Fixes

- None.

### Improvements

- Added a visual product overview, a 60-second tour, a workflow comparison, and clearer project links to the README.
- Added automatic GitHub Releases with notes from the generated changelog.

## [0.1.26] - 2026-08-28

### New Features

- None.

### Bug Fixes

- None.

### Improvements

- None.

## [0.1.25] - 2026-08-27

### New Features

- None.

### Bug Fixes

- None.

### Improvements

- Added a link to the official Cortex Docs website in the README.

## [0.1.24] - 2026-08-27

### New Features

- Added consent-aware Google Analytics 4 integration, configurable via a new `analytics` site config option (`google_analytics_id`, `enabled_hosts`, `privacy_url`), including a cookie consent banner with a link to your privacy policy and no advertising signals collected.

### Bug Fixes

- None.

### Improvements

- Documentation updated to explain how to configure Google Analytics through the new `analytics` config instead of manually embedding tracking scripts via `custom_head_html`.

## [0.1.23] - 2026-08-27

### New Features

- The "Built with Cortex" badge now records each unique website hostname that loads it, so you can see which sites are displaying your badge.

### Bug Fixes

- None.

### Improvements

- None.

## [0.1.22] - 2026-08-27

### New Features

- None.

### Bug Fixes

- None.

### Improvements

- None.

## [0.1.21] - 2026-08-27

### New Features

- None.

### Bug Fixes

- None.

### Improvements

- None.

## [0.1.20] - 2026-08-26

### New Features

- Added a `try_now_url` source option for gRPC and OpenRPC specs, enabling the "Try now" panel to stream live, real-time responses (e.g. server-streaming/watch operations) through a browser-compatible HTTP bridge.

### Bug Fixes

- Fixed search results navigating to the wrong page; selecting a REST, GraphQL, WebSocket, or OpenRPC result (including from recent searches) now opens its canonical API reference route.
- Fixed streaming responses in the "Try now" panel being logged as garbled or incomplete lines when chunks split mid-line; output is now buffered and displayed as complete lines.
- Fixed WebSocket connections dropping the `graphql-transport-ws` subprotocol negotiation, which could break interactive GraphQL subscription testing.

### Improvements

- None.

## [0.1.19] - 2026-08-26

### New Features

- None.

### Bug Fixes

- None.

### Improvements

- None.

## [0.1.18] - 2026-08-26

### New Features

- None.

### Bug Fixes

- Fixed the demo API worker preview so it serves the branding logo asset locally instead of returning a missing-file error.
- Fixed the local dev watcher so changes inside the docs UI and docs site no longer trigger unnecessary rebuilds of unrelated packages.

### Improvements

- The docs site and demo site are now deployed as static Cloudflare assets instead of Workers, so pages load without invoking a Worker script and no longer count against the Workers daily request allowance.

## [0.1.17] - 2026-08-26

### New Features

- None.

### Bug Fixes

- Fixed the packaged CLI's `docs dev`/`serve` runtime sync so files and directories in the docs-ui runtime are properly copied and stale entries removed, instead of relying on broken symlinks.
- Fixed the CLI's Next.js config so the `@cortex-docs/docs-ui` package transpilation and module alias are always applied, preventing build/runtime failures in the packaged CLI.
- Fixed `docs serve` to run Next.js dev with the webpack bundler explicitly, avoiding dev-server errors in the packaged CLI.

### Improvements

- API reference sidebars (navigation and code snippets) now automatically show or collapse based on available screen width, instead of only reacting to fixed breakpoints, improving usability on narrower windows.

## [0.1.16] - 2026-08-25

### New Features

- None.

### Bug Fixes

- Fixed the demo docs Cloudflare Worker deployment by removing a CPU time limit setting that is unsupported on the Cloudflare Workers Free plan, which was blocking deployment.

### Improvements

- None.

## [0.1.15] - 2026-08-25

### New Features

- None.

### Bug Fixes

- Fixed the demo docs Cloudflare Worker deployment to work on the Cloudflare Workers Free plan.

### Improvements

- None.

## [0.1.14] - 2026-08-25

### New Features

- The CLI now supports `--version`/`-V` to print the installed Cortex Docs version.

### Bug Fixes

- Fixed the published CLI package so it installs with all required runtime dependencies and runs correctly (the previous release was not runnable after install).
- Fixed a hydration warning triggered by custom `<head>` HTML injected via site configuration.

### Improvements

- Docs and SDK pages are now pre-rendered at build time instead of forced dynamic rendering, improving page load performance.
- Increased the Cloudflare Worker CPU time limit to prevent timeouts on larger documentation builds.
- Enabled cache interception with a static-assets incremental cache for faster repeat responses on the deployed docs site.

## [0.1.13] - 2026-08-25

### New Features

- Documentation pages now support an `appearance` query parameter (`?appearance=dark` or `?appearance=light`) to set the initial theme for that page, taking priority over the project theme and the visitor's stored preference.

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
