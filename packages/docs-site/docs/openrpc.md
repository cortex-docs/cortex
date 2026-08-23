# OpenRPC Client Generation

Cortex generates typed JSON-RPC client libraries from your OpenRPC specification files. The generated clients provide type-safe method calls that send JSON-RPC 2.0 requests over HTTP. Both OpenRPC v1.3.2 and v1.2.6 are supported.

## What It Does

Given an OpenRPC JSON file, Cortex produces:

- **Typed JSON-RPC client classes** with methods for every RPC method in the spec
- **Generated types** for all parameter and result schemas defined in components
- **JSON-RPC 2.0 compliance** with automatic request ID management and error handling
- **Multi-language support** across all 11 Cortex-supported languages

## CLI Usage

### Initialize a project

```bash
cortex init my-project
```

Then add your OpenRPC source to `cortex.config.yml`:

```yaml
sources:
  - title: 'OpenRPC'
    type: openrpc-spec
    spec: ./specs/api-openrpc.json
    languages:
      - language: typescript
        package_name: '@my-org/typescript-client-sdk'
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
    openrpc-client.ts     # Typed JSON-RPC client
    openrpc-types.ts      # TypeScript interfaces from component schemas
```

### Python

```
generated/python/
  src/
    openrpc_client.py     # Typed JSON-RPC client
    openrpc_types.py      # Dataclass types from component schemas
```

### Rust

```
generated/rust/
  src/
    openrpc_client.rs     # Typed JSON-RPC client (reqwest + serde)
    openrpc_types.rs      # Struct types from component schemas
```

## Example Usage

### TypeScript

```typescript
import { MyApiClient } from '@my-project/sdk';

const client = new MyApiClient({ url: 'https://api.example.com/rpc' });

// Call a method
const pets = await client.listPets({ limit: 10 });

// Call with required params
const pet = await client.getPet({ id: 'pet-123' });

// Create a resource
const newPet = await client.createPet({
  name: 'Buddy',
  species: 'dog',
});
```

### Python

```python
from my_project import MyApiClient

client = MyApiClient(url="https://api.example.com/rpc")

# Call a method
pets = client.list_pets(limit=10)

# Call with required params
pet = client.get_pet(id="pet-123")

# Create a resource
new_pet = client.create_pet(name="Buddy", species="dog")
```

## OpenRPC Spec Example

Cortex supports OpenRPC v1.2.6 and v1.3.2. Here is an example spec:

```json
{
  "openrpc": "1.3.2",
  "info": {
    "title": "My API",
    "version": "1.0.0"
  },
  "servers": [{ "url": "https://api.example.com/rpc" }],
  "methods": [
    {
      "name": "getUser",
      "summary": "Get a user by ID",
      "params": [
        {
          "name": "id",
          "required": true,
          "schema": { "type": "string" }
        }
      ],
      "result": {
        "name": "user",
        "schema": { "$ref": "#/components/schemas/User" }
      }
    }
  ],
  "components": {
    "schemas": {
      "User": {
        "type": "object",
        "required": ["id", "name"],
        "properties": {
          "id": { "type": "string" },
          "name": { "type": "string" },
          "email": { "type": "string" }
        }
      }
    }
  }
}
```

## Configuration

Add an OpenRPC source in `cortex.config.yml`:

```yaml
sources:
  - title: 'OpenRPC API'
    type: openrpc-spec
    spec: ./specs/api-openrpc.json
    languages:
      - language: typescript
        package_name: '@my-org/sdk'
```

## Supported Versions

| Version       | Status          |
| ------------- | --------------- |
| OpenRPC 1.3.2 | Fully supported |
| OpenRPC 1.2.6 | Fully supported |

## Supported Languages

JSON-RPC client generation is available for all Cortex-supported languages: TypeScript, Python, Go, Java, Kotlin, Ruby, PHP, C#, Rust, C++, and C.
