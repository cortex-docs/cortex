import type {
  AsyncApiSpec,
  CortexConfig,
  GraphQLSpec,
  GrpcSpec,
  OpenRpcSpec,
  ParsedSpec,
  Resource,
  ResourceExtension,
  SchemaObject,
} from '@cortex/core';

function duplicateError(kind: string, name: string): Error {
  return new Error(`Cannot merge sources: duplicate ${kind} "${name}".`);
}

function uniqueBy<T>(items: T[], kind: string, key: (item: T) => string): T[] {
  const result = new Map<string, T>();
  for (const item of items) {
    const name = key(item);
    if (result.has(name)) throw duplicateError(kind, name);
    result.set(name, item);
  }
  return Array.from(result.values());
}

function mergeMap<T>(maps: Map<string, T>[], kind: string): Map<string, T> {
  const result = new Map<string, T>();
  for (const map of maps) {
    for (const [name, value] of map) {
      if (result.has(name)) throw duplicateError(kind, name);
      result.set(name, value);
    }
  }
  return result;
}

function groupResources(specs: ParsedSpec[]): Resource[] {
  const groups = new Map<string, Resource>();
  for (const spec of specs) {
    for (const resource of spec.resources) {
      const existing = groups.get(resource.name);
      if (existing) {
        existing.operations.push(...resource.operations);
      } else {
        groups.set(resource.name, { ...resource, operations: [...resource.operations] });
      }
    }
  }
  return Array.from(groups.values());
}

function mergeResourceExtensions(specs: ParsedSpec[]): Map<string, ResourceExtension> {
  const result = new Map<string, ResourceExtension>();
  for (const spec of specs) {
    for (const [name, extension] of spec.extensions.resources) {
      const existing = result.get(name);
      if (!existing) {
        result.set(name, { ...extension, methodNames: new Map(extension.methodNames) });
        continue;
      }
      for (const [operation, methodName] of extension.methodNames) {
        if (existing.methodNames.has(operation))
          throw duplicateError('operation extension', operation);
        existing.methodNames.set(operation, methodName);
      }
    }
  }
  return result;
}

function description(values: Array<string | undefined>): string | undefined {
  const unique = Array.from(new Set(values.filter((value): value is string => !!value)));
  return unique.length > 0 ? unique.join('\n\n') : undefined;
}

export function emptyParsedSpec(title: string): ParsedSpec {
  return {
    raw: {
      openapi: '3.1.0',
      info: { title, version: '1.0.0' },
      paths: {},
    },
    info: { title, version: '1.0.0', servers: [] },
    resources: [],
    operations: [],
    schemas: new Map<string, SchemaObject>(),
    extensions: { resources: new Map<string, ResourceExtension>() },
  };
}

export function mergeParsedSpecs(specs: ParsedSpec[], title: string): ParsedSpec | null {
  if (specs.length === 0) return null;
  if (specs.length === 1) return specs[0];

  const operations = uniqueBy(
    specs.flatMap((spec) => spec.operations),
    'OpenAPI operationId',
    (operation) => operation.operationId,
  );

  return {
    raw: specs[0].raw,
    info: {
      title,
      version: specs.map((spec) => spec.info.version).join('+'),
      description: description(specs.map((spec) => spec.info.description)),
      servers: uniqueBy(
        specs.flatMap((spec) => spec.info.servers),
        'OpenAPI server',
        (server) => server.url,
      ),
    },
    resources: groupResources(specs),
    operations,
    schemas: mergeMap(
      specs.map((spec) => spec.schemas),
      'OpenAPI schema',
    ),
    extensions: { resources: mergeResourceExtensions(specs) },
  };
}

export function mergeAsyncApiSpecs(specs: AsyncApiSpec[], title: string): AsyncApiSpec | null {
  if (specs.length === 0) return null;
  if (specs.length === 1) return specs[0];
  return {
    title,
    version: specs.map((spec) => spec.version).join('+'),
    description: description(specs.map((spec) => spec.description)),
    servers: uniqueBy(
      specs.flatMap((spec) => spec.servers),
      'AsyncAPI server',
      (server) => `${server.protocol}:${server.url}`,
    ),
    channels: uniqueBy(
      specs.flatMap((spec) => spec.channels),
      'AsyncAPI channel',
      (channel) => channel.name,
    ),
    schemas: mergeMap(
      specs.map((spec) => spec.schemas),
      'AsyncAPI schema',
    ),
  };
}

