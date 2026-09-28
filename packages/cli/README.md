# @cortex-docs/cli

`@cortex-docs/cli` is the command-line interface for Cortex Docs.

Install the CLI:

```bash
npm install --global @cortex-docs/cli
```

Create a project:

```bash
cortex init my-api --open-api ./openapi.yaml
cd my-api
cortex generate
cortex docs serve
```

Build static HTML documentation for deployment:

```bash
cortex docs build --output .cortex/docs
```

Deploy the output directory to a static web host. Configure page URLs such as `/docs/quickstart` to resolve to `/docs/quickstart.html`.
The deployed site needs no Node.js server. Rebuild the site after source changes.

## Public repository hosting

Commit `cortex.config.yml` and your Markdown to the default branch of a public GitHub repository. Then run:

```bash
cortex deploy https://github.com/OWNER/REPO
```

The `project` configuration value becomes `PROJECT.cortexdocs.dev`. Deploy requires `gh auth login` or `GITHUB_TOKEN` with repository write access.

If documentation inputs are unchanged, deployment skips the build and upload. Use `deploy.domain` for a verified custom domain.

## Local repository MCP

```bash
cortex mcp-serve https://github.com/OWNER/REPO
```

This stdio server checks the default branch before each documentation request. Configure your MCP client to run the command as a local process.

The existing `cortex mcp generate` and npm publishing commands remain available.

Read the [hosting guide](https://github.com/cortex-docs/cortex/blob/main/packages/docs-site/docs/open-source-hosting.md) for client setup, automatic deployment, and limits.

Read the [Cortex Docs repository](https://github.com/cortex-docs/cortex) for the complete documentation.
