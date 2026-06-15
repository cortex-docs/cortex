import * as fs from 'node:fs';
import * as path from 'node:path';
import { NextResponse } from 'next/server';
import { renderSnippet } from '@cortex/codegen';

interface ParamInfo {
  name: string;
  type: string;
  description?: string;
}

interface QueryParamInfo extends ParamInfo {
  required: boolean;
}

interface BodyPropertyInfo {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  nullable?: boolean;
  children?: BodyPropertyInfo[];
}

interface LanguageNames {
  methodName: string;
  resourceAccess: string;
  bodyType: string;
  responseType: string;
}

interface ResponseExample {
  statusCode: string;
  description: string;
  typeName: string;
  example: unknown;
  properties?: BodyPropertyInfo[];
}

interface OperationInfo {
  operationId: string;
  method: string;
  path: string;
  summary?: string;
  pathParams: ParamInfo[];
  queryParams: QueryParamInfo[];
  headerParams: QueryParamInfo[];
  hasBody: boolean;
  bodyTypeName: string;
  bodyProperties: BodyPropertyInfo[];
  responseTypeName: string;
  responses: ResponseExample[];
  names: Record<string, LanguageNames>;
}

interface ResourceInfo {
  name: string;
  operations: OperationInfo[];
}

interface WsMessageInfo {
  name?: string;
  description?: string;
  properties?: BodyPropertyInfo[];
}

interface WsChannelInfo {
  name: string;
  description?: string;
  hasSubscribe: boolean;
  hasPublish: boolean;
  subscribeMessageName?: string;
  publishMessageName?: string;
  subscribeMessage?: WsMessageInfo;
  publishMessage?: WsMessageInfo;
}

interface WebSocketInfo {
  url: string;
  channels: WsChannelInfo[];
}

interface GqlFieldInfo {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  children?: GqlFieldInfo[];
}

interface GqlOperationInfo {
  name: string;
  description?: string;
  args: GqlFieldInfo[];
  returnType: string;
}

interface GraphQLInfo {
  queries: GqlOperationInfo[];
  mutations: GqlOperationInfo[];
  subscriptions: GqlOperationInfo[];
}

interface GrpcMethodInfo {
  name: string;
  description?: string;
  inputType: string;
  outputType: string;
  serverStreaming: boolean;
  clientStreaming: boolean;
  inputFields?: BodyPropertyInfo[];
  outputFields?: BodyPropertyInfo[];
}

interface GrpcServiceInfo {
  name: string;
  description?: string;
  methods: GrpcMethodInfo[];
}

interface GrpcInfo {
  services: GrpcServiceInfo[];
}

interface SourceTitles {
  rest: string[];
  websocket: string[];
  graphql: string[];
  grpc: string[];
}

interface SecuritySchemeInfo {
  name: string;
  type: string;
  scheme?: string;
  bearerFormat?: string;
  description?: string;
  in?: string;
  paramName?: string;
  openIdConnectUrl?: string;
  flows?: Record<string, { authorizationUrl?: string; tokenUrl?: string; scopes?: Record<string, string> }>;
}

interface SourceIntros {
  rest?: string;
  websocket?: string;
  graphql?: string;
  grpc?: string;
}

interface SnippetMap {
  [operationKey: string]: { [language: string]: string };
}

interface SdkSnippetsResponse {
  title: string;
  version: string;
  description: string;
  baseUrl: string;
  packageName: string;
  packageNames?: Record<string, string>;
  languages: string[];
  snippets?: SnippetMap;
  resources: ResourceInfo[];
  sourceTitles: SourceTitles;
  sourceIntros?: SourceIntros;
  securitySchemes?: SecuritySchemeInfo[];
  globalSecurity?: Array<Record<string, string[]>>;
  websocket?: WebSocketInfo;
  graphql?: GraphQLInfo;
  grpc?: GrpcInfo;
}

const SUPPORTED_LANGUAGES = [
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
] as const;

type Language = (typeof SUPPORTED_LANGUAGES)[number];

