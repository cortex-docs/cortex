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

Read the [Cortex Docs repository](https://github.com/cortex-docs/cortex) for the complete documentation.
