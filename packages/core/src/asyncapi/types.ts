import type { SchemaObject } from '../openapi/types';

export interface AsyncApiSpec {
  title: string;
  version: string;
  description?: string;
  servers: AsyncApiServer[];
  channels: AsyncApiChannel[];
  schemas: Map<string, SchemaObject>;
}

export interface AsyncApiServer {
  url: string;
  protocol: string;
  description?: string;
}

export interface AsyncApiChannel {
  name: string;
  description?: string;
  subscribe?: AsyncApiOperation;
  publish?: AsyncApiOperation;
}

export interface AsyncApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  message: AsyncApiMessage;
}

export interface AsyncApiMessage {
  name?: string;
  title?: string;
  description?: string;
  contentType?: string;
  schema: SchemaObject;
}
