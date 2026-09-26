# Free hosting for open source

We love open source. Your Markdown can serve readers and AI tools from the same repository.

Cortex provides free documentation hosting for public GitHub projects. The local MCP server is also free and needs no cloud process.

## Publish your existing Markdown

You need Node.js 20 or later and write access to the public repository.

Add `cortex.config.yml` to the root of the repository:

```yaml
project: my-open-project
title: My Open Project
docs:
  - section: Getting Started
    sources:
      - title: Introduction
        document: README.md
      - title: Installation
        document: docs/installation.md
```

Commit the configuration to the default branch. Each configured document must exist on that branch.

Sign in with `gh auth login`, or set `GITHUB_TOKEN` for an account with repository write access. Then run:

```bash
npx -y @cortex-docs/cli deploy https://github.com/OWNER/REPO
```

Your site appears at `https://my-open-project.cortexdocs.dev` after the build and upload complete.

From a local checkout, `cortex deploy` also accepts the repository from the Git `origin` remote.

The deployment always uses the default branch. Local changes and changes on other branches do not affect it.

## Choose a project name

The `project` value becomes your subdomain. Use 1–63 lowercase letters, digits, or hyphens. Start and end with a letter or digit.

Names are assigned to repositories. If another repository owns the name, deployment fails with instructions to change `project`.

Some platform names, such as `docs`, `deploy`, and `www`, are reserved.

## Keep the site current

Run the deploy command after you change the documentation. Cortex compares the configuration and its documentation inputs with the current deployment.

If those inputs are unchanged, Cortex skips the build and upload. Changes to unrelated application code do not trigger a new deployment.

Referenced specifications and files in `assets/` also count as documentation inputs. Cloudflare distributes each completed deployment across its edge network.

For automatic deployment, add this GitHub Actions workflow:

```yaml
name: Documentation
on:
  push:
  workflow_dispatch:
permissions:
  contents: write
concurrency:
  group: cortex-docs
  cancel-in-progress: false
jobs:
  deploy:
    if: github.ref_name == github.event.repository.default_branch
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npx -y @cortex-docs/cli deploy "https://github.com/${{ github.repository }}"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

The workflow needs write permission so the hosting service can verify repository ownership. Cortex does not write to the repository.

## Connect an AI client

Use the same public repository for local MCP:

```bash
npx -y @cortex-docs/cli mcp-serve https://github.com/OWNER/REPO
```

For Claude Desktop or Cursor, add this entry to the client configuration:

```json
{
  "mcpServers": {
    "my-open-project": {
      "command": "npx",
      "args": ["-y", "@cortex-docs/cli", "mcp-serve", "https://github.com/OWNER/REPO"]
    }
  }
}
```

The hosted site's MCP page includes setup instructions for more clients.

The process runs while the client is connected. Before each documentation request, it checks the default branch for changes.

Changed documents and configuration are loaded automatically. A failed refresh returns an error so the client does not receive outdated documentation silently.

Public repositories work without authentication within GitHub's anonymous API limits. For regular use, sign in with `gh` or set `GITHUB_TOKEN` in the client environment.

A token with read access is sufficient for MCP. The local server exposes documentation tools and specification resources.

You can still generate and publish an npm MCP package. That option also supports API action tools; see [MCP Servers](/docs/mcp-servers).

## Use a custom domain

Add your domain to the configuration and commit it to the default branch:

```yaml
deploy:
  domain: docs.example.org
```

Run `cortex deploy`. The output includes a CNAME record and a TXT record that proves ownership.

Add both records at your DNS provider. Run the command again and add any certificate validation records shown in the output.

Repeat after DNS propagation until the command reports `active`. An unchanged site skips rebuilding during these checks.

Your `PROJECT.cortexdocs.dev` address remains available. For an apex domain, your DNS provider must support a suitable CNAME or ALIAS configuration.

To remove a custom domain, remove `deploy.domain`, commit the change, and deploy again.

## Hosting limits

Each deployment supports up to 2,000 files and 50 MiB of static output. Each file must be at most 5 MiB.

The repository must be public, with `cortex.config.yml` at its root. Hosted builds use Cortex's built-in templates and local specification references.

Put shared images and styles in `assets/`. Cortex also rewrites relative Markdown links to configured documentation pages.

Cortex builds the static site on your machine or CI runner. It stages the files in R2, then publishes them through Cloudflare Static Assets. It does not run the repository's scripts.

Cloudflare caches the static files at the edge. Hashed browser assets use a one-year TTL. HTML revalidates in browsers so new deployments remain visible.

Documentation visits use direct static delivery without a per-request Worker charge. Custom domains are free for project maintainers.

Free hosting for maintainers still has operating costs. Cortex operates the hosting service separately from the CLI repository.
