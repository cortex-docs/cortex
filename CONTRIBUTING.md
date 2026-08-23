# Contributing to Cortex Docs

Thank you for improving Cortex Docs.

## Before you start

- Search the [open issues](https://github.com/cortex-docs/cortex/issues).
- Open an issue before a large design or behavior change.
- Do not include secrets, private specifications, or customer data.

## Set up the project

Use Node.js 20 or later and npm 10 or later.

```bash
git clone https://github.com/cortex-docs/cortex.git
cd cortex
npm ci
npm run build
npm test
```

See [DEVELOPMENT.md](DEVELOPMENT.md) for the package layout and integration-test commands.

## Submit a change

1. Create a branch from `main`.
2. Add tests for changed behavior.
3. Update the user documentation when the interface changes.
4. Run the required checks:

```bash
npm run format:check
npm run lint
npm run build
npm test
npm run pack:check
```

5. Open a pull request and complete the checklist.

Use a focused commit message that explains the change. A maintainer can ask you to split an unrelated change into another pull request.

## Report a security problem

Do not open a public issue for a vulnerability. Follow [SECURITY.md](SECURITY.md).

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
