import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { AsyncAPIParser } from '@cortex/core';
import { WsTemplateEngine } from '../src/languages/ws-template-plugin';
import { createWsPluginForLanguage } from '../src/languages/ws-template-plugin';

const ASYNCAPI_FIXTURE = path.join(__dirname, '../../core/__fixtures__/chat-asyncapi.yaml');

async function generateTypeScriptWs() {
  const parser = new AsyncAPIParser();
  const spec = await parser.parse(ASYNCAPI_FIXTURE);
  const engine = new WsTemplateEngine();
  const langConfig = createWsPluginForLanguage('typescript')!;
  return engine.generate(spec, '@test/typescript-ws', '0.1.0', langConfig);
}

describe('WebSocket Codegen — TypeScript', () => {
  it('generates typed channel methods from AsyncAPI payloads', async () => {
    const files = await generateTypeScriptWs();
    const client = files.find((file) => file.path === 'src/ws-client.ts')!;

    expect(client.content).toContain("import type * as Types from './ws-types';");
    expect(client.content).toContain(
      'onChatPresence(handler: MessageHandler<Types.ChatPresenceMessage>): () => void',
    );
    expect(client.content).toContain('sendChatMessages(payload: Types.ChatMessagesPayload): void');
    expect(client.content).toContain('sendChatTyping(payload: Types.ChatTypingPayload): void');
  });
});
