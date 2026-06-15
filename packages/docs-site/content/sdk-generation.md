---
title: SDK Generation
description: How Cortex generates typed SDKs from OpenAPI specifications.
order: 3
---

# SDK Generation

Cortex generates idiomatic SDKs by parsing your OpenAPI spec and producing language-native code.

## How It Works

1. **Parse** — Your OpenAPI 3.x spec is parsed and validated (from file or URL)
2. **Resolve** — All `$ref` references are resolved and schemas are flattened
3. **Transform** — Operations are grouped into resources based on tags or `x-cortex-resource`
4. **Generate** — Each language plugin produces native code with proper types and naming conventions

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

All request/response schemas become native types (interfaces, classes, dataclasses, structs).

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

## CLI Usage

```bash
# Initialize a new project
cortex init my-project

# Then edit cortex.config.yml to add your API sources and languages

# Generate all SDKs from cortex.config.yml
cortex generate

# Regenerate a single language
cortex generate --language typescript

# Preview without writing files
cortex generate --dry-run
```
