# Documentation

Cortex Docs creates one documentation site from your configured API sources and Markdown pages.

The site can show these sections:

- An interactive OpenAPI reference
- AsyncAPI channels and messages
- GraphQL operations and types
- gRPC services and messages
- OpenRPC methods
- Generated SDK installation and usage
- Generated MCP tools and client setup
- Project Markdown pages

## Preview the site

Run this command in the directory that contains `cortex.config.yml`:

```bash
cortex docs serve
```

The default address is `http://localhost:3012`. Use `--port` to select another port.

The development server watches the configuration, specifications, Markdown files, and custom templates. It regenerates SDK output after a relevant change.

## Create a production build

```bash
cortex docs build --output .cortex/docs
```

This command creates a self-contained Node.js server. The result is not a static HTML export.

Start the result with this command:

```bash
NODE_ENV=production cortex docs start --output .cortex/docs --port 3000
```

Deploy the output directory to a service that can run Node.js. Keep the configuration file and all referenced local files available at their original paths.

## Configure site identity

Site settings are top-level fields in `cortex.config.yml`:

```yaml
project: my-api
title: My API Docs
logo_dark: ./assets/logo-dark.svg
logo_light: ./assets/logo-light.svg
favicon: ./assets/favicon.svg
theme: system
primaryColor: '#2563eb'
```

SVG files are sanitized before Cortex Docs renders them. Scripts, event handlers, and external references are removed.

See [Configuration](/docs/configuration) for home-page cards and Markdown navigation.

## Try API requests

The OpenAPI reference includes a request builder. File inputs are available for `multipart/form-data` and raw binary request bodies.

The browser sends multipart boundaries. Do not set a multipart boundary in your specification or custom request code.

Only enable interactive requests for API origins that allow requests from the documentation site's origin.