export function mergeGraphQLSpecs(specs: GraphQLSpec[], title: string): GraphQLSpec | null {
  if (specs.length === 0) return null;
  if (specs.length === 1) return specs[0];
  const endpoints = new Set(specs.map((spec) => spec.endpoint));
  if (endpoints.size > 1) {
    throw new Error('Cannot merge GraphQL sources that use different endpoints.');
  }
  return {
    title,
    version: specs.map((spec) => spec.version).join('+'),
    description: description(specs.map((spec) => spec.description)),
    endpoint: specs[0].endpoint,
    queries: uniqueBy(
      specs.flatMap((spec) => spec.queries),
      'GraphQL query',
      (item) => item.name,
    ),
    mutations: uniqueBy(
      specs.flatMap((spec) => spec.mutations),
      'GraphQL mutation',
      (item) => item.name,
    ),
    subscriptions: uniqueBy(
      specs.flatMap((spec) => spec.subscriptions),
      'GraphQL subscription',
      (item) => item.name,
    ),
    types: uniqueBy(
      specs.flatMap((spec) => spec.types),
      'GraphQL type',
      (item) => item.name,
    ),
    enums: uniqueBy(
      specs.flatMap((spec) => spec.enums),
      'GraphQL enum',
      (item) => item.name,
    ),
    inputs: uniqueBy(
      specs.flatMap((spec) => spec.inputs),
      'GraphQL input',
      (item) => item.name,
    ),
    scalars: [...new Set(specs.flatMap((spec) => spec.scalars ?? []))],
  };
}

function combineProtoSources(specs: GrpcSpec[]): string | undefined {
  const contents = specs
    .map((spec) => spec.sourceContent)
    .filter((value): value is string => !!value);
  if (contents.length === 0) return undefined;
  return contents
    .map((content, index) => {
      if (index === 0) return content.trim();
      return content
        .replace(/^\s*syntax\s*=\s*[^;]+;\s*$/gm, '')
        .replace(/^\s*package\s+[\w.]+\s*;\s*$/gm, '')
        .trim();
    })
    .join('\n\n');
}

export function mergeGrpcSpecs(specs: GrpcSpec[], title: string): GrpcSpec | null {
  if (specs.length === 0) return null;
  if (specs.length === 1) return specs[0];
  const packages = new Set(specs.map((spec) => spec.package));
  if (packages.size > 1) {
    throw new Error('Cannot merge gRPC sources that declare different protobuf packages.');
  }
  return {
    title,
    version: specs.map((spec) => spec.version).join('+'),
    package: specs[0].package,
    services: uniqueBy(
      specs.flatMap((spec) => spec.services),
      'gRPC service',
      (item) => item.name,
    ),
    messages: uniqueBy(
      specs.flatMap((spec) => spec.messages),
      'gRPC message',
      (item) => item.name,
    ),
    enums: uniqueBy(
      specs.flatMap((spec) => spec.enums),
      'gRPC enum',
      (item) => item.name,
    ),
    sourceContent: combineProtoSources(specs),
  };
}

export function mergeOpenRpcSpecs(specs: OpenRpcSpec[], title: string): OpenRpcSpec | null {
  if (specs.length === 0) return null;
  if (specs.length === 1) return specs[0];
  return {
    openrpc: specs[0].openrpc,
    title,
    version: specs.map((spec) => spec.version).join('+'),
    description: description(specs.map((spec) => spec.description)),
    servers: uniqueBy(
      specs.flatMap((spec) => spec.servers),
      'OpenRPC server',
      (server) => server.url,
    ),
    methods: uniqueBy(
      specs.flatMap((spec) => spec.methods),
      'OpenRPC method',
      (method) => method.name,
    ),
    schemas: mergeMap(
      specs.map((spec) => spec.schemas),
      'OpenRPC schema',
    ),
    errors: uniqueBy(
      specs.flatMap((spec) => spec.errors),
      'OpenRPC error',
      (error) => String(error.code),
    ),
    sourceContent: specs
      .map((spec) => spec.sourceContent)
      .filter((value): value is string => !!value)
      .join('\n'),
  };
}

export function sourceTitle(config: CortexConfig, protocol: string): string {
  return `${config.title ?? config.project} ${protocol}`;
}
