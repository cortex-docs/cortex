# Publish SDK and MCP packages

`cortex publish` builds each generated SDK and the generated MCP server. It can publish each target to a package registry, a GitHub repository, or both destinations.

Cortex supports all generated SDK languages:

| SDK language | Package system | Registry destination           |
| ------------ | -------------- | ------------------------------ |
| TypeScript   | npm            | npm-compatible registry        |
| Python       | PyPI           | PyPI-compatible index          |
| Go           | Go modules     | Git repository and version tag |
| Java         | Maven          | Maven-compatible repository    |
| Kotlin       | Maven          | Maven-compatible repository    |
| Ruby         | RubyGems       | RubyGems-compatible server     |
| PHP          | Composer       | Git repository and version tag |
| C#           | NuGet          | NuGet-compatible feed          |
| Rust         | Cargo          | Cargo registry                 |
| C++          | Conan          | Conan remote                   |
| C            | Conan          | Conan remote                   |

The generated MCP server is a separate publish target. Its registry destination is an npm-compatible registry.

Any SDK or MCP target can also publish its generated source to GitHub. Cortex commits the source and creates a `v<version>` tag.

## Configure package publishing

Add registry configuration under `publish.registries`:

```yaml
publish:
  mcp:
    url: https://registry.npmjs.org
    token_env: NPM_TOKEN
    access: public

  registries:
    typescript:
      url: https://registry.npmjs.org
      token_env: NPM_TOKEN
      access: public

    python:
      url: https://upload.pypi.org/legacy/
      token_env: PYPI_TOKEN

    go:
      url: https://github.com/acme/acme-go-sdk.git
      username_env: GIT_USERNAME
      token_env: GIT_TOKEN

    java:
      url: https://maven.pkg.github.com/acme/acme-java-sdk
      username_env: MAVEN_USERNAME
      token_env: MAVEN_TOKEN

    kotlin:
      url: https://maven.pkg.github.com/acme/acme-kotlin-sdk
      username_env: MAVEN_USERNAME
      token_env: MAVEN_TOKEN

    ruby:
      url: https://rubygems.org
      token_env: GEM_HOST_API_KEY

    php:
      url: https://github.com/acme/acme-php-sdk.git
      username_env: GIT_USERNAME
      token_env: GIT_TOKEN

    csharp:
      url: https://api.nuget.org/v3/index.json
      token_env: NUGET_API_KEY

    rust:
      token_env: CARGO_REGISTRY_TOKEN

    cpp:
      name: company-conan
      url: https://conan.example.com/artifactory/api/conan/sdk
      username_env: CONAN_LOGIN_USERNAME
      token_env: CONAN_PASSWORD

    c:
      name: company-conan
      url: https://conan.example.com/artifactory/api/conan/sdk
      username_env: CONAN_LOGIN_USERNAME
      token_env: CONAN_PASSWORD
```

The `token_env` value is an environment-variable name. Do not put a token value in `cortex.config.yml`.

The `username_env` value is optional. Some Maven, Git, and Conan registries require a username.

The `publish.mcp` object configures the npm destination for the MCP server. If you omit it, Cortex uses `publish.registries.typescript` for the MCP package.

## Choose publish destinations

Registry publishing is enabled by default. GitHub publishing is disabled by default. Configure the destinations for each package.

### Publish to a registry and GitHub

Set `github_repository` on the SDK and enable `publish.github`:

```yaml
sources:
  - title: Public API
    type: openapi-spec
    spec: ./openapi.yaml
    languages:
      - language: typescript
        package_name: '@acme/sdk'
        github_repository: https://github.com/acme/acme-typescript-sdk
        publish:
          github:
            token_env: GITHUB_TOKEN
            branch: main

publish:
  registries:
    typescript:
      url: https://registry.npmjs.org
      token_env: NPM_TOKEN
      access: public
```

Use `github: true` when the defaults are sufficient. Cortex then uses `GITHUB_TOKEN`, the optional `GITHUB_USERNAME`, and the `main` branch.

### Publish only to GitHub

Set `publish.enabled` to `false`. This setting disables the package registry for that package only:

