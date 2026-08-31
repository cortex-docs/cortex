# Contributing to Cortex Docs

Thank you for improving Cortex Docs.

## Before you start

- Search the [open issues](https://github.com/cortex-docs/cortex/issues).
- Open an issue before a large design or behavior change.
- Do not include secrets, private specifications, or customer data.

## Set up the project

Use Node.js 22 and npm 10 or later.

```bash
git clone https://github.com/cortex-docs/cortex.git
cd cortex
npm ci
npm run build
npm test
```

See [DEVELOPMENT.md](DEVELOPMENT.md) for the package layout and integration-test commands.

## Submit a change

1. Update your local `pre-release` branch.
2. Create a feature branch from `pre-release`.
3. Add tests for changed behavior.
4. Update the user documentation for interface changes.
5. Run the required checks:

```bash
npm run format:check
npm run lint
npm run build
npm test
npm run pack:check
```

6. Open a pull request to `pre-release`.
7. Complete the pull request checklist.

Do not open a feature pull request to `main`. Maintainers promote `pre-release` to `main` after the required checks pass.

The promotion pull request runs all Docker integration tests. A merge to `main` publishes a new patch version.

The release publishes `@cortex-docs/cli` and the generated `@cortex-docs/mcp` package. It deploys `docs.cortexdocs.dev` and creates a GitHub Release.

The release does not publish the other workspaces. The CLI package includes the internal workspaces that it uses.

Read [RELEASING.md](RELEASING.md) for the complete promotion and release flow.

Use a focused commit message that explains the change. A maintainer can request separate pull requests for unrelated changes.

## Report a security problem

Do not open a public issue for a vulnerability. Follow [SECURITY.md](SECURITY.md).

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
