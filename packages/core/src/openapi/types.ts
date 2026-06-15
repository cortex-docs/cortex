import type { OpenAPIV3_1 } from 'openapi-types';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options';

export interface ServerInfo {
  url: string;
  description?: string;
}

export interface SpecInfo {
  title: string;
  version: string;
  description?: string;
  servers: ServerInfo[];
}

export interface Parameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required: boolean;
  description?: string;
  schema: SchemaObject;
}

export interface RequestBody {
  required: boolean;
  contentType: string;
  schema: SchemaObject;
}

export interface ResponseInfo {
  statusCode: string;
  description: string;
  contentType?: string;
  schema?: SchemaObject;
}

export interface Operation {
  operationId: string;
  method: HttpMethod;
  path: string;
  summary?: string;
  description?: string;
  parameters: Parameter[];
  requestBody?: RequestBody;
  responses: ResponseInfo[];
  tags: string[];
  resourceName: string;
  extensions: Record<string, unknown>;
}

export interface Resource {
  name: string;
  displayName: string;
  description?: string;
  operations: Operation[];
}

export interface SchemaObject {
  name?: string;
  type?: string;
  format?: string;
  description?: string;
  required?: string[];
  properties?: Record<string, SchemaObject>;
  items?: SchemaObject;
  enum?: (string | number)[];
  additionalProperties?: boolean | SchemaObject;
  oneOf?: SchemaObject[];
  anyOf?: SchemaObject[];
  allOf?: SchemaObject[];
  ref?: string;
  nullable?: boolean;
}

export interface ParsedSpec {
  raw: OpenAPIV3_1.Document;
  info: SpecInfo;
  resources: Resource[];
  operations: Operation[];
  schemas: Map<string, SchemaObject>;
  extensions: CortexExtensions;
}

export interface CortexExtensions {
  resources: Map<string, ResourceExtension>;
}

export interface ResourceExtension {
  name: string;
  methodNames: Map<string, string>;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationWarning {
  path: string;
  message: string;
}
