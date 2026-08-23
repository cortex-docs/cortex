
# OpenAPI

Cortex generates idiomatic REST client SDKs from your OpenAPI 3.x specification. Each SDK provides a typed client with resource-based method access, request/response models, and authentication support.

## Configuration

Add an OpenAPI source to your `cortex.config.yml`:

```yaml
sources:
  - title: 'REST API'
    type: openapi-spec
    spec: ./specs/openapi.yaml
    intro: ./docs/REST_INTRO.md
    languages:
      - language: typescript
        package_name: '@my-org/sdk'
      - language: python
        package_name: 'my-org-sdk'
```

The `spec` field accepts local file paths (`./specs/openapi.yaml`) or remote URLs (`https://example.com/openapi.json`). Both YAML and JSON formats are auto-detected.

## Multiple OpenAPI Sources

You can configure multiple OpenAPI sources. Each appears as a separate section in the API Reference:

```yaml
sources:
  - title: 'REST API V2'
    type: openapi-spec
    spec: ./specs/api-v2.yaml
    languages:
      - language: typescript
        package_name: '@my-org/sdk'

  - title: 'REST API V1'
    type: openapi-spec
    spec: ./specs/api-v1.yaml
    languages:
      - language: typescript
        package_name: '@my-org/sdk'
```

When multiple sources share the same `package_name`, their generated code is merged into a single SDK package.

## Generated SDK Structure

Every generated SDK follows a consistent pattern:

### Client

A main client class with resource accessors and a generic request method:

```typescript
const client = new MyApiClient({
  bearerToken: 'your-token',
});
```

### Resources

One class per resource (tag group) with typed methods for each operation:

```typescript
const pets = await client.pets.list({ limit: 10 });
const pet = await client.pets.get('pet-123');
const created = await client.pets.create({ name: 'Rex', species: 'dog' });
```

### Types

All request/response schemas become native types (interfaces, classes, dataclasses, structs) with full type safety.

## Resource Grouping

Operations are grouped into resources using:

1. **`x-cortex-resource` extension** (highest priority) — set on individual operations
2. **OpenAPI tags** — the first tag on an operation determines its resource group
3. **Path-based inference** — derived from the first path segment (e.g. `/pets/{id}` → `pets`)

```yaml
paths:
  /users:
    get:
      x-cortex-resource: users
      x-cortex-method-name: list
```

| Extension              | Description                    |
| ---------------------- | ------------------------------ |
| `x-cortex-resource`    | Override resource grouping     |
| `x-cortex-method-name` | Override generated method name |

## Naming Conventions

Cortex follows each language's idiomatic conventions:

| Language | Classes | Methods | Properties | Files |
|----------|---------|---------|------------|-------|
| TypeScript | PascalCase | camelCase | camelCase | kebab-case |
| Python | PascalCase | snake_case | snake_case | snake_case |
| Go | PascalCase | PascalCase | PascalCase | snake_case |
| Java | PascalCase | camelCase | camelCase | PascalCase |
| Kotlin | PascalCase | camelCase | camelCase | PascalCase |
| Ruby | PascalCase | snake_case | snake_case | snake_case |
| PHP | PascalCase | camelCase | camelCase | PascalCase |
| C# | PascalCase | PascalCase | PascalCase | PascalCase |
| Rust | PascalCase | snake_case | snake_case | snake_case |
| C++ | PascalCase | snake_case | snake_case | snake_case |
| C | PascalCase | snake_case | snake_case | snake_case |

## Authentication

Cortex reads the `securitySchemes` from your OpenAPI spec and generates the appropriate authentication configuration:

```yaml
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
    apiKeyAuth:
      type: apiKey
      in: header
      name: X-API-Key
```

The generated client accepts auth credentials in its constructor:

```typescript
const client = new MyApiClient({
  bearerToken: 'your-jwt-token',
});
```

```python
client = MyApiClient(
    bearer_token="your-jwt-token",
)
```

## Intro Documents

Each OpenAPI source supports an optional `intro` field pointing to a Markdown file. This content renders at the top of that source's section in the API Reference, before any operations:

```yaml
sources:
  - title: 'REST API'
    type: openapi-spec
    spec: ./specs/openapi.yaml
    intro: ./docs/REST_INTRO.md
```

Use intro documents for base URLs, authentication guides, rate limiting policies, or overview content. The intro is also embedded in the MCP server agent instructions.