function computeMethodName(
  lang: Language,
  operationId: string,
  extensionMethodName: string | undefined,
  toCamelCase: (s: string) => string,
  toPascalCase: (s: string) => string,
  toSnakeCase: (s: string) => string,
): string {
  const base = extensionMethodName ?? operationId;

  switch (lang) {
    case 'typescript':
    case 'java':
    case 'kotlin':
    case 'php':
      return toCamelCase(base);
    case 'python':
    case 'ruby':
    case 'rust':
    case 'cpp':
    case 'c':
      return toSnakeCase(base);
    case 'go':
    case 'csharp':
      return toPascalCase(base);
    default:
      return toCamelCase(base);
  }
}

function computeResourceAccess(
  lang: Language,
  resourceName: string,
  toCamelCase: (s: string) => string,
  toPascalCase: (s: string) => string,
  toSnakeCase: (s: string) => string,
  singularize: (s: string) => string,
): string {
  switch (lang) {
    case 'typescript':
    case 'kotlin':
      return `client.${toCamelCase(resourceName)}`;
    case 'python':
    case 'ruby':
    case 'rust':
    case 'cpp':
      return `client.${toSnakeCase(resourceName)}`;
    case 'go':
      return `client.${toPascalCase(singularize(resourceName))}Resource`;
    case 'java':
      return `client.get${toPascalCase(resourceName)}()`;
    case 'php':
      return `$client->${toCamelCase(resourceName)}()`;
    case 'csharp':
      return `client.${toPascalCase(resourceName)}`;
    case 'c':
      return `${toSnakeCase(resourceName)}`;
    default:
      return `client.${toCamelCase(resourceName)}`;
  }
}

function computeTypeName(
  lang: Language,
  rawName: string,
  toPascalCase: (s: string) => string,
): string {
  return toPascalCase(rawName);
}

function resolveSchemaTypeName(
  schema: { name?: string; type?: string; ref?: string } | undefined,
): string {
  if (!schema) return '';
  if (schema.name) return schema.name;
  if (schema.ref) return schema.ref.split('/').pop() ?? '';
  return '';
}

function mapSchemaType(type: string | undefined): string {
  if (!type) return 'object';
  return type;
}

function extractProperties(
  schema: { type?: string; name?: string; ref?: string; description?: string; nullable?: boolean; properties?: Record<string, any>; items?: any; required?: string[] } | undefined,
  schemas: Map<string, any>,
  requiredFields?: string[],
  visited = new Set<string>(),
): BodyPropertyInfo[] {
  if (!schema) return [];

  let resolved = schema;
  if (schema.ref) {
    const refName = schema.ref.split('/').pop() ?? '';
    if (visited.has(refName)) return [];
    const found = schemas.get(refName);
    if (found) {
      resolved = found;
      visited = new Set([...visited, refName]);
    } else {
      return [];
    }
  }

  if (!resolved.properties) return [];

  const req = requiredFields ?? resolved.required ?? [];

  return Object.entries(resolved.properties).map(([name, prop]: [string, any]) => {
    let resolvedProp = prop;
    if (prop.ref) {
      const refName = prop.ref.split('/').pop() ?? '';
      if (!visited.has(refName)) {
        const found = schemas.get(refName);
        if (found) resolvedProp = found;
      }
    }

    const typeParts: string[] = [];
    if (resolvedProp.type === 'array') {
      const itemType = resolvedProp.items?.ref
        ? resolvedProp.items.ref.split('/').pop()
        : resolvedProp.items?.type ?? 'object';
      typeParts.push(`array of ${itemType}`);
    } else {
      typeParts.push(mapSchemaType(resolvedProp.type));
    }
    if (resolvedProp.nullable || prop.nullable) typeParts.push('null');

    const children = resolvedProp.properties
      ? extractProperties(resolvedProp, schemas, undefined, visited)
      : resolvedProp.type === 'array' && resolvedProp.items
        ? extractProperties(resolvedProp.items, schemas, undefined, visited)
        : undefined;

    return {
      name,
      type: typeParts.join(' or '),
      required: req.includes(name),
      description: resolvedProp.description ?? prop.description,
      nullable: resolvedProp.nullable ?? prop.nullable,
      children: children && children.length > 0 ? children : undefined,
    };
  });
}

