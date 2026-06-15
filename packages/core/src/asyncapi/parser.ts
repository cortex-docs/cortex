import * as fs from 'node:fs';
import * as yaml from 'js-yaml';
import type { SchemaObject } from '../openapi/types';
import type {
  AsyncApiSpec,
  AsyncApiServer,
  AsyncApiChannel,
  AsyncApiOperation,
} from './types';

/** Raw parsed AsyncAPI document before transformation. */
interface RawAsyncApiDocument {
  asyncapi?: string;
  info?: {
    title?: string;
    version?: string;
    description?: string;
  };
  servers?: Record<string, RawAsyncApiServer>;
  channels?: Record<string, RawAsyncApiChannelV2 | RawAsyncApiChannelV3>;
  operations?: Record<string, RawAsyncApiOperationV3>;
  components?: {
    schemas?: Record<string, RawSchemaObject>;
  };
}

interface RawAsyncApiServer {
  url?: string;
  host?: string;
  protocol?: string;
  description?: string;
}

interface RawAsyncApiChannelV2 {
  description?: string;
  subscribe?: RawAsyncApiOperation;
  publish?: RawAsyncApiOperation;
}

interface RawAsyncApiChannelV3 {
  address?: string;
  description?: string;
}

interface RawAsyncApiOperation {
  operationId?: string;
  summary?: string;
  title?: string;
  description?: string;
  message?: RawAsyncApiMessage;
  messages?: Record<string, RawAsyncApiMessage>;
}

interface RawAsyncApiOperationV3 extends RawAsyncApiOperation {
  action?: string;
  channel?: { $ref?: string } | string;
}

interface RawAsyncApiMessage {
  name?: string;
  title?: string;
  description?: string;
  contentType?: string;
  payload?: RawSchemaObject;
}

interface RawSchemaObject {
  type?: string;
  format?: string;
  description?: string;
  required?: string[];
  properties?: Record<string, RawSchemaObject>;
  items?: RawSchemaObject;
  enum?: (string | number)[];
  payload?: RawSchemaObject;
}

export class AsyncAPIParser {
  async parse(specPath: string): Promise<AsyncApiSpec> {
    const content = await this.loadContent(specPath);
    const raw = typeof content === 'string' ? this.parseContent(content, specPath) : content;

    const asyncapiVersion = raw.asyncapi ?? '2.0.0';
    const isV3 = asyncapiVersion.startsWith('3.');

    return {
      title: raw.info?.title ?? 'Untitled',
      version: raw.info?.version ?? '0.0.0',
      description: raw.info?.description,
      servers: this.extractServers(raw.servers, isV3),
      channels: isV3
        ? this.extractChannelsV3(
            raw.channels as Record<string, RawAsyncApiChannelV3> | undefined,
            raw.operations,
          )
        : this.extractChannelsV2(raw.channels as Record<string, RawAsyncApiChannelV2> | undefined),
      schemas: this.extractSchemas(raw.components?.schemas),
    };
  }

  private async loadContent(specPath: string): Promise<string> {
    if (specPath.startsWith('http://') || specPath.startsWith('https://')) {
      const res = await fetch(specPath);
      if (!res.ok) throw new Error(`Failed to fetch ${specPath}: ${res.status}`);
      return res.text();
    }
    return fs.readFileSync(specPath, 'utf-8');
  }

  private parseContent(content: string, specPath: string): RawAsyncApiDocument {
    if (specPath.endsWith('.json') || content.trimStart().startsWith('{')) {
      return JSON.parse(content) as RawAsyncApiDocument;
    }
    return yaml.load(content) as RawAsyncApiDocument;
  }

  private extractServers(
    servers?: Record<string, RawAsyncApiServer>,
    isV3 = false,
  ): AsyncApiServer[] {
    if (!servers) return [];
    return Object.values(servers).map((s) => ({
      url: isV3 ? (s.host ?? s.url ?? '') : (s.url ?? ''),
      protocol: s.protocol ?? 'ws',
      description: s.description,
    }));
  }

  // AsyncAPI 2.x: channels have inline subscribe/publish
  private extractChannelsV2(channels?: Record<string, RawAsyncApiChannelV2>): AsyncApiChannel[] {
    if (!channels) return [];

    return Object.entries(channels).map(([name, ch]) => ({
      name,
      description: ch.description,
      subscribe: ch.subscribe ? this.extractOperation(ch.subscribe) : undefined,
      publish: ch.publish ? this.extractOperation(ch.publish) : undefined,
    }));
  }

  // AsyncAPI 3.x: channels are separate, operations reference channels via $ref or channel key
  private extractChannelsV3(
    channels?: Record<string, RawAsyncApiChannelV3>,
    operations?: Record<string, RawAsyncApiOperationV3>,
  ): AsyncApiChannel[] {
    if (!channels) return [];

    const channelMap = new Map<string, AsyncApiChannel>();

    for (const [name, ch] of Object.entries(channels)) {
      channelMap.set(name, {
        name: ch.address ?? name,
        description: ch.description,
      });
    }

    if (operations) {
      for (const [, op] of Object.entries(operations)) {
        const action = op.action;
        const channelField = op.channel;
        const channelRef = typeof channelField === 'object' && channelField !== null
          ? channelField.$ref ?? undefined
          : typeof channelField === 'string'
            ? channelField
            : undefined;
        const channelKey = typeof channelRef === 'string'
          ? channelRef.replace('#/channels/', '')
          : undefined;

        if (!channelKey || !channelMap.has(channelKey)) continue;

        const channel = channelMap.get(channelKey)!;
        const parsedOp = this.extractOperation(op);

        if (action === 'receive') {
          channel.subscribe = parsedOp;
        } else if (action === 'send') {
          channel.publish = parsedOp;
        }
      }
    }

    return Array.from(channelMap.values());
  }

  private extractOperation(op: RawAsyncApiOperation): AsyncApiOperation {
    const message = op.message ?? op.messages?.[Object.keys(op.messages ?? {})[0]];
    const rawPayload = message?.payload;
    const schemaInput = rawPayload?.type
      ? rawPayload
      : rawPayload?.payload ?? undefined;
    return {
      operationId: op.operationId,
      summary: op.summary ?? op.title,
      description: op.description,
      message: {
        name: message?.name,
        title: message?.title,
        description: message?.description,
        contentType: message?.contentType ?? 'application/json',
        schema: this.convertSchema(schemaInput),
      },
    };
  }

  private extractSchemas(schemas?: Record<string, RawSchemaObject>): Map<string, SchemaObject> {
    const result = new Map<string, SchemaObject>();
    if (!schemas) return result;

    for (const [name, schema] of Object.entries(schemas)) {
      result.set(name, { name, ...this.convertSchema(schema) });
    }
    return result;
  }

  private convertSchema(schema?: RawSchemaObject): SchemaObject {
    if (!schema) return { type: 'unknown' };

    const result: SchemaObject = {
      type: schema.type,
      format: schema.format,
      description: schema.description,
      enum: schema.enum,
    };

    if (schema.required) result.required = schema.required;

    if (schema.properties) {
      result.properties = {};
      for (const [key, value] of Object.entries(schema.properties)) {
        result.properties[key] = this.convertSchema(value);
      }
    }

    if (schema.items) {
      result.items = this.convertSchema(schema.items);
    }

    return result;
  }
}