```yaml
sources:
  - title: Public API
    type: openapi-spec
    spec: ./openapi.yaml
    languages:
      - language: rust
        package_name: acme-sdk
        github_repository: https://github.com/acme/acme-rust-sdk
        publish:
          enabled: false
          github:
            token_env: GITHUB_TOKEN
```

GitHub-only mode is available for TypeScript, Python, Go, Java, Kotlin, Ruby, PHP, C#, Rust, C++, C, and MCP packages.

### Publish only to a registry

Do not add `publish.github`. Registry publishing stays enabled:

```yaml
sources:
  - title: Public API
    type: openapi-spec
    spec: ./openapi.yaml
    languages:
      - language: python
        package_name: acme-sdk
        github_repository: https://github.com/acme/acme-python-sdk
        publish:
          token_env: PYPI_TOKEN
```

In this example, `github_repository` adds package and documentation links. It does not enable GitHub publishing.

### Publish the MCP package to GitHub

Use the same destination controls under `publish.mcp`:

```yaml
mcp:
  package_name: '@acme/mcp-server'
  github_repository: https://github.com/acme/acme-mcp-server

publish:
  mcp:
    url: https://registry.npmjs.org
    token_env: NPM_TOKEN
    access: public
    github:
      token_env: GITHUB_TOKEN
      branch: main
```

Set `publish.mcp.enabled: false` for GitHub-only MCP publication.

### Repository metadata

`github_repository` is the canonical source link for a generated package. Cortex adds it to the SDK card in the documentation site and to the generated README.

Cortex also adds the link to native package metadata where that package system supports it:

| Package          | Generated repository metadata                          |
| ---------------- | ------------------------------------------------------ |
| npm and MCP      | `repository`, `homepage`, and `bugs` in `package.json` |
| Python           | project URLs in `pyproject.toml` and `setup.py`        |
| Maven and Gradle | project URL and SCM data in the generated POM          |
| RubyGems         | homepage and source URLs in the gemspec                |
| Composer         | homepage and support URLs in `composer.json`           |
| NuGet            | project and repository URLs in the project file        |
| Cargo            | `repository` and `homepage` in `Cargo.toml`            |
| Conan            | homepage and source URL in `conanfile.py`              |
| Go               | source link in the README and Cortex package metadata  |

Each generated `.cortex-package.json` also contains the canonical repository URL. The file is part of the package. It is not a local version database.

## Automatic versions

Do not add a release version to `cortex.config.yml`. Cortex calculates the version when you publish a package.

Cortex reads published versions from every enabled destination before each publication. CI jobs do not need a version-state file.

| Target                 | Version source                        |
| ---------------------- | ------------------------------------- |
| TypeScript and MCP     | npm package versions                  |
| Python                 | PyPI Simple API                       |
| Go and PHP             | Git tags with the `v<version>` format |
| Java and Kotlin        | Maven `maven-metadata.xml`            |
| Ruby                   | RubyGems package versions             |
| C#                     | NuGet package versions                |
| Rust                   | Cargo registry index                  |
| C and C++              | Conan recipe versions                 |
| Any GitHub destination | Git tags with the `v<version>` format |

If the package does not exist, Cortex uses `0.0.0` as the previous version. Thus, the first patch publication uses `0.0.1`.

### Publish only changed packages

Cortex calculates one SHA-256 content checksum for each generated package. The checksum does not include the release version or temporary build output.

Each published package contains its checksum in Cortex package metadata. A GitHub release stores the same metadata in the tagged source. Before publication, Cortex does these actions for each SDK and MCP package:

1. Read the latest version from each enabled destination.
2. Read the Cortex checksum from each published package or Git tag.
3. Calculate the checksum for the new generated package.
4. Skip the package when the two checksums are equal.
5. Increase the version and publish when the checksums are different.

An unchanged package does not get a new version. Cortex does not build or upload it.

When one destination already has the current checksum, Cortex uses that destination's version. It publishes the same version only to the destination that is behind. This behavior repairs a partial publication without creating another release.