function generateExample(
  schema: { type?: string; name?: string; ref?: string; properties?: Record<string, any>; items?: any; enum?: (string | number)[] } | undefined,
  schemas: Map<string, any>,
  visited = new Set<string>(),
): unknown {
  if (!schema) return {};

  if (schema.ref) {
    const refName = schema.ref.split('/').pop() ?? '';
    if (visited.has(refName)) return {};
    const resolved = schemas.get(refName);
    if (resolved) return generateExample(resolved, schemas, new Set([...visited, refName]));
    return {};
  }

  if (schema.enum && schema.enum.length > 0) return schema.enum[0];

  if (schema.type === 'array') {
    const item = generateExample(schema.items, schemas, visited);
    return [item];
  }

  if (schema.type === 'object' || schema.properties) {
    const obj: Record<string, unknown> = {};
    for (const [key, prop] of Object.entries(schema.properties ?? {})) {
      obj[key] = generateExample(prop, schemas, visited);
    }
    return obj;
  }

  switch (schema.type) {
    case 'string': return schema.name ? `example_${schema.name}` : 'string';
    case 'integer': case 'number': return 0;
    case 'boolean': return true;
    default: return {};
  }
}

export async function GET() {
  const specPath =
    process.env.CORTEX_SPEC_PATH ||
    path.join(process.cwd(), '..', 'core', '__fixtures__', 'petstore.yaml');

  if (!fs.existsSync(specPath)) {
    return NextResponse.json(
      { error: 'Spec file not found' },
      { status: 404 },
    );
  }

  try {
    const {
      OpenAPIParser,
      toCamelCase,
      toPascalCase,
      toSnakeCase,
      singularize,
    } = await import('@cortex/core');

    const parser = new OpenAPIParser();
    const spec = await parser.parse(specPath);

    const baseUrl = spec.info.servers[0]?.url ?? '';
    let packageName = spec.info.title.toLowerCase().replace(/\s+/g, '-');
    const packageNames: Record<string, string> = {};

    const sourceTitles: SourceTitles = { rest: [], websocket: [], graphql: [], grpc: [] };
    const introFiles: Record<string, string> = {};
    try {
      const yaml = await import('js-yaml');
      const dir = path.dirname(specPath);
      for (const cfgName of ['cortex.config.yml', 'cortex.config.yaml', 'cortex.yml']) {
        const cfgPath = path.join(dir, cfgName);
        if (fs.existsSync(cfgPath)) {
          const raw = yaml.load(fs.readFileSync(cfgPath, 'utf-8')) as Record<string, any>;
          for (const src of raw?.sources ?? []) {
            const specKey =
              src.type === 'openapi-spec' ? 'rest'
              : src.type === 'asyncapi-spec' ? 'websocket'
              : src.type === 'graphql-spec' ? 'graphql'
              : src.type === 'grpc-spec' ? 'grpc'
              : null;
            if (!specKey) continue;

            (sourceTitles as unknown as Record<string, string[]>)[specKey].push(src.title);

            if (src.intro) {
              const introPath = path.resolve(dir, src.intro);
              if (fs.existsSync(introPath)) {
                introFiles[specKey] = fs.readFileSync(introPath, 'utf-8');
              }
            }

            if (src.type === 'openapi-spec') {
              for (const langCfg of src.languages ?? []) {
                if (langCfg.package_name) {
                  packageNames[langCfg.language] = langCfg.package_name;
                  if (!packageNames['default']) packageNames['default'] = langCfg.package_name;
                }
              }
            }
          }
          break;
        }
      }
    } catch {}
    if (packageNames['default']) packageName = packageNames['default'];

    const titleToPascalCase = (s: string) => s.replace(/[^a-zA-Z0-9]/g, ' ').split(/\s+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
    const restClientClass = titleToPascalCase(sourceTitles.rest[0] ?? 'Api');
    const gqlClientClass = titleToPascalCase(sourceTitles.graphql[0] ?? 'Gql');
    const wsClientClass = titleToPascalCase(sourceTitles.websocket[0] ?? 'Ws');
    const grpcClientClass = titleToPascalCase(sourceTitles.grpc[0] ?? 'Grpc');

    const sourceIntros: SourceIntros = {};
    if (Object.keys(introFiles).length > 0) {
      const { renderMarkdown } = await import('@/lib/markdown');
      for (const [key, md] of Object.entries(introFiles)) {
        (sourceIntros as Record<string, string>)[key] = await renderMarkdown(md);
      }
    }

    const resourceMap = new Map<string, OperationInfo[]>();

    for (const op of spec.operations) {
      const resourceName =
        (op.extensions['resource'] as string | undefined) ??
        op.resourceName;

      const extensionMethodName = op.extensions['method-name'] as string | undefined;

      const pathParams: ParamInfo[] = op.parameters
        .filter((p) => p.in === 'path')
        .map((p) => ({ name: p.name, type: mapSchemaType(p.schema.type), description: p.description ?? p.schema.description }));

      const queryParams: QueryParamInfo[] = op.parameters
        .filter((p) => p.in === 'query')
        .map((p) => ({
          name: p.name,
          type: mapSchemaType(p.schema.type),
          required: p.required,
          description: p.description ?? p.schema.description,
        }));

      const headerParams: QueryParamInfo[] = op.parameters
        .filter((p) => p.in === 'header')
        .map((p) => ({
          name: p.name,
          type: mapSchemaType(p.schema.type),
          required: p.required,
          description: p.description ?? p.schema.description,
        }));

      const hasBody = !!op.requestBody;
      const bodyTypeName = resolveSchemaTypeName(op.requestBody?.schema);

      const bodyProperties: BodyPropertyInfo[] = op.requestBody?.schema
        ? extractProperties(op.requestBody.schema, spec.schemas)
        : [];

      const successResponse = op.responses.find(
        (r) => r.statusCode.startsWith('2') && r.schema,
      );
      const responseTypeName = resolveSchemaTypeName(successResponse?.schema);

      const responses: ResponseExample[] = op.responses.map((r) => {
        const props = r.schema ? extractProperties(r.schema, spec.schemas) : undefined;
        return {
          statusCode: r.statusCode,
          description: r.description,
          typeName: resolveSchemaTypeName(r.schema),
          example: r.schema ? generateExample(r.schema, spec.schemas) : null,
          properties: props && props.length > 0 ? props : undefined,
        };
      });

      const names: Record<string, LanguageNames> = {};
      for (const lang of SUPPORTED_LANGUAGES) {
        names[lang] = {
          methodName: computeMethodName(
            lang,
            op.operationId,
            extensionMethodName,
            toCamelCase,
            toPascalCase,
            toSnakeCase,
          ),
          resourceAccess: computeResourceAccess(
            lang,
            resourceName,
            toCamelCase,
            toPascalCase,
            toSnakeCase,
            singularize,
          ),
          bodyType: bodyTypeName
            ? computeTypeName(lang, bodyTypeName, toPascalCase)
            : '',
          responseType: responseTypeName
            ? computeTypeName(lang, responseTypeName, toPascalCase)
            : '',
        };
      }

      const operationInfo: OperationInfo = {
        operationId: op.operationId,
        method: op.method.toUpperCase(),
        path: op.path,
        summary: op.summary,
        pathParams,
        queryParams,
        headerParams,
        hasBody,
        bodyTypeName,
        bodyProperties,
        responseTypeName,
        responses,
        names,
      };

      const existing = resourceMap.get(resourceName) ?? [];
      existing.push(operationInfo);
      resourceMap.set(resourceName, existing);
    }

    const resources: ResourceInfo[] = Array.from(resourceMap.entries()).map(
      ([name, operations]) => ({ name, operations }),
    );

    const securitySchemes: SecuritySchemeInfo[] = [];
    const rawSchemes = (spec.raw as any).components?.securitySchemes;
    if (rawSchemes) {
      for (const [name, def] of Object.entries(rawSchemes) as [string, any][]) {
        securitySchemes.push({
          name,
          type: def.type,
          scheme: def.scheme,
          bearerFormat: def.bearerFormat,
          description: def.description,
          in: def.in,
          paramName: def.name,
          openIdConnectUrl: def.openIdConnectUrl,
          flows: def.flows,
        });
      }
    }
    const globalSecurity = (spec.raw as any).security as Array<Record<string, string[]>> | undefined;

    const response: SdkSnippetsResponse = {
      title: spec.info.title,
      version: spec.info.version,
      description: spec.info.description ?? '',
      baseUrl,
      packageName,
      packageNames: Object.keys(packageNames).length > 0 ? packageNames : undefined,
      languages: Object.keys(packageNames).filter(k => k !== 'default').length > 0
        ? SUPPORTED_LANGUAGES.filter(l => l in packageNames)
        : [...SUPPORTED_LANGUAGES],
      resources,
      sourceTitles,
      sourceIntros: Object.keys(sourceIntros).length > 0 ? sourceIntros : undefined,
      securitySchemes: securitySchemes.length > 0 ? securitySchemes : undefined,
      globalSecurity: globalSecurity?.length ? globalSecurity : undefined,
    };

    // Parse AsyncAPI if available
    const asyncApiPath =
      process.env.CORTEX_ASYNCAPI_PATH ||
      path.join(process.cwd(), '..', 'core', '__fixtures__', 'chat-asyncapi.yaml');
    if (fs.existsSync(asyncApiPath)) {
      try {
        const { AsyncAPIParser } = await import('@cortex/core');
        const asyncParser = new AsyncAPIParser();
        const asyncSpec = await asyncParser.parse(asyncApiPath);

        const wsUrl = asyncSpec.servers[0]?.url ?? '';

        const wsSchemas = asyncSpec.schemas ?? new Map();
        const mapWsMessage = (op: any): WsMessageInfo | undefined => {
          if (!op?.message) return undefined;
          const msg = op.message;
          const props = msg.schema?.properties
            ? Object.entries(msg.schema.properties).map(([name, s]: [string, any]) => ({
                name,
                type: mapSchemaType(s.type),
                required: (msg.schema.required ?? []).includes(name),
                description: s.description,
              }))
            : undefined;
          return { name: msg.name ?? msg.title, description: msg.description, properties: props && props.length > 0 ? props : undefined };
        };

        response.websocket = {
          url: wsUrl,
          channels: asyncSpec.channels.map((channel) => ({
            name: channel.name,
            description: channel.description,
            hasSubscribe: !!channel.subscribe,
            hasPublish: !!channel.publish,
            subscribeMessageName: channel.subscribe?.message?.name,
            publishMessageName: channel.publish?.message?.name,
            subscribeMessage: mapWsMessage(channel.subscribe),
            publishMessage: mapWsMessage(channel.publish),
          })),
        };
      } catch {
        // AsyncAPI parsing failed; skip websocket section
      }
    }

    // Parse GraphQL if available
    const graphqlPath =
      process.env.CORTEX_GRAPHQL_PATH ||
      path.join(process.cwd(), '..', 'core', '__fixtures__', 'petstore.graphql');
    if (fs.existsSync(graphqlPath)) {
      try {
        const { GraphQLParser } = await import('@cortex/core');
        const gqlParser = new GraphQLParser();
        const gqlSpec = await gqlParser.parse(graphqlPath);

        const gqlTypeMap = new Map<string, any>();
        for (const t of gqlSpec.inputs ?? []) gqlTypeMap.set(t.name, t);
        for (const t of gqlSpec.types ?? []) gqlTypeMap.set(t.name, t);

        const stripGqlType = (raw: string) => raw.replace(/[!\[\]]/g, '');

        const resolveGqlFields = (typeName: string, visited = new Set<string>()): GqlFieldInfo[] | undefined => {
          const clean = stripGqlType(typeName);
          if (visited.has(clean)) return undefined;
          const def = gqlTypeMap.get(clean);
          if (!def?.fields?.length) return undefined;
          visited = new Set([...visited, clean]);
          return def.fields.map((f: any) => ({
            name: f.name,
            type: f.typeRaw ?? f.type,
            required: f.required,
            description: f.description,
            children: resolveGqlFields(f.type, visited),
          }));
        };

        const mapGqlField = (a: any): GqlFieldInfo => {
          const children = resolveGqlFields(a.type);
          return {
            name: a.name,
            type: a.typeRaw ?? a.type,
            required: a.required,
            description: a.description,
            children: children && children.length > 0 ? children : undefined,
          };
        };

        const mapGqlOp = (op: any): GqlOperationInfo => ({
          name: op.name,
          description: op.description,
          args: (op.args ?? []).map(mapGqlField),
          returnType: op.returnTypeRaw ?? op.returnType ?? '',
        });

        response.graphql = {
          queries: gqlSpec.queries.map(mapGqlOp),
          mutations: gqlSpec.mutations.map(mapGqlOp),
          subscriptions: gqlSpec.subscriptions.map(mapGqlOp),
        };
      } catch {
        // GraphQL parsing failed; skip graphql section
      }
    }

    // Parse gRPC if available
    const grpcPath =
      process.env.CORTEX_GRPC_PATH ||
      path.join(process.cwd(), '..', 'core', '__fixtures__', 'petstore.proto');
    if (fs.existsSync(grpcPath)) {
      try {
        const { GrpcParser } = await import('@cortex/core');
        const grpcParser = new GrpcParser();
        const grpcSpec = await grpcParser.parse(grpcPath);

        const msgMap = new Map<string, any>();
        for (const msg of grpcSpec.messages ?? []) msgMap.set(msg.name, msg);

        const mapGrpcFields = (typeName: string): BodyPropertyInfo[] | undefined => {
          const msg = msgMap.get(typeName);
          if (!msg?.fields) return undefined;
          const fields = msg.fields.map((f: any) => ({
            name: f.name,
            type: f.repeated ? `repeated ${f.type}` : f.type,
            required: !f.optional,
            description: f.description,
            children: mapGrpcFields(f.type),
          }));
          return fields.length > 0 ? fields : undefined;
        };

        response.grpc = {
          services: grpcSpec.services.map((service) => ({
            name: service.name,
            description: (service as any).description,
            methods: service.methods.map((method) => ({
              name: method.name,
              description: (method as any).description,
              inputType: method.inputType,
              outputType: method.outputType,
              serverStreaming: method.serverStreaming,
              clientStreaming: method.clientStreaming,
              inputFields: mapGrpcFields(method.inputType),
              outputFields: mapGrpcFields(method.outputType),
            })),
          })),
        };
      } catch {
        // gRPC parsing failed; skip grpc section
      }
    }

    // Render per-operation snippets from shared EJS mini-templates
    try {
      const snippets: SnippetMap = {};
      const configuredLangs = response.languages;

      for (const lang of configuredLangs) {
        const langPkgName = packageNames[lang] ?? packageName;

        for (const res of response.resources) {
          for (const op of res.operations) {
            const ejsOp = {
              name: op.operationId,
              method: op.method,
              summary: op.summary,
              pathParams: op.pathParams.map((p: { name: string }) => ({ ...p, originalName: p.name })),
              queryParams: op.queryParams,
              hasBody: op.hasBody,
              bodyType: op.bodyTypeName,
              responseType: op.responseTypeName,
            };
            const ejsSchemas = op.bodyProperties?.length > 0
              ? [{ className: op.bodyTypeName, properties: op.bodyProperties.map((p: { name: string; type: string; required: boolean }) => ({ name: p.name, type: p.type, required: p.required })) }]
              : [];

            const templateData = {
              clientClass: restClientClass,
              pkgName: langPkgName,
              baseUrl: response.baseUrl,
              op: ejsOp,
              resource: res,
              resources: [],
              schemas: ejsSchemas,
              config: { languageConfig: { package_name: langPkgName } },
              spec: { info: { servers: [{ url: response.baseUrl }] } },
            };

            try {
              const snippet = renderSnippet(lang, 'rest/snippet', templateData);
              if (snippet) {
                const key = `rest:${op.operationId}`;
                if (!snippets[key]) snippets[key] = {};
                snippets[key][lang] = snippet.trim();
              }
            } catch (e: unknown) {
              console.error(`[sdk-snippets] ${lang}/rest/${op.operationId}:`, e instanceof Error ? e.message : e);
            }
          }
        }
      }

      // Shared base data for all template renders
      const baseTemplateData = {
        resources: response.resources,
        config: { languageConfig: { package_name: packageName } },
        spec: { info: { servers: [{ url: response.baseUrl }] } },
      };

      // GraphQL snippets
      if (response.graphql) {
        const allGqlOps = [
          ...(response.graphql.queries ?? []).map((q: { name: string; args?: Array<{ name: string; type: string }> }) => ({ ...q, opType: 'query' })),
          ...(response.graphql.mutations ?? []).map((m: { name: string; args?: Array<{ name: string; type: string }> }) => ({ ...m, opType: 'mutation' })),
          ...(response.graphql.subscriptions ?? []).map((s: { name: string; args?: Array<{ name: string; type: string }> }) => ({ ...s, opType: 'subscription' })),
        ];
        const gqlQueries = (response.graphql.queries ?? []).map((q: { name: string; args?: Array<{ name: string; type: string }> }) => ({
          name: q.name,
          args: (q.args ?? []).map((a: { name: string; type: string }) => ({ name: a.name, type: a.type })),
        }));

        for (const gqlOp of allGqlOps) {
          for (const lang of configuredLangs) {
            try {
              const langPkgName = packageNames[lang] ?? packageName;
              const snippet = renderSnippet(lang, 'graphql/snippet', {
                ...baseTemplateData,
                clientClass: gqlClientClass,
                opType: gqlOp.opType,
                opName: gqlOp.name,
                args: (gqlOp.args ?? []).map((a: { name: string; type: string }) => ({ name: a.name, type: a.type })),
                queries: gqlOp.opType === 'query' ? gqlQueries : undefined,
                pkgName: langPkgName,
                baseUrl: response.baseUrl,
                config: { languageConfig: { package_name: langPkgName } },
              });
              if (snippet) {
                const key = `gql:${gqlOp.name}`;
                if (!snippets[key]) snippets[key] = {};
                snippets[key][lang] = snippet.trim();
              }
            } catch (e: unknown) {
              console.error(`[sdk-snippets] ${lang}/gql/${gqlOp.name}:`, e instanceof Error ? e.message : e);
            }
          }
        }
      }

      // WebSocket snippets
      if (response.websocket) {
        for (const ch of response.websocket.channels ?? []) {
          for (const lang of configuredLangs) {
            try {
              const langPkgName = packageNames[lang] ?? packageName;
              const wsChannel = { ...ch, channelId: ch.name };
              const snippet = renderSnippet(lang, 'websocket/snippet', {
                ...baseTemplateData,
                clientClass: wsClientClass,
                channel: wsChannel,
                pkgName: langPkgName,
                baseUrl: response.baseUrl,
                config: { languageConfig: { package_name: langPkgName } },
              });
              if (snippet) {
                const key = `ws:${ch.name}`;
                if (!snippets[key]) snippets[key] = {};
                snippets[key][lang] = snippet.trim();
              }
            } catch (e: unknown) {
              console.error(`[sdk-snippets] ${lang}/ws/${ch.name}:`, e instanceof Error ? e.message : e);
            }
          }
        }
      }

      // gRPC snippets
      if (response.grpc) {
        for (const svc of response.grpc.services ?? []) {
          for (const m of svc.methods ?? []) {
            for (const lang of configuredLangs) {
              try {
                const langPkgName = packageNames[lang] ?? packageName;
                const snippet = renderSnippet(lang, 'grpc/snippet', {
                  ...baseTemplateData,
                  clientClass: grpcClientClass,
                  service: { serviceName: svc.name, packageName: langPkgName },
                  method: { ...m, methodName: m.name },
                  pkgName: langPkgName,
                  config: { languageConfig: { package_name: langPkgName } },
                });
                if (snippet) {
                  const key = `grpc:${svc.name}.${m.name}`;
                  if (!snippets[key]) snippets[key] = {};
                  snippets[key][lang] = snippet.trim();
                }
              } catch (e: unknown) {
                console.error(`[sdk-snippets] ${lang}/grpc/${svc.name}.${m.name}:`, e instanceof Error ? e.message : e);
              }
            }
          }
        }
      }

      if (Object.keys(snippets).length > 0) {
        response.snippets = snippets;
      }
    } catch (snippetErr: unknown) {
      console.error('[sdk-snippets] Snippet rendering failed:', snippetErr instanceof Error ? snippetErr.stack : snippetErr);
    }

    return NextResponse.json(response);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to parse spec' },
      { status: 500 },
    );
  }
}

