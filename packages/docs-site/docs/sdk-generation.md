# OpenAPI

Cortex generates idiomatic REST client SDKs from your OpenAPI 3.x specification. Each SDK provides a typed client with resource-based method access, request/response models, and authentication support.

You can replace client, type, resource, README, package, and snippet templates. See [Custom Generators](/docs/custom-generators).

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

## Runtime HTTP Options

Generated REST SDKs expose HTTP options in the client constructor. Some languages also expose options for each request.

| Option               | Default    | Purpose                                                      |
| -------------------- | ---------- | ------------------------------------------------------------ |
| HTTP request timeout | 15 seconds | Stops a request that does not complete before the time limit |

## Generated SDK Structure

Every generated SDK follows a consistent pattern:

### Client

A main client class with resource accessors and a generic request method:

```typescript
const client = new MyApiClient({
  bearerToken: 'your-token',
  timeout: 15_000, // milliseconds; 15 seconds is the default
});
```

The timeout is configurable on the client and, where the language supports it, per request. A value of zero disables the generated timeout in clients that expose per-request overrides.

### Chunked responses

Every generated REST client includes a streaming request API. It consumes the response incrementally instead of buffering the complete body. HTTP libraries remove the transfer framing, so callbacks and iterators receive decoded payload bytes.

```typescript
const decoder = new TextDecoder();
for await (const chunk of client.requestStream('GET', '/events')) {
  console.log(decoder.decode(chunk, { stream: true }));
}
```

Streaming requests use the same authentication, headers, error handling, and client timeout as regular requests. Runtimes with cancellation or per-request timeout options carry those overrides into the stream.

### Resources

One class per resource (tag group) with typed methods for each operation:

```typescript
const pets = await client.pets.list({ limit: 10 });
const pet = await client.pets.get('pet-123');
const created = await client.pets.create({ name: 'Rex', species: 'dog' });
```

### Types

All request/response schemas become native types (interfaces, classes, dataclasses, structs) with full type safety.

## File Uploads

Cortex recognizes an OpenAPI file as `type: string` with `format: binary`. It generates file types for every supported SDK language.

The Try Now modal shows a file selector for each file property. An array of files uses a selector that accepts multiple files.

### Multipart uploads

Use `multipart/form-data` when one request contains files and other fields:

```yaml
paths:
  /pets:
    post:
      operationId: createPet
      requestBody:
        required: true
        content:
          multipart/form-data:
            schema:
              type: object
              required:
                - name
                - consentForm
              properties:
                name:
                  type: string
                profilePic:
                  type: string
                  format: binary
                consentForm:
                  type: string
                  format: binary
                attachments:
                  type: array
                  items:
                    type: string
                    format: binary
```

This schema covers these scenarios:

| Scenario             | OpenAPI shape                | Wire format                                |
| -------------------- | ---------------------------- | ------------------------------------------ |
| Required file        | A required binary property   | One required file part                     |
| Optional file        | An optional binary property  | Zero or one file part                      |
| Multiple named files | Multiple binary properties   | One part for each property name            |
| File array           | An array with binary items   | Repeated parts with the same property name |
| Mixed data           | File and non-file properties | File parts plus text parts                 |
| Nested data          | An object or array property  | A JSON string in a text part               |

The generated `FileUpload` type contains three values:

- The original filename.
- The unchanged binary data.
- The MIME type for the part.

The exact field names follow the conventions of each language. For example, TypeScript uses `fileName`, `data`, and `contentType`.

```typescript
const result = await client.pets.create({
  name: 'Rex',
  profilePic: {
    fileName: 'profile.webp',
    data: new Blob([imageBytes], { type: 'image/webp' }),
    contentType: 'image/webp',
  },
  attachments: [
    {
      fileName: 'record.pdf',
      data: new Blob([pdfBytes], { type: 'application/pdf' }),
      contentType: 'application/pdf',
    },
    {
      fileName: 'notes.txt',
      data: new Blob([textBytes], { type: 'text/plain' }),
      contentType: 'text/plain',
    },
  ],
});
```

### Raw binary uploads

Use a binary schema at the request-body root when the file is the complete HTTP body:

```yaml
paths:
  /uploads/raw:
    post:
      operationId: uploadFile
      requestBody:
        required: true
        content:
          application/pdf:
            schema:
              type: string
              format: binary
```

The generated method accepts one `FileUpload`. Its `contentType` value overrides the OpenAPI media type when the value is not empty.

### MIME types

Cortex does not use a MIME allowlist. You can send a valid MIME string that the target HTTP library accepts.

The implementation supports these common groups:

- Images, such as `image/png`, `image/jpeg`, `image/webp`, and `image/svg+xml`.
- Documents, such as `application/pdf`, `text/plain`, `text/csv`, `application/json`, and `application/xml`.
- Archives, such as `application/zip`, `application/gzip`, and `application/x-tar`.
- Audio and video types, such as `audio/mpeg`, `audio/wav`, `video/mp4`, and `video/webm`.
- Office and vendor types, such as `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.
- Unknown binary files through `application/octet-stream`.

If `contentType` is empty, generated SDKs use `application/octet-stream`. Try Now uses the MIME type that the browser reports.

### Current limits

Generated SDKs keep upload data in memory. They do not stream a file from disk during the request.

Cortex serializes a nested multipart object as JSON text. It does not generate custom per-part headers from the OpenAPI `encoding` object.

The API server remains responsible for file-size limits, MIME inspection, malware scanning, and filename validation.

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

| Language   | Classes    | Methods    | Properties | Files      |
| ---------- | ---------- | ---------- | ---------- | ---------- |
| TypeScript | PascalCase | camelCase  | camelCase  | kebab-case |
| Python     | PascalCase | snake_case | snake_case | snake_case |
| Go         | PascalCase | PascalCase | PascalCase | snake_case |
| Java       | PascalCase | camelCase  | camelCase  | PascalCase |
| Kotlin     | PascalCase | camelCase  | camelCase  | PascalCase |
| Ruby       | PascalCase | snake_case | snake_case | snake_case |
| PHP        | PascalCase | camelCase  | camelCase  | PascalCase |
| C#         | PascalCase | PascalCase | PascalCase | PascalCase |
| Rust       | PascalCase | snake_case | snake_case | snake_case |
| C++        | PascalCase | snake_case | snake_case | snake_case |
| C          | PascalCase | snake_case | snake_case | snake_case |

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
