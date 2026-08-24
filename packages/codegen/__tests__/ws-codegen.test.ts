import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { AsyncAPIParser } from '@cortex-docs/core';
import { WsTemplateEngine } from '../src/languages/ws-template-plugin';
import { createWsPluginForLanguage } from '../src/languages/ws-template-plugin';
import type { WebSocketHeartbeatConfig } from '@cortex-docs/core';

const ASYNCAPI_FIXTURE = path.join(__dirname, '../../core/__fixtures__/chat-asyncapi.yaml');

async function generateWs(language = 'typescript', heartbeat?: WebSocketHeartbeatConfig) {
  const parser = new AsyncAPIParser();
  const spec = await parser.parse(ASYNCAPI_FIXTURE);
  const engine = new WsTemplateEngine();
  const langConfig = createWsPluginForLanguage(language)!;
  return engine.generate(spec, `@test/${language}-ws`, '0.1.0', langConfig, undefined, heartbeat);
}

describe('WebSocket Codegen — TypeScript', () => {
  it('generates typed channel methods from AsyncAPI payloads', async () => {
    const files = await generateWs();
    const client = files.find((file) => file.path === 'src/ws-client.ts')!;

    expect(client.content).toContain("import type * as Types from './ws-types.js';");
    expect(client.content).toContain(
      'onChatPresence(handler: MessageHandler<Types.ChatPresenceMessage>): () => void',
    );
    expect(client.content).toContain('sendChatMessages(payload: Types.ChatMessagesPayload): void');
    expect(client.content).toContain('sendChatTyping(payload: Types.ChatTypingPayload): void');
  });
});

describe('WebSocket Codegen — resilience', () => {
  const languages = [
    'typescript',
    'python',
    'go',
    'java',
    'kotlin',
    'ruby',
    'php',
    'csharp',
    'rust',
    'cpp',
    'c',
  ];

  for (const language of languages) {
    it(`${language} exposes configurable reconnect and heartbeat behavior`, async () => {
      const files = await generateWs(language);
      const client = files.find((file) => file.path.includes('ws-client'))!;
      expect(client.content.toLowerCase()).toContain('reconnect');
      expect(client.content.toLowerCase()).toContain('heartbeat');
    });
  }

  const heartbeat: WebSocketHeartbeatConfig = {
    enabled: true,
    format: 'json',
    interval_ms: 12_000,
    timeout_ms: 4_000,
    client: {
      message: { action: 'client-heartbeat' },
      response: { action: 'server-alive' },
    },
    server: {
      message: { action: 'server-heartbeat' },
      response: { action: 'client-alive' },
    },
  };

  for (const language of languages) {
    it(`${language} embeds the project heartbeat protocol`, async () => {
      const files = await generateWs(language, heartbeat);
      const client = files.find((file) => file.path.includes('ws-client'))!;
      expect(client.content).toContain('client-heartbeat');
      expect(client.content).toContain('server-alive');
      expect(client.content).toContain('server-heartbeat');
      expect(client.content).toContain('client-alive');
    });
  }

  it('disables application heartbeat when the source has no heartbeat config', async () => {
    const files = await generateWs('typescript');
    const client = files.find((file) => file.path === 'src/ws-client.ts')!;
    expect(client.content).toContain('heartbeatInterval: options.heartbeatInterval ?? 0');
    expect(client.content).not.toContain("{ type: 'ping' }");
  });

  it('makes C# disconnect safe after a remote close', async () => {
    const files = await generateWs('csharp', heartbeat);
    const client = files.find((file) => file.path.includes('ws-client'))!;
    expect(client.content).toContain('catch (WebSocketException) { }');
    expect(client.content).toContain('catch (ObjectDisposedException) { }');
    expect(client.content).toContain('if (!_shouldReconnect) return;');
  });
});