function buildResources(spec: any, naming: any) {
  const resourceMap = new Map<string, any[]>();
  for (const op of spec.operations) {
    const resName = (op.extensions['resource'] as string) ?? op.resourceName;
    const ops = resourceMap.get(resName) ?? [];
    ops.push({
      operationId: op.operationId,
      name: naming.methodName(op.extensions['method-name'] as string ?? op.operationId),
      method: op.method.toUpperCase(),
      path: op.path,
      summary: op.summary,
      pathParams: op.parameters.filter((p: any) => p.in === 'path').map((p: any) => ({
        originalName: p.name, name: naming.parameterName(p.name), type: p.schema.type ?? 'string', required: p.required,
      })),
      queryParams: op.parameters.filter((p: any) => p.in === 'query').map((p: any) => ({
        originalName: p.name, name: naming.parameterName(p.name), type: p.schema.type ?? 'string', required: p.required,
      })),
      hasBody: !!op.requestBody,
      bodyType: op.requestBody?.schema?.name ?? 'object',
      responseType: op.responses.find((r: any) => r.statusCode.startsWith('2'))?.schema?.name ?? 'void',
    });
    resourceMap.set(resName, ops);
  }
  return Array.from(resourceMap.entries()).map(([name, operations]) => ({
    name: naming.propertyName(name),
    fileName: naming.fileName(name),
    operations,
  }));
}

