# Release Cortex Docs

Maintainers use this checklist for an npm release.

## One-time repository setup

1. Create the `cortex-docs/cortex` GitHub repository.
2. Protect `main` and require the `quality` and `browser` checks.
3. Enable private vulnerability reporting.
4. Create an npm organization for the `@cortex` scope.
5. Configure npm trusted publishing for `.github/workflows/release.yml`.
6. Create a protected GitHub environment named `npm`.

## Release steps

1. Move the relevant entries in `CHANGELOG.md` to a version heading.
2. Set the same version in all five public package manifests.
3. Run the release checks:

```bash
npm ci
npm audit --audit-level=high
npm run format:check
npm run lint
npm run build
npm run test:coverage
npm run pack:check
```

4. Merge the release pull request.
5. Create and push a signed tag, such as `v0.1.0`.
6. Check the release workflow and each npm package page.
7. Create GitHub release notes from the changelog entry.

The workflow rejects a tag that does not match every public package version.
