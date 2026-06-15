import type { Operation, SchemaObject, AsyncApiChannel, GraphQLOperation, GraphQLField, GrpcService, GrpcMethod, GrpcMessage } from '@cortex/core';

export interface McpTool {
  name: string;
  description: string;
  inputSchema: McpInputSchema;
  source: 'rest' | 'websocket' | 'graphql' | 'grpc';
  method?: string;
  path?: string;
  channelName?: string;
  operationType?: string;
  serviceName?: string;
  operation?: Operation;
  channel?: AsyncApiChannel;
}

export interface McpInputSchema {
  type: 'object';
  properties: Record<string, McpPropertySchema>;
  required: string[];
}

export interface McpPropertySchema {
  type: string;
  description?: string;
  enum?: (string | number)[];
  items?: McpPropertySchema;
}

export function mapOperationsToTools(operations: Operation[]): McpTool[] {
  return operations.map((op) => ({
    name: buildToolName(op),
    description: op.summary ?? op.description ?? `${op.method.toUpperCase()} ${op.path}`,
    inputSchema: buildInputSchema(op),
    source: 'rest' as const,
    method: op.method.toUpperCase(),
    path: op.path,
    operation: op,
  }));
}

export function mapChannelsToTools(channels: AsyncApiChannel[]): McpTool[] {
  const tools: McpTool[] = [];

  for (const channel of channels) {
    if (channel.publish) {
      const schema = channel.publish.message.schema;
      const properties: Record<string, McpPropertySchema> = {};
      const required: string[] = [];

      if (schema.properties) {
        for (const [name, propSchema] of Object.entries(schema.properties)) {
          properties[name] = schemaToMcpProperty(propSchema, propSchema.description);
        }
        if (schema.required) required.push(...schema.required);
      }

      tools.push({
        name: `ws_send_${channel.name.replace(/[^a-zA-Z0-9]/g, '_')}`,
        description: channel.publish.summary ?? `Send message to ${channel.name}`,
        inputSchema: { type: 'object', properties, required },
        source: 'websocket',
        channelName: channel.name,
        channel,
      });
    }

    if (channel.subscribe) {
      tools.push({
        name: `ws_describe_${channel.name.replace(/[^a-zA-Z0-9]/g, '_')}`,
        description: `Describe the ${channel.name} WebSocket channel. ${channel.subscribe.summary ?? ''}`.trim(),
        inputSchema: { type: 'object', properties: {}, required: [] },
        source: 'websocket',
        channelName: channel.name,
        channel,
      });
    }
  }

  return tools;
}

function buildToolName(op: Operation): string {
  if (op.extensions['method-name'] && op.extensions['resource']) {
    return `${op.extensions['resource']}_${op.extensions['method-name']}`;
  }
  return op.operationId.replace(/[^a-zA-Z0-9_]/g, '_');
}

function buildInputSchema(op: Operation): McpInputSchema {
  const properties: Record<string, McpPropertySchema> = {};
  const required: string[] = [];

  for (const param of op.parameters) {
    properties[param.name] = schemaToMcpProperty(param.schema, param.description);
    if (param.required) {
      required.push(param.name);
    }
  }

  if (op.requestBody?.schema) {
    const bodySchema = op.requestBody.schema;
    if (bodySchema.properties) {
      for (const [name, propSchema] of Object.entries(bodySchema.properties)) {
        properties[name] = schemaToMcpProperty(propSchema, propSchema.description);
      }
      if (bodySchema.required) {
        required.push(...bodySchema.required);
      }
    } else {
      properties['body'] = { type: 'object', description: 'Request body' };
      if (op.requestBody.required) {
        required.push('body');
      }
    }
  }

  return { type: 'object', properties, required };
}

function schemaToMcpProperty(schema: SchemaObject, description?: string): McpPropertySchema {
  const result: McpPropertySchema = {
    type: mapSchemaType(schema.type),
  };

  if (description ?? schema.description) {
    result.description = description ?? schema.description;
  }

  if (schema.enum) {
    result.enum = schema.enum;
  }

  if (schema.items) {
    result.items = schemaToMcpProperty(schema.items);
  }

  return result;
}

function mapSchemaType(type?: string): string {
  switch (type) {
    case 'integer': return 'number';
    case 'array': return 'array';
    case 'boolean': return 'boolean';
    case 'object': return 'object';
    case 'string': default: return 'string';
  }
}

function gqlTypeToMcpType(type: string): string {
  const base = type.replace(/[!\[\]]/g, '');
  switch (base) {
    case 'Int':
    case 'Float': return 'number';
    case 'Boolean': return 'boolean';
    case 'ID':
    case 'String': return 'string';
    default: return 'string';
  }
}

export function mapGraphQLToTools(
  queries: GraphQLOperation[],
  mutations: GraphQLOperation[],
  subscriptions: GraphQLOperation[],
): McpTool[] {
  const tools: McpTool[] = [];

  const mapOps = (ops: GraphQLOperation[], prefix: string, label: string) => {
    for (const op of ops) {
      const properties: Record<string, McpPropertySchema> = {};
      const required: string[] = [];

      for (const arg of op.args) {
        properties[arg.name] = {
          type: gqlTypeToMcpType(arg.type),
          description: arg.description,
        };
        if (arg.required) required.push(arg.name);
      }

      tools.push({
        name: `gql_${prefix}_${op.name}`,
        description: op.description ?? `GraphQL ${label}: ${op.name}`,
        inputSchema: { type: 'object', properties, required },
        source: 'graphql',
        operationType: label,
      });
    }
  };

  mapOps(queries, 'query', 'query');
  mapOps(mutations, 'mutation', 'mutation');
  mapOps(subscriptions, 'subscribe', 'subscription');

  return tools;
}

export function mapGrpcToTools(services: GrpcService[], messages: GrpcMessage[]): McpTool[] {
  const tools: McpTool[] = [];
  const msgMap = new Map(messages.map((m) => [m.name, m]));

  for (const svc of services) {
    for (const method of svc.methods) {
      const properties: Record<string, McpPropertySchema> = {};
      const required: string[] = [];

      const inputMsg = msgMap.get(method.inputType);
      if (inputMsg) {
        for (const field of inputMsg.fields) {
          properties[field.name] = {
            type: field.repeated ? 'array' : grpcFieldType(field.type),
            description: field.description,
          };
          if (!field.optional) required.push(field.name);
        }
      }

      const streamLabel = method.serverStreaming && method.clientStreaming ? ' (bidirectional stream)'
        : method.serverStreaming ? ' (server stream)'
        : method.clientStreaming ? ' (client stream)'
        : '';

      tools.push({
        name: `grpc_${svc.name}_${method.name}`,
        description: (method.description ?? `gRPC ${svc.name}.${method.name}`) + streamLabel,
        inputSchema: { type: 'object', properties, required },
        source: 'grpc',
        serviceName: svc.name,
      });
    }
  }

  return tools;
}

function grpcFieldType(type: string): string {
  switch (type) {
    case 'int32': case 'int64': case 'uint32': case 'uint64':
    case 'sint32': case 'sint64': case 'fixed32': case 'fixed64':
    case 'sfixed32': case 'sfixed64': case 'float': case 'double':
      return 'number';
    case 'bool': return 'boolean';
    case 'bytes': return 'string';
    default: return 'string';
  }
}
