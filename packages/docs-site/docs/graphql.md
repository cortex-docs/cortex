
# GraphQL SDK Generation

Cortex generates fully typed GraphQL client SDKs from your GraphQL schema definitions. The generated clients provide type-safe queries, mutations, and subscriptions with complete autocomplete support in your IDE.

## What It Does

Given a `.graphql` schema file, Cortex produces:

- **Typed query and mutation builders** that match your schema exactly
- **Generated types** for all input and output types, enums, and interfaces
- **Subscription support** with typed event handlers
- **Fragment support** for reusable query parts
- **Automatic request/response serialization**

## CLI Usage

### Initialize a project

```bash
cortex init my-project
```

Then add your GraphQL source to `cortex.config.yml`:

```yaml
sources:
  - title: "GraphQL"
    type: graphql-spec
    spec: ./specs/schema.graphql
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
    client.ts              # Main client with query/mutate methods
    graphql/
      queries.ts           # Typed query functions
      mutations.ts         # Typed mutation functions
      subscriptions.ts     # Typed subscription handlers
      fragments.ts         # Reusable fragments
      types.ts             # All GraphQL types as TypeScript interfaces
```

### Python

```
generated/python/
  my_api/
    client.py              # Main client with query/mutate methods
    graphql/
      queries.py           # Typed query functions
      mutations.py         # Typed mutation functions
      subscriptions.py     # Typed subscription handlers
      fragments.py         # Reusable fragments
      types.py             # All GraphQL types as Pydantic models
```

## Example Usage

### TypeScript

```typescript
import { MyProjectClient } from '@my-project/sdk';

const client = new MyProjectClient({
  bearerToken: 'your-token',
});

// Typed query with autocomplete
const user = await client.graphql.query.getUser({
  variables: { id: 'user-123' },
  fields: ['id', 'name', 'email', 'posts.title'],
});

// Typed mutation
const updated = await client.graphql.mutate.updateUser({
  variables: { id: 'user-123', input: { name: 'New Name' } },
});

// Subscription
client.graphql.subscribe.onUserUpdated(
  { variables: { userId: 'user-123' } },
  (event) => {
    console.log('User updated:', event.data.userUpdated);
  },
);
```

### Python

```python
from my_project import MyProjectClient

client = MyProjectClient(bearer_token="your-token")

# Typed query
user = client.graphql.query.get_user(
    variables={"id": "user-123"},
    fields=["id", "name", "email", "posts.title"],
)

# Typed mutation
updated = client.graphql.mutate.update_user(
    variables={"id": "user-123", "input": {"name": "New Name"}},
)

# Subscription
def on_user_updated(event):
    print("User updated:", event.data.user_updated)

client.graphql.subscribe.on_user_updated(
    variables={"user_id": "user-123"},
    callback=on_user_updated,
)
```

## Schema Requirements

Cortex supports standard GraphQL schema definition language (SDL). Your schema file should define your types, queries, mutations, and subscriptions:

```graphql
type User {
  id: ID!
  name: String!
  email: String!
  posts: [Post!]!
}

type Post {
  id: ID!
  title: String!
  body: String!
  author: User!
}

type Query {
  getUser(id: ID!): User
  listUsers(limit: Int, offset: Int): [User!]!
}

type Mutation {
  createUser(input: CreateUserInput!): User!
  updateUser(id: ID!, input: UpdateUserInput!): User!
}

input CreateUserInput {
  name: String!
  email: String!
}

input UpdateUserInput {
  name: String
  email: String
}

type Subscription {
  onUserUpdated(userId: ID!): User!
}
```

## Vendor Extensions

Use `x-cortex-*` directives in your schema comments to customize generation:

```graphql
# @x-cortex-method-name: fetchUser
type Query {
  getUser(id: ID!): User
}
```
