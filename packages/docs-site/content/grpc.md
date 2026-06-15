---
title: gRPC
description: Generate gRPC clients from Protocol Buffer definitions
order: 10
---

# gRPC Client Generation

Cortex generates typed gRPC client libraries from your Protocol Buffer (`.proto`) definitions. The generated clients provide type-safe RPC method calls with full support for unary, server streaming, client streaming, and bidirectional streaming patterns.

## What It Does

Given a `.proto` file, Cortex produces:

- **Typed gRPC client stubs** for all services defined in your proto
- **Generated message types** for all protobuf messages, enums, and oneofs
- **Streaming support** for all four gRPC communication patterns
- **Channel management** with configurable connection options
- **Interceptor support** for authentication, logging, and retry logic

## CLI Usage

### Initialize a project

```bash
cortex init my-project
```

Then add your gRPC source to `cortex.config.yml`:

```yaml
sources:
  - title: "gRPC"
    type: grpc-spec
    spec: ./service.proto
    languages:
      - language: typescript
        package_name: "@my-org/typescript-client-sdk"
```

### Generate

```bash
cortex generate
```

## Generated Structure

### TypeScript

```
generated/typescript/
  src/
    client.ts              # Main client (REST + gRPC)
    grpc/
      service_client.ts    # Typed gRPC service client
      messages.ts          # Protobuf message types as TypeScript interfaces
      enums.ts             # Protobuf enums
```

### Python

```
generated/python/
  my_api/
    client.py              # Main client (REST + gRPC)
    grpc/
      service_client.py    # Typed gRPC service client
      messages.py          # Protobuf message types as dataclasses
      enums.py             # Protobuf enums
```

### Rust

```
generated/rust/
  src/
    client.rs              # Main client (REST + gRPC)
    grpc/
      service_client.rs    # Typed gRPC service client (tonic)
      messages.rs          # Protobuf message types as structs
      enums.rs             # Protobuf enums
```

## Example Usage

### TypeScript

```typescript
import { MyProjectClient } from '@my-project/sdk';

const client = new MyProjectClient({
  grpcEndpoint: 'localhost:50051',
});

// Unary RPC
const user = await client.grpc.userService.getUser({ id: 'user-123' });

// Server streaming
const stream = client.grpc.userService.listUsers({ pageSize: 10 });
for await (const user of stream) {
  console.log('User:', user.name);
}

// Client streaming
const uploader = client.grpc.fileService.uploadFile();
uploader.send({ chunk: buffer1 });
uploader.send({ chunk: buffer2 });
const result = await uploader.complete();

// Bidirectional streaming
const chat = client.grpc.chatService.chat();
chat.on('data', (message) => console.log('Received:', message.text));
chat.send({ text: 'Hello' });
```

### Python

```python
from my_project import MyProjectClient

client = MyProjectClient(grpc_endpoint="localhost:50051")

# Unary RPC
user = client.grpc.user_service.get_user(id="user-123")

# Server streaming
for user in client.grpc.user_service.list_users(page_size=10):
    print("User:", user.name)

# Client streaming
with client.grpc.file_service.upload_file() as uploader:
    uploader.send(chunk=buffer1)
    uploader.send(chunk=buffer2)
    result = uploader.complete()

# Bidirectional streaming
async with client.grpc.chat_service.chat() as chat:
    await chat.send(text="Hello")
    async for message in chat:
        print("Received:", message.text)
```

## Proto File Example

Cortex supports proto3 syntax. Here is an example of a supported `.proto` file:

```protobuf
syntax = "proto3";

package myproject;

service UserService {
  // Unary
  rpc GetUser (GetUserRequest) returns (User);

  // Server streaming
  rpc ListUsers (ListUsersRequest) returns (stream User);

  // Client streaming
  rpc UploadAvatar (stream AvatarChunk) returns (UploadResult);

  // Bidirectional streaming
  rpc Chat (stream ChatMessage) returns (stream ChatMessage);
}

message User {
  string id = 1;
  string name = 2;
  string email = 3;
  UserRole role = 4;
}

enum UserRole {
  USER_ROLE_UNSPECIFIED = 0;
  USER_ROLE_ADMIN = 1;
  USER_ROLE_MEMBER = 2;
}

message GetUserRequest {
  string id = 1;
}

message ListUsersRequest {
  int32 page_size = 1;
  string page_token = 2;
}

message AvatarChunk {
  bytes data = 1;
}

message UploadResult {
  string url = 1;
  int64 size_bytes = 2;
}

message ChatMessage {
  string text = 1;
  string sender_id = 2;
}
```

## Configuration Options

You can configure gRPC-specific settings in `cortex.config.yml`:

```yaml
grpc: ./service.proto

grpc_options:
  package_prefix: myproject     # Override protobuf package name
  generate_server: false        # Only generate client stubs (default)
  deadline_ms: 5000             # Default RPC deadline
```

## Supported Languages

gRPC client generation is available for all Cortex-supported languages. Languages that use `tonic` (Rust) or native gRPC libraries benefit from full streaming support out of the box.
