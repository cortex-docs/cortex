# Changelog

This file records notable changes to Cortex Docs.

The project follows [Semantic Versioning](https://semver.org/). Release entries use the format from [Keep a Changelog](https://keepachangelog.com/).

## Unreleased

### Added

- Public npm packages for the CLI, parsers, generators, and documentation runtime
- SDK generation for 11 languages
- OpenAPI, AsyncAPI, GraphQL, Protocol Buffer, and OpenRPC sources
- Interactive documentation and production Node.js documentation builds
- Generated MCP tools for REST, WebSocket metadata, GraphQL, and OpenRPC
- MCP resources for all configured specification files, including Protocol Buffer files
- Package publishing and GitHub source publishing

### Security

- Sanitize configured SVG assets before rendering them
- Ship generated MCP servers with local copies of their specification resources
