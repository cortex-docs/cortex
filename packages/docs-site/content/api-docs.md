---
title: Documentation
description: Generate and serve interactive documentation for REST, WebSockets, and MCP.
order: 5
---

# Documentation

Cortex generates interactive documentation covering your entire API surface — REST endpoints, WebSocket channels, and MCP tools — all in one unified viewer.

## Serve Locally

```bash
cortex docs serve
```

This starts a local server on `http://localhost:3100` with three sections:

- **API Reference** — Interactive REST endpoint documentation with request builder and client library examples
- **WebSockets** — AsyncAPI channel viewer with subscribe/publish indicators and message schemas
- **MCP** — Complete tool listing for AI agents, showing parameters, types, and a ready-to-paste config snippet

## Build Static Docs

```bash
cortex docs build --output ./docs
```

Produces a static HTML site you can deploy to any hosting provider.

## Configuration

```yaml
docs:
  title: my-project Documentation
  logo: ./assets/logo.svg
  favicon: ./assets/favicon.ico
  theme: system    # "light", "dark", or "system"
  output_dir: ./docs
```

## Features

### Theme Support

Documentation automatically adapts to the user's system preference (light or dark). A manual toggle is available in the header.

### Navigation

The header provides tabs to switch between REST, WebSockets, and MCP documentation. Each section is self-contained with its own navigation and filtering.

### MCP Integration View

The MCP tab shows all tools that would be available to AI agents, including both REST and WebSocket tools. It includes a usage snippet for connecting the MCP server to Claude Code, Cursor, or any MCP client.

### Try It

The REST reference includes a built-in request builder that lets users test API calls directly from the documentation.
