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
