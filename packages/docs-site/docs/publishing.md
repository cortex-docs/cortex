
# Publishing SDKs

After generating SDKs, use `cortex publish` to publish them to their respective package registries.

## Quick Start

```bash
# Initialize a new project, then edit cortex.config.yml to add sources
cortex init my-project

# Generate all SDKs
cortex generate

# Preview what would be published
cortex publish --dry-run

# Publish all SDKs
cortex publish
```

## How It Works

`cortex publish` scans the generated output directory and detects each SDK by its package manifest:

| File Found | Language | Publish Command |
|-----------|----------|----------------|
| `package.json` | TypeScript | `npm publish --access public` |
| `setup.py` / `pyproject.toml` | Python | `python -m build && twine upload dist/*` |
| `go.mod` | Go | `git tag && git push` |
| `pom.xml` | Java | `mvn deploy` |
| `build.gradle.kts` | Kotlin | `gradle publish` |
| `*.gemspec` | Ruby | `gem build && gem push` |
| `composer.json` | PHP | `git tag && git push` |
| `*.csproj` | C# | `dotnet pack && dotnet nuget push` |

## Versioning

`cortex publish` uses the version defined in `cortex.config.yml` (see [Configuration > Versioning](/configuration#versioning)). The version from the config is embedded in every generated package manifest, so the published packages always reflect the version you have set.

If `auto_increment: true` is configured, Cortex automatically bumps the patch version after each successful publish and writes the updated version back to `cortex.config.yml`. This means consecutive `cortex publish` runs produce incrementing versions without manual edits.

## CLI Options

```bash
# Publish from a custom directory
cortex publish ./my-sdks

# Publish only a specific language
cortex publish --language typescript

# Use a custom npm registry
cortex publish --registry https://npm.pkg.github.com

# Preview without publishing
cortex publish --dry-run
```

## Prerequisites

Before publishing, make sure you have the appropriate credentials configured:

### npm (TypeScript)

```bash
npm login
# or set NPM_TOKEN environment variable
```

### PyPI (Python)

```bash
pip install build twine
# Configure ~/.pypirc or set TWINE_USERNAME/TWINE_PASSWORD
```

### Maven Central (Java)

Configure your `~/.m2/settings.xml` with repository credentials.

### RubyGems (Ruby)

```bash
gem signin
# or set GEM_HOST_API_KEY
```

### NuGet (C#)

```bash
dotnet nuget add source --username <user> --password <token>
```

## CI/CD Integration

In a CI pipeline, use the `--dry-run` flag to validate before publishing:

```yaml
# GitHub Actions example
- name: Generate SDKs
  run: cortex generate

- name: Validate packages
  run: cortex publish --dry-run

- name: Publish
  run: cortex publish
  env:
    NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
    TWINE_USERNAME: __token__
    TWINE_PASSWORD: ${{ secrets.PYPI_TOKEN }}
```
