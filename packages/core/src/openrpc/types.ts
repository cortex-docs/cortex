export interface OpenRpcSpec {
  openrpc: string;
  title: string;
  version: string;
  description?: string;
  servers: OpenRpcServer[];
  methods: OpenRpcMethod[];
  schemas: Map<string, OpenRpcSchema>;
  errors: OpenRpcErrorDef[];
  sourceContent?: string;
}

export interface OpenRpcServer {
  name?: string;
  url: string;
  description?: string;
}

export interface OpenRpcMethod {
  name: string;
  summary?: string;
  description?: string;
  params: OpenRpcParam[];
  result?: OpenRpcResult;
  tags: string[];
  errors: OpenRpcErrorRef[];
  deprecated?: boolean;
}

export interface OpenRpcParam {
  name: string;
  description?: string;
  required: boolean;
  schema: OpenRpcSchema;
}

export interface OpenRpcResult {
  name: string;
  description?: string;
  schema: OpenRpcSchema;
}

export interface OpenRpcSchema {
  type?: string;
  description?: string;
  properties?: Record<string, OpenRpcSchema>;
  items?: OpenRpcSchema;
  required?: string[];
  enum?: (string | number)[];
  ref?: string;
  format?: string;
  nullable?: boolean;
  oneOf?: OpenRpcSchema[];
  anyOf?: OpenRpcSchema[];
  allOf?: OpenRpcSchema[];
  additionalProperties?: OpenRpcSchema | boolean;
  default?: unknown;
}

export interface OpenRpcErrorDef {
  code: number;
  message: string;
  data?: OpenRpcSchema;
}

export interface OpenRpcErrorRef {
  code: number;
  message: string;
}
