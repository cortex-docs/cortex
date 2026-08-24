import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { AsyncAPIParser } from '../src/asyncapi/parser';
import { GraphQLParser } from '../src/graphql/parser';
import { GrpcParser } from '../src/grpc/parser';
import { OpenRpcParser } from '../src/openrpc/parser';

const fixture = (name: string): string => path.join(__dirname, '../__fixtures__', name);

describe('protocol parser standards compatibility', () => {
  it('uses declared GraphQL root types and accepts directives and multiline arguments', async () => {
    const spec = await new GraphQLParser().parse(fixture('graphql-standards.graphql'));

    expect(spec.queries.map((operation) => operation.name)).toEqual(['id', 'search']);
    expect(spec.mutations.map((operation) => operation.name)).toEqual(['rename']);
    expect(spec.queries[1]).toMatchObject({
      returnType: 'SearchResult',
      returnTypeRaw: '[SearchResult!]!',
    });
    expect(spec.queries[1].args).toMatchObject([
      { name: 'text', typeRaw: 'String!', required: true },
      { name: 'limit', typeRaw: 'Int', required: false },
    ]);
    expect(spec.types.map((type) => type.name)).toEqual(
      expect.arrayContaining(['Node', 'SearchResult', 'SearchEntity']),
    );
    expect(spec.scalars).toEqual(['DateTime']);
  });

  it('parses unary and streaming gRPC methods with option blocks and qualified types', async () => {
    const spec = await new GrpcParser().parse(fixture('grpc-standards.proto'));
    const methods = spec.services[0].methods;

    expect(methods).toHaveLength(4);
    expect(methods[3]).toMatchObject({
      inputType: 'compatibility.v1.Request',
      outputType: 'compatibility.v1.Response',
      clientStreaming: true,
      serverStreaming: true,
    });
    expect(spec.messages[0].fields[1]).toMatchObject({
      type: 'map',
      mapKeyType: 'string',
      mapValueType: 'compatibility.v1.Response',
    });
    expect(spec.enums[0].values.at(-1)).toEqual({ name: 'RESULT_LEGACY', number: -1 });
  });

  it('resolves AsyncAPI 3 channel and component message references', async () => {
    const spec = await new AsyncAPIParser().parse(fixture('asyncapi-v3-refs.yaml'));
    const operation = spec.channels[0].subscribe;

    expect(spec.servers[0].url).toBe('wss://events.example.com/stream');
    expect(operation?.operationId).toBe('receiveCreated');
    expect(operation?.message.name).toBe('created');
    expect(operation?.message.schema).toMatchObject({
      type: 'object',
      ref: '#/components/schemas/CreatedEvent',
      required: ['id'],
    });
    expect(operation?.message.schema.properties?.id.type).toBe('string');
  });

  it('normalizes AsyncAPI 2 server URLs and accepts message oneOf', async () => {
    const spec = await new AsyncAPIParser().parse(fixture('asyncapi-v2-server.yaml'));

    expect(spec.servers[0]).toMatchObject({
      url: 'wss://socket.example.com/events',
      protocol: 'wss',
    });
    expect(spec.channels[0].publish?.message.schema.properties?.event).toMatchObject({
      type: 'string',
      enum: ['ping'],
    });
  });

  it('accepts OpenRPC documents across the 1.x specification line', async () => {
    const spec = await new OpenRpcParser().parse(fixture('openrpc-v1.json'));

    expect(spec.openrpc).toBe('1.0.0');
    expect(spec.methods.map((method) => method.name)).toEqual(['ping']);
  });
});
