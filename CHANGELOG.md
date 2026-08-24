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
