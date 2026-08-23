# gRPC SDK Generation

Cortex generates typed gRPC clients from Protocol Buffer definitions. The generator preserves the source `.proto` file and creates native message types.

## Configuration

Add a `grpc-spec` source to `cortex.config.yml`:

```yaml
sources:
  - title: 'Pet Store'
    type: grpc-spec
    spec: ./specs/service.proto
    languages:
      - language: typescript
        package_name: '@my-org/sdk'
      - language: python
        package_name: 'my-org-sdk'
```

The `spec` value points to a Protocol Buffer file. Multiple sources can use the same package name to create one SDK package.

## Generated Files

Each generated SDK contains these gRPC artifacts:

| Artifact        | Purpose                                        |
| --------------- | ---------------------------------------------- |
| `grpc-client`   | Service methods for unary and streaming RPCs   |
| `grpc-types`    | Native types for messages, fields, and enums   |
| `service.proto` | A preserved copy of the Protocol Buffer source |

Go places the gRPC files in `src/grpc`. Other languages place them in the standard source directory.

## RPC and Stream Types

Cortex reads the stream modifiers from each RPC declaration:

| RPC type                | Protocol Buffer declaration                  | Generated behavior                             |
| ----------------------- | -------------------------------------------- | ---------------------------------------------- |
| Unary                   | One request and one response                 | A typed call that returns one response         |
| Server streaming        | `returns (stream Response)`                  | A readable stream, iterator, or receiver       |
| Client streaming        | `(stream Request) returns (Response)`        | A writable stream when the runtime supports it |
| Bidirectional streaming | `(stream Request) returns (stream Response)` | A duplex stream when the runtime supports it   |

Server streams use the native abstraction of each language. TypeScript returns `ClientReadableStream`, Python returns an iterator, and Go exposes `Recv()`.

Some HTTP-backed runtimes do not provide client or bidirectional streams. In these runtimes, the generated method reports that the transport does not support the operation.

## Server-Stream Example

For a server-streaming RPC named `WatchPets`, the generated TypeScript method returns a readable stream:

```typescript
const stream = client.watchPets({ ownerId: 'owner-123' });

stream.on('data', (pet) => {
  console.log(pet);
});

stream.on('error', (error) => {
  console.error(error);
});
```

The generated package includes the source `.proto` file. The client loads this file when the runtime requires service metadata.

## Supported Languages

gRPC generation supports TypeScript, Python, Go, Java, Kotlin, Ruby, PHP, C#, Rust, C++, and C.

Native gRPC libraries provide the complete stream API in TypeScript, Python, Go, and other compatible runtimes. Generated fallback transports keep server-stream operations available where possible.
