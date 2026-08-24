# Release Cortex Docs

This repository uses an automated promotion and release flow.

## Branch flow

Use this branch sequence for each change:

1. Create a feature branch from `pre-release`.
2. Open a pull request from the feature branch to `pre-release`.
3. Merge the pull request after the required checks pass.
4. Open one promotion pull request from `pre-release` to `main`.
5. Merge the promotion pull request after all checks pass.

The `branch-flow` check rejects other pull requests to `main`.

## Pull request checks

Each pull request to `pre-release` or `main` runs these checks:

- `quality` runs the audit, format check, lint check, build, unit tests, coverage, and package checks.
- `browser` runs the Playwright tests against the local Worker demo.

A promotion pull request to `main` also runs the `integration` check. This check runs all SDK and publishing integration tests in Docker.

## Main branch automation

After a merge to `main`, the `CI` workflow runs again. A successful run starts the deployment and release workflows.

The deployment workflow performs these actions:

1. Build all packages.
2. Make sure that the configured Cloudflare zone is active.
3. Deploy the demo API to `api.demo.cortexdocs.dev`.
4. Build the docs UI with OpenNext.
5. Deploy the docs UI to `demo.cortexdocs.dev`.

The release workflow performs these actions:

1. Read the current CLI version and the latest npm version.
2. Increase the patch number in the `x.x.x` version.
3. Set the same version in all public package manifests.
4. Run `copilot -p` to create the release notes.
5. Update `CHANGELOG.md` with the release notes.
6. Commit the version and changelog changes to `main`.
7. Create the matching `vX.X.X` tag.
8. Publish the five public `@cortex` packages to npm.

The release notes always contain these sections:

- New Features
- Bug Fixes
- Improvements

## Repository configuration

Add these GitHub Actions repository secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ZONE_ID`
- `NPM_TOKEN`
- `PERSONAL_ACCESS_TOKEN`

Create a protected GitHub environment named `npm`. Permit the release workflow to use this environment.

Create `PERSONAL_ACCESS_TOKEN` from a user account that has a Copilot subscription. Give the token the `Copilot Requests` account permission.

The release workflow provides this secret to Copilot CLI as `COPILOT_GITHUB_TOKEN`.

Protect `pre-release` with these required checks:

- `branch-flow`
- `quality`
- `browser`

Protect `main` with these required checks:

- `branch-flow`
- `quality`
- `browser`
- `integration`

Allow the release workflow to push its version commit and tag to `main`.

## Manual validation

Run this command to calculate the next version without file changes:

```bash
node scripts/set-release-version.mjs --check
```

Run this command to build the demo for the Cloudflare runtime:

```bash
npm run --workspace=@cortex-docs/docs-ui demo:build
```

Run this command to preview the Cloudflare build:

```bash
npm run --workspace=@cortex-docs/docs-ui demo:preview
```
