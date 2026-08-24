import * as fs from 'node:fs';
import * as yaml from 'js-yaml';
import type { SchemaObject } from '../openapi/types';
import type { AsyncApiSpec, AsyncApiServer, AsyncApiChannel, AsyncApiOperation } from './types';

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
    messages?: Record<string, RawAsyncApiMessage>;
  };
}

interface RawAsyncApiServer {
  url?: string;
  host?: string;
  pathname?: string;
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
  messages?: Record<string, RawAsyncApiMessage>;
}

interface RawAsyncApiOperation {
  operationId?: string;
  summary?: string;
  title?: string;
  description?: string;
  message?: RawAsyncApiMessage;
  messages?: RawAsyncApiMessage[] | Record<string, RawAsyncApiMessage>;
}

interface RawAsyncApiOperationV3 extends RawAsyncApiOperation {
  action?: string;
  channel?: { $ref?: string } | string;
}

interface RawAsyncApiMessage {
  $ref?: string;
  oneOf?: RawAsyncApiMessage[];
  name?: string;
  title?: string;
  summary?: string;
  description?: string;
  contentType?: string;
  payload?: RawSchemaObject;
}

interface RawSchemaObject {
  $ref?: string;
  type?: string;
  const?: string | number;
  format?: string;
  description?: string;
  required?: string[];
  properties?: Record<string, RawSchemaObject>;
  items?: RawSchemaObject;
  enum?: (string | number)[];
  payload?: RawSchemaObject;
  schema?: RawSchemaObject;
  additionalProperties?: boolean | RawSchemaObject;
  oneOf?: RawSchemaObject[];
  anyOf?: RawSchemaObject[];
  allOf?: RawSchemaObject[];
  nullable?: boolean;
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
            raw,
          )
        : this.extractChannelsV2(
            raw.channels as Record<string, RawAsyncApiChannelV2> | undefined,
            raw,
          ),
      schemas: this.extractSchemas(raw.components?.schemas, raw),
    };
  }

  private async loadContent(specPath: string): Promise<string> {
    if (specPath.startsWith('http://') || specPath.startsWith('https://')) {
      const res = await fetch(specPath, { signal: AbortSignal.timeout(30_000) });
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
      url: isV3 ? this.buildV3ServerUrl(s) : this.buildV2ServerUrl(s),
      protocol: s.protocol ?? 'ws',
      description: s.description,
    }));
  }

  private buildV2ServerUrl(server: RawAsyncApiServer): string {
    const url = server.url ?? '';
    if (!url || /^[a-z][a-z\d+.-]*:\/\//i.test(url)) return url;
    if (url.startsWith('//')) return `${server.protocol ?? 'ws'}:${url}`;
    return `${server.protocol ?? 'ws'}://${url}`;
  }

  private buildV3ServerUrl(server: RawAsyncApiServer): string {
    if (server.url) return server.url;
    if (!server.host) return '';
    const host = /^[a-z][a-z\d+.-]*:\/\//i.test(server.host)
      ? server.host
      : `${server.protocol ?? 'ws'}://${server.host}`;
    return `${host.replace(/\/$/, '')}${server.pathname ?? ''}`;
  }

  // AsyncAPI 2.x: channels have inline subscribe/publish
  private extractChannelsV2(
    channels: Record<string, RawAsyncApiChannelV2> | undefined,
    raw: RawAsyncApiDocument,
  ): AsyncApiChannel[] {
    if (!channels) return [];

    return Object.entries(channels).map(([name, ch]) => ({
      name,
      description: ch.description,
      subscribe: ch.subscribe ? this.extractOperation(ch.subscribe, raw) : undefined,
      publish: ch.publish ? this.extractOperation(ch.publish, raw) : undefined,
    }));
  }

  // AsyncAPI 3.x: channels are separate, operations reference channels via $ref or channel key
  private extractChannelsV3(
    channels?: Record<string, RawAsyncApiChannelV3>,
    operations?: Record<string, RawAsyncApiOperationV3>,
    raw?: RawAsyncApiDocument,
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
      for (const [operationKey, op] of Object.entries(operations)) {
        const action = op.action;
        const channelField = op.channel;
        const channelRef =
          typeof channelField === 'object' && channelField !== null
            ? (channelField.$ref ?? undefined)
            : typeof channelField === 'string'
              ? channelField
              : undefined;
        const channelKey =
          typeof channelRef === 'string' ? channelRef.replace('#/channels/', '') : undefined;

        if (!channelKey || !channelMap.has(channelKey)) continue;

        const channel = channelMap.get(channelKey)!;
        const parsedOp = this.extractOperation(
          { ...op, operationId: op.operationId ?? operationKey },
          raw ?? {},
        );

        if (action === 'receive') {
          channel.subscribe = parsedOp;
        } else if (action === 'send') {
          channel.publish = parsedOp;
        }
      }
    }

    return Array.from(channelMap.values());
  }

  private extractOperation(op: RawAsyncApiOperation, raw: RawAsyncApiDocument): AsyncApiOperation {
    const messageCandidate = this.firstMessage(op);
    const message = this.resolveLocalReference<RawAsyncApiMessage>(messageCandidate, raw);
    const rawPayload = message?.payload;
    const schemaInput = rawPayload?.schema ?? rawPayload?.payload ?? rawPayload;
    return {
      operationId: op.operationId,
      summary: op.summary ?? op.title,
      description: op.description,
      message: {
        name: message?.name ?? this.referenceName(messageCandidate),
        title: message?.title ?? message?.summary,
        description: message?.description ?? message?.summary ?? message?.title,
        contentType: message?.contentType ?? 'application/json',
        schema: this.convertSchema(schemaInput, raw),
      },
    };
  }

  private firstMessage(op: RawAsyncApiOperation): RawAsyncApiMessage | undefined {
    if (op.message) return op.message.oneOf?.[0] ?? op.message;
    if (Array.isArray(op.messages)) return op.messages[0];
    if (op.messages) return Object.values(op.messages)[0];
    return undefined;
  }

  private referenceName(value?: { $ref?: string }): string | undefined {
    return value?.$ref?.split('/').pop();
  }

  private resolveLocalReference<T>(value: T | undefined, raw: RawAsyncApiDocument): T | undefined {
    let current: unknown = value;
    const seen = new Set<string>();

    while (current && typeof current === 'object' && '$ref' in current) {
      const ref = (current as { $ref?: unknown }).$ref;
      if (typeof ref !== 'string' || !ref.startsWith('#/') || seen.has(ref)) break;
      seen.add(ref);

      let resolved: unknown = raw;
      for (const part of ref
        .slice(2)
        .split('/')
        .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))) {
        if (!resolved || typeof resolved !== 'object') return current as T;
        resolved = (resolved as Record<string, unknown>)[part];
      }
      if (resolved === undefined) break;
      current = resolved;
    }

    return current as T | undefined;
  }

  private extractSchemas(
    schemas: Record<string, RawSchemaObject> | undefined,
    raw: RawAsyncApiDocument,
  ): Map<string, SchemaObject> {
    const result = new Map<string, SchemaObject>();
    if (!schemas) return result;

    for (const [name, schema] of Object.entries(schemas)) {
      result.set(name, { name, ...this.convertSchema(schema, raw) });
    }
    return result;
  }

  private convertSchema(
    schema: RawSchemaObject | undefined,
    raw: RawAsyncApiDocument,
    resolving = new Set<string>(),
  ): SchemaObject {
    if (!schema) return { type: 'unknown' };

    if (schema.$ref) {
      if (resolving.has(schema.$ref)) return { ref: schema.$ref, type: 'object' };
      const resolved = this.resolveLocalReference<RawSchemaObject>(schema, raw);
      if (!resolved || resolved === schema) return { ref: schema.$ref, type: 'unknown' };
      const nextResolving = new Set(resolving).add(schema.$ref);
      return { ...this.convertSchema(resolved, raw, nextResolving), ref: schema.$ref };
    }

    const result: SchemaObject = {
      type: schema.type,
      format: schema.format,
      description: schema.description,
      enum: schema.enum ?? (schema.const !== undefined ? [schema.const] : undefined),
      nullable: schema.nullable,
    };

    if (schema.required) result.required = schema.required;

    if (schema.properties) {
      result.properties = {};
      for (const [key, value] of Object.entries(schema.properties)) {
        result.properties[key] = this.convertSchema(value, raw, resolving);
      }
    }

    if (schema.items) {
      result.items = this.convertSchema(schema.items, raw, resolving);
    }

    if (schema.additionalProperties !== undefined) {
      result.additionalProperties =
        typeof schema.additionalProperties === 'boolean'
          ? schema.additionalProperties
          : this.convertSchema(schema.additionalProperties, raw, resolving);
    }
    if (schema.oneOf) {
      result.oneOf = schema.oneOf.map((value) => this.convertSchema(value, raw, resolving));
    }
    if (schema.anyOf) {
      result.anyOf = schema.anyOf.map((value) => this.convertSchema(value, raw, resolving));
    }
    if (schema.allOf) {
      result.allOf = schema.allOf.map((value) => this.convertSchema(value, raw, resolving));
    }

    return result;
  }
}