An older package might not contain Cortex checksum metadata. Cortex publishes that package once to add the metadata. Later publications can then detect unchanged content.

If a version lookup fails, Cortex stops publication for that target. It does not treat a destination error as a new package.

For a private registry, the configured credential must have permission to read package metadata and package artifacts.

The default increase for a changed package is `patch`. Use `--bump minor` or `--bump major` when you need another release type.

```bash
cortex publish --bump minor
```

A dry run reads all enabled destinations and compares the checksums. It shows the next version only for changed packages. It does not change a file.

If publication fails, Cortex restores the previous package version in the generated files.

### Override one package

A source language can override its inherited registry configuration:

```yaml
sources:
  - title: Private REST API
    type: openapi-spec
    spec: ./openapi.yaml
    languages:
      - language: typescript
        package_name: '@acme/private-sdk'
        publish:
          url: https://npm.acme.internal
          token_env: ACME_NPM_TOKEN
          access: restricted
```

This override is useful when one package needs different destinations or credentials.

## Set publish credentials

Set each secret before you run `cortex publish`.

### GitHub source repositories

Create each target repository before publication. Cortex does not create a GitHub repository.

For local use, create a fine-grained personal access token that can access the target repository. Give it read and write access to repository contents. Then export it:

```bash
export GITHUB_USERNAME='acme-release-bot'
export GITHUB_TOKEN='github_pat_...'
```

`GITHUB_USERNAME` is optional. You can select other environment-variable names in the package's `publish.github` object:

```yaml
sources:
  - title: Public API
    type: openapi-spec
    spec: ./openapi.yaml
    languages:
      - language: typescript
        package_name: '@acme/sdk'
        github_repository: https://github.com/acme/acme-typescript-sdk
        publish:
          github:
            token_env: SDK_GITHUB_TOKEN
            username_env: SDK_GITHUB_USERNAME
```

GitHub publishing clones the repository over HTTPS. Cortex replaces the generated package files on the configured branch, but it preserves the `.github` directory. It then commits the release and pushes a `v<version>` tag.

If branch protection blocks direct pushes, allow the release identity to push. You can also select a dedicated generated-source branch with `publish.github.branch`.

### npm for TypeScript and MCP

Create an automation token in your npm account. Then export the token:

```bash
export NPM_TOKEN='npm_...'
```

Cortex writes a temporary npm configuration file. Your home npm configuration does not change.

You can use a separate token for the MCP package:

```yaml
publish:
  mcp:
    token_env: MCP_NPM_TOKEN
```

```bash
export MCP_NPM_TOKEN='npm_...'
```

### PyPI

Create an API token in your PyPI account. Then install the publish tools and export the token:

```bash
python -m pip install build twine
export PYPI_TOKEN='pypi-...'
```

Cortex sends `__token__` as the PyPI username. Set `username_env` only if your private index requires another username.

### Git for Go and PHP

Create a token that can write to the target repository. Then export the Git credential:

```bash
export GIT_USERNAME='acme-release-bot'
export GIT_TOKEN='github_pat_...'
```

Cortex clones the target repository into a temporary directory. Then it commits the package, creates a version tag, and pushes both refs.

The repository must exist before publication. The token must have permission to write repository contents.

### Maven for Java and Kotlin

Create a token for your Maven repository. Then export the Maven credential:

```bash
export MAVEN_USERNAME='acme-release-bot'
export MAVEN_TOKEN='...'
```

Cortex creates a temporary Maven settings file for Java. Cortex passes temporary Gradle properties for Kotlin.

The Java publisher supports Maven deployment endpoints. The Kotlin publisher uses the Gradle `maven-publish` plugin.

### RubyGems

Create a RubyGems API key. Then export the key:

```bash
export GEM_HOST_API_KEY='rubygems_...'
```

You can also use a compatible private server, such as Gemstash.

### NuGet

Create an API key in the NuGet account. Then export the key:

```bash
export NUGET_API_KEY='...'
```

The token needs permission to publish the configured package ID.

### Cargo

Create a token with `cargo login` or the registry website. Then export the token:

```bash
export CARGO_REGISTRY_TOKEN='...'
```