function buildSchemas(spec: any) {
  const schemas: any[] = [];

  const resolveSchema = (schema: any): any => {
    if (!schema) return null;
    if (schema.properties) return schema;
    if (schema.name && spec.schemas) {
      const resolved = spec.schemas.get(schema.name);
      if (resolved) return resolved;
    }
    if (schema.ref) {
      const refName = schema.ref.split('/').pop();
      if (refName && spec.schemas) return spec.schemas.get(refName);
    }
    return schema;
  };

  for (const op of spec.operations) {
    const bodySchema = resolveSchema(op.requestBody?.schema);
    if (bodySchema?.properties) {
      schemas.push({
        className: op.requestBody.schema.name ?? bodySchema.name ?? 'RequestBody',
        isEnum: false,
        properties: Object.entries(bodySchema.properties).map(([name, prop]: [string, any]) => ({
          name, type: prop.type ?? 'string', required: bodySchema.required?.includes(name) ?? false,
        })),
        enumValues: [],
      });
    }
    for (const resp of op.responses) {
      const respSchema = resolveSchema(resp.schema);
      if (respSchema?.properties) {
        schemas.push({
          className: resp.schema?.name ?? respSchema.name ?? 'Response',
          isEnum: false,
          properties: Object.entries(respSchema.properties).map(([name, prop]: [string, any]) => ({
            name, type: prop.type ?? 'string', required: respSchema.required?.includes(name) ?? false,
          })),
          enumValues: [],
        });
      }
    }
  }
  const seen = new Set<string>();
  return schemas.filter((s) => { if (seen.has(s.className)) return false; seen.add(s.className); return true; });
}
