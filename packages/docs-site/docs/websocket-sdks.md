
# WebSocket SDKs

Cortex supports generating WebSocket client SDKs from [AsyncAPI](https://www.asyncapi.com) specifications.

## What is AsyncAPI?

AsyncAPI is like OpenAPI, but for event-driven architectures. It describes WebSocket channels, messages, and their schemas — enabling Cortex to generate typed, real-time client libraries.

## Generating a WebSocket SDK

```bash
cortex init my-project
```

Then add your AsyncAPI source to `cortex.config.yml`:

```yaml
sources:
  - title: "WebSocket API"
    type: asyncapi-spec
    spec: ./specs/asyncapi.yaml
    languages:
      - language: typescript
        package_name: "@my-org/typescript-client-sdk"
```

Run `cortex generate` to produce a TypeScript WebSocket client with:

- Type-safe channel subscriptions and publishing
- Auto-reconnection with configurable retries
- Event-based message handling
- Typed message schemas from your AsyncAPI spec

## Example Usage

Given a chat AsyncAPI spec with `chat/messages` and `chat/typing` channels:

```typescript
import { ChatClient } from './ws-sdk';

const client = new ChatClient({
  url: 'wss://chat.example.com/ws',
  reconnect: true,
});

await client.connect();

// Subscribe to messages with typed handler
const unsubscribe = client.onChatMessages((message) => {
  console.log(`${message.userId}: ${message.text}`);
});

// Publish a message
client.sendChatMessages({ text: 'Hello, world!' });

// Typing indicators
client.sendChatTyping({ isTyping: true });
client.onChatTyping((event) => {
  console.log(`${event.userId} is typing: ${event.isTyping}`);
});

// Disconnect when done
client.disconnect();
```

## Generated Structure

```
ws-sdk/
  package.json         # Dependencies (ws)
  tsconfig.json
  src/
    client.ts          # WebSocket client with channel methods
    types.ts           # Message type interfaces
    index.ts           # Re-exports
```

## AsyncAPI Spec Example

```yaml
asyncapi: '2.6.0'
info:
  title: Chat WebSocket API
  version: 1.0.0

servers:
  production:
    url: wss://chat.example.com/ws
    protocol: ws

channels:
  chat/messages:
    subscribe:
      operationId: onMessage
      message:
        payload:
          type: object
          properties:
            userId:
              type: string
            text:
              type: string
    publish:
      operationId: sendMessage
      message:
        payload:
          type: object
          properties:
            text:
              type: string
```

## CLI Options

```bash
# Initialize a new project
cortex init my-project

# Then edit cortex.config.yml to add your API sources

# Generate from config
cortex generate
```

## Features

- **Auto-reconnection** with configurable interval and max attempts
- **Channel-based subscriptions** — `onChannelName()` methods for each subscribe channel
- **Channel publishing** — `sendChannelName()` methods for each publish channel
- **Event emitter** — listen for `connected`, `disconnected`, `error`, and raw `message` events
- **Unsubscribe support** — every subscription returns a cleanup function
- **YAML and JSON** AsyncAPI specs supported