For a private registry, set its index URL in `publish.registries.rust.url`.

### Conan for C and C++

Create a credential for the Conan remote. Then export the credential:

```bash
export CONAN_LOGIN_USERNAME='acme-release-bot'
export CONAN_PASSWORD='...'
```

The generated C package has the suffix `-c`. The generated C++ package has the suffix `-cpp`.

These suffixes prevent a name collision when both SDKs use one Conan remote.

## Publish packages

Generate the packages before publication:

```bash
cortex generate
```

Show the publication plan:

```bash
cortex publish --dry-run
```

Publish all configured packages:

```bash
cortex publish
```

Publish one SDK:

```bash
cortex publish --sdk python
```

Publish only the MCP server:

```bash
cortex publish --mcp
```

Override the registry URL for one SDK:

```bash
cortex publish --sdk typescript --registry https://npm.pkg.github.com
```

Use another configuration file or output directory:

```bash
cortex publish --config ./release/cortex.config.yml
cortex publish ./release/generated
```

## Publication actions

Cortex stops a package publication when its build fails.

| Target     | Build action                                                                            | Publish action                 |
| ---------- | --------------------------------------------------------------------------------------- | ------------------------------ |
| TypeScript | `npm install --ignore-scripts`, `npm run build --if-present`, then `npm pack --dry-run` | `npm publish`                  |
| Python     | `python -m build`                                                                       | `twine upload`                 |
| Go         | `go test ./...`                                                                         | Commit, tag, and push with Git |
| Java       | `mvn package`                                                                           | `mvn deploy`                   |
| Kotlin     | `gradle build`                                                                          | `gradle publish`               |
| Ruby       | `gem build`                                                                             | `gem push`                     |
| PHP        | `composer validate --strict`                                                            | Commit, tag, and push with Git |
| C#         | `dotnet pack`                                                                           | `dotnet nuget push`            |
| Rust       | `cargo publish --dry-run`                                                               | `cargo publish`                |
| C++        | `conan create --build=missing`                                                          | `conan upload`                 |
| C          | `conan create --build=missing`                                                          | `conan upload`                 |
| MCP server | `npm install --ignore-scripts`, `npm run build --if-present`, then `npm pack --dry-run` | `npm publish`                  |

When GitHub publication is enabled, Cortex uses the same build check. It then commits the generated source and pushes the release tag.

The command continues with the next package after a publication error. It returns a nonzero exit code when any package fails.

## Use CI

Store all tokens in your CI secret store. Map each secret to the environment-variable name in the Cortex configuration.

For a GitHub Actions workflow that publishes to its own repository, grant write access to repository contents:

```yaml
permissions:
  contents: write
```

The built-in `GITHUB_TOKEN` is limited to the workflow repository. Use a fine-grained personal access token or a GitHub App token when the generated SDK has another repository.

```yaml
- name: Generate SDK packages
  run: cortex generate

- name: Show publication plan
  run: cortex publish --dry-run

- name: Publish SDK and MCP packages
  run: cortex publish
  env:
    NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
    PYPI_TOKEN: ${{ secrets.PYPI_TOKEN }}
    GITHUB_TOKEN: ${{ secrets.SDK_GITHUB_TOKEN }}
    GIT_USERNAME: ${{ github.actor }}
    GIT_TOKEN: ${{ secrets.SDK_REPOSITORY_TOKEN }}
    MAVEN_USERNAME: ${{ github.actor }}
    MAVEN_TOKEN: ${{ secrets.MAVEN_TOKEN }}
    GEM_HOST_API_KEY: ${{ secrets.GEM_HOST_API_KEY }}
    NUGET_API_KEY: ${{ secrets.NUGET_API_KEY }}
    CARGO_REGISTRY_TOKEN: ${{ secrets.CARGO_REGISTRY_TOKEN }}
    CONAN_LOGIN_USERNAME: ${{ secrets.CONAN_LOGIN_USERNAME }}
    CONAN_PASSWORD: ${{ secrets.CONAN_PASSWORD }}
```

Protect publication jobs with branch and tag rules. A package registry rejects a version that already exists.
