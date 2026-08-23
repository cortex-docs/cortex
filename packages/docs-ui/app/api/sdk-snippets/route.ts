import * as fs from 'node:fs';
import * as path from 'node:path';
import { NextResponse } from 'next/server';
import { renderSnippet } from '@cortex/codegen';
import { locationExists, resolveLocation } from '@/lib/load-location';

export const dynamic = 'force-dynamic';

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
  enumValues?: Array<string | number>;
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
  contentType?: string;
  isRawBinary: boolean;
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
  enumValues?: string[];
  children?: GqlFieldInfo[];
}

interface GqlOperationInfo {
  name: string;
  description?: string;
  args: GqlFieldInfo[];
  returnType: string;
  returnFields?: GqlFieldInfo[];
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

interface OpenRpcParamInfo {
  name: string;
  description?: string;
  required: boolean;
  type: string;
  enumValues?: Array<string | number>;
}

interface OpenRpcMethodInfo {
  name: string;
  summary?: string;
  description?: string;
  params: OpenRpcParamInfo[];
  resultName?: string;
  resultType?: string;
  resultProperties?: BodyPropertyInfo[];
  tags: string[];
  deprecated?: boolean;
}

interface OpenRpcInfo {
  methods: OpenRpcMethodInfo[];
  serverUrl?: string;
}

interface SourceTitles {
  rest: string[];
  websocket: string[];
  graphql: string[];
  grpc: string[];
  openrpc: string[];
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
  flows?: Record<
    string,
    { authorizationUrl?: string; tokenUrl?: string; scopes?: Record<string, string> }
  >;
}

interface SourceIntros {
  rest?: string;
  websocket?: string;
  graphql?: string;
  grpc?: string;
  openrpc?: string;
}

interface RestSourceData {
  title: string;
  version: string;
  description: string;
  baseUrl: string;
  packageName: string;
  packageNames?: Record<string, string>;
  templateDirs?: Record<string, string>;
  resources: ResourceInfo[];
  securitySchemes?: SecuritySchemeInfo[];
  globalSecurity?: Array<Record<string, string[]>>;
  intro?: string;
}

interface WsSourceData {
  title: string;
  intro?: string;
  url: string;
  channels: WsChannelInfo[];
  templateDirs?: Record<string, string>;
}

interface GqlSourceData {
  title: string;
  intro?: string;
  queries: GqlOperationInfo[];
  mutations: GqlOperationInfo[];
  subscriptions: GqlOperationInfo[];
  templateDirs?: Record<string, string>;
}

interface GrpcSourceData {
  title: string;
  intro?: string;
  services: GrpcServiceInfo[];
  bridgeUrl?: string;
  templateDirs?: Record<string, string>;
}

interface OpenRpcSourceData {
  title: string;
  intro?: string;
  methods: OpenRpcMethodInfo[];
  serverUrl?: string;
  templateDirs?: Record<string, string>;
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
  openrpc?: OpenRpcInfo;
  restSources?: RestSourceData[];
  websocketSources?: WsSourceData[];
  graphqlSources?: GqlSourceData[];
  grpcSources?: GrpcSourceData[];
  openrpcSources?: OpenRpcSourceData[];
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

function resolveLocalEndpoint(
  configuredUrl: string | undefined,
  apiBaseUrl: string,
  pathname: string,
): string | undefined {
  try {
    const apiUrl = new URL(apiBaseUrl);
    if (['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(apiUrl.hostname)) {
      return `${apiUrl.origin}${pathname}`;
    }
  } catch {}
  return configuredUrl;
}

function extractProperties(
  schema:
    | {
        type?: string;
        format?: string;
        name?: string;
        ref?: string;
        description?: string;
        nullable?: boolean;
        properties?: Record<string, any>;
        items?: any;
        required?: string[];
      }
    | undefined,
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
        : resolvedProp.items?.type === 'string' && resolvedProp.items?.format === 'binary'
          ? 'file'
          : (resolvedProp.items?.type ?? 'object');
      typeParts.push(`array of ${itemType}`);
    } else {
      typeParts.push(
        resolvedProp.type === 'string' && resolvedProp.format === 'binary'
          ? 'file'
          : mapSchemaType(resolvedProp.type),
      );
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

function isBinarySchema(schema: any, schemas: Map<string, any>): boolean {
  if (!schema) return false;
  if (schema.ref) {
    const name = schema.ref.split('/').pop() ?? '';
    return isBinarySchema(schemas.get(name), schemas);
  }
  return schema.type === 'string' && schema.format === 'binary';
}

function generateExample(
  schema:
    | {
        type?: string;
        name?: string;
        ref?: string;
        properties?: Record<string, any>;
        items?: any;
        enum?: (string | number)[];
      }
    | undefined,
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
    case 'string':
      return schema.name ? `example_${schema.name}` : 'string';
    case 'integer':
    case 'number':
      return 0;
    case 'boolean':
      return true;
    default:
      return {};
  }
}

export async function GET() {
  try {
    const {
      OpenAPIParser,
      AsyncAPIParser,
      GraphQLParser,
      GrpcParser,
      OpenRpcParser,
      toCamelCase,
      toPascalCase,
      toSnakeCase,
      singularize,
    } = await import('@cortex/core');
    const yaml = await import('js-yaml');
    const { renderMarkdown } = await import('@/lib/markdown');

    // --- Step A: Find and read config to discover ALL sources ---
    const configPath = process.env.CORTEX_CONFIG_PATH;
    let configDir = process.cwd();
    let configSources: any[] = [];

    if (configPath && fs.existsSync(configPath)) {
      configDir = path.dirname(configPath);
      try {
        const raw = yaml.load(fs.readFileSync(configPath, 'utf-8')) as Record<string, any>;
        configSources = raw?.sources ?? [];
      } catch {}
    } else {
      // Fallback: try to find config from CORTEX_SPEC_PATH directory
      const specPath = process.env.CORTEX_SPEC_PATH;
      if (specPath) {
        const dir = path.dirname(specPath);
        for (const cfgName of ['cortex.config.yml', 'cortex.config.yaml', 'cortex.yml']) {
          const cfgPath = path.join(dir, cfgName);
          if (fs.existsSync(cfgPath)) {
            configDir = dir;
            try {
              const raw = yaml.load(fs.readFileSync(cfgPath, 'utf-8')) as Record<string, any>;
              configSources = raw?.sources ?? [];
            } catch {}
            break;
          }
        }
      }
    }

    // If no config sources found but CORTEX_SPEC_PATH is set, create a synthetic source
    if (configSources.length === 0 && process.env.CORTEX_SPEC_PATH) {
      configSources = [
        { title: 'REST API', type: 'openapi-spec', spec: process.env.CORTEX_SPEC_PATH },
      ];
      if (process.env.CORTEX_ASYNCAPI_PATH) {
        configSources.push({
          title: 'WebSocket',
          type: 'asyncapi-spec',
          spec: process.env.CORTEX_ASYNCAPI_PATH,
        });
      }
      if (process.env.CORTEX_GRAPHQL_PATH) {
        configSources.push({
          title: 'GraphQL',
          type: 'graphql-spec',
          spec: process.env.CORTEX_GRAPHQL_PATH,
        });
      }
      if (process.env.CORTEX_GRPC_PATH) {
        configSources.push({
          title: 'gRPC',
          type: 'grpc-spec',
          spec: process.env.CORTEX_GRPC_PATH,
        });
      }
      if (process.env.CORTEX_OPENRPC_PATH) {
        configSources.push({
          title: 'OpenRPC',
          type: 'openrpc-spec',
          spec: process.env.CORTEX_OPENRPC_PATH,
        });
      }
    }

    // If still nothing, fall back to fixture paths
    if (configSources.length === 0) {
      configSources = [
        {
          title: 'REST API',
          type: 'openapi-spec',
          spec: path.join(process.cwd(), '..', 'core', '__fixtures__', 'petstore.yaml'),
        },
      ];
    }

    const titleToPascalCase = (s: string) =>
      s
        .replace(/[^a-zA-Z0-9]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join('');

    const sourceTemplateDirs = (source: any): Record<string, string> | undefined => {
      const directories: Record<string, string> = {};
      for (const languageConfig of source.languages ?? []) {
        if (!languageConfig.language || !languageConfig.template) continue;
        directories[languageConfig.language] = path.isAbsolute(languageConfig.template)
          ? path.normalize(languageConfig.template)
          : path.resolve(configDir, languageConfig.template);
      }
      return Object.keys(directories).length > 0 ? directories : undefined;
    };

    // Collect all package names across all sources for language determination
    const allPackageNames: Record<string, string> = {};
    let globalPackageName = '';

    // --- Step B: Process REST (openapi-spec) sources ---
    const restSources: RestSourceData[] = [];
    for (const src of configSources.filter((s: any) => s.type === 'openapi-spec')) {
      try {
        const resolvedSpec = resolveLocation(src.spec, configDir);
        if (!locationExists(resolvedSpec)) continue;

        const parser = new OpenAPIParser();
        const spec = await parser.parse(resolvedSpec);

        const baseUrl = spec.info.servers[0]?.url ?? '';
        let packageName = spec.info.title.toLowerCase().replace(/\s+/g, '-');
        const packageNames: Record<string, string> = {};

        for (const langCfg of src.languages ?? []) {
          if (langCfg.package_name) {
            packageNames[langCfg.language] = langCfg.package_name;
            if (!packageNames['default']) packageNames['default'] = langCfg.package_name;
          }
        }
        if (packageNames['default']) packageName = packageNames['default'];

        // Merge into global package names
        for (const [k, v] of Object.entries(packageNames)) {
          if (!allPackageNames[k]) allPackageNames[k] = v;
        }
        if (!globalPackageName && packageName) globalPackageName = packageName;

        // Build resources
        const resourceMap = new Map<string, OperationInfo[]>();
        for (const op of spec.operations) {
          const resourceName = (op.extensions['resource'] as string | undefined) ?? op.resourceName;

          const extensionMethodName = op.extensions['method-name'] as string | undefined;

          const pathParams: ParamInfo[] = op.parameters
            .filter((p) => p.in === 'path')
            .map((p) => ({
              name: p.name,
              type: mapSchemaType(p.schema.type),
              description: p.description ?? p.schema.description,
            }));

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
          const rawBinary =
            isBinarySchema(op.requestBody?.schema, spec.schemas) &&
            op.requestBody?.contentType.toLowerCase() !== 'multipart/form-data';
          const bodyTypeName = rawBinary
            ? 'FileUpload'
            : resolveSchemaTypeName(op.requestBody?.schema);

          const bodyProperties: BodyPropertyInfo[] = rawBinary
            ? [{ name: 'body', type: 'file', required: op.requestBody?.required ?? false }]
            : op.requestBody?.schema
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
              bodyType: bodyTypeName ? computeTypeName(lang, bodyTypeName, toPascalCase) : '',
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
            // Keep the OpenAPI media type so Try Now and SDK snippets can select multipart handling.
            contentType: op.requestBody?.contentType,
            isRawBinary: rawBinary,
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

        // Build security schemes
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
        const globalSecurity = (spec.raw as any).security as
          | Array<Record<string, string[]>>
          | undefined;

        // Read intro
        let intro: string | undefined;
        if (src.intro) {
          const introPath = path.resolve(configDir, src.intro);
          if (fs.existsSync(introPath)) {
            intro = await renderMarkdown(fs.readFileSync(introPath, 'utf-8'));
          }
        }

        restSources.push({
          title: src.title ?? spec.info.title,
          version: spec.info.version,
          description: spec.info.description ?? '',
          baseUrl,
          packageName,
          packageNames: Object.keys(packageNames).length > 0 ? packageNames : undefined,
          templateDirs: sourceTemplateDirs(src),
          resources,
          securitySchemes: securitySchemes.length > 0 ? securitySchemes : undefined,
          globalSecurity: globalSecurity?.length ? globalSecurity : undefined,
          intro,
        });
      } catch (e) {
        console.error(
          `[sdk-snippets] Failed to parse REST source "${src.title}":`,
          e instanceof Error ? e.message : e,
        );
      }
    }

    // --- Step C: Process AsyncAPI (websocket) sources ---
    const websocketSources: WsSourceData[] = [];
    for (const src of configSources.filter((s: any) => s.type === 'asyncapi-spec')) {
      try {
        const resolvedSpec = resolveLocation(src.spec, configDir);
        if (!locationExists(resolvedSpec)) continue;

        const asyncParser = new AsyncAPIParser();
        const asyncSpec = await asyncParser.parse(resolvedSpec);

        const wsUrl = asyncSpec.servers[0]?.url ?? '';

        const mapWsMessage = (op: any): WsMessageInfo | undefined => {
          if (!op?.message) return undefined;
          const msg = op.message;
          const props = msg.schema?.properties
            ? Object.entries(msg.schema.properties).map(([name, s]: [string, any]) => ({
                name,
                type: mapSchemaType(s.type),
                required: (msg.schema.required ?? []).includes(name),
                description: s.description,
                enumValues: s.enum,
              }))
            : undefined;
          return {
            name: msg.name ?? msg.title,
            description: msg.description,
            properties: props && props.length > 0 ? props : undefined,
          };
        };

        const channels: WsChannelInfo[] = asyncSpec.channels.map((channel) => ({
          name: channel.name,
          description: channel.description,
          hasSubscribe: !!channel.subscribe,
          hasPublish: !!channel.publish,
          subscribeMessageName: channel.subscribe?.message?.name,
          publishMessageName: channel.publish?.message?.name,
          subscribeMessage: mapWsMessage(channel.subscribe),
          publishMessage: mapWsMessage(channel.publish),
        }));

        let intro: string | undefined;
        if (src.intro) {
          const introPath = path.resolve(configDir, src.intro);
          if (fs.existsSync(introPath)) {
            intro = await renderMarkdown(fs.readFileSync(introPath, 'utf-8'));
          }
        }

        websocketSources.push({
          title: src.title ?? 'WebSocket',
          intro,
          url: wsUrl,
          channels,
          templateDirs: sourceTemplateDirs(src),
        });
      } catch (e) {
        console.error(
          `[sdk-snippets] Failed to parse WebSocket source "${src.title}":`,
          e instanceof Error ? e.message : e,
        );
      }
    }

    // --- Process GraphQL sources ---
    const graphqlSources: GqlSourceData[] = [];
    for (const src of configSources.filter((s: any) => s.type === 'graphql-spec')) {
      try {
        const resolvedSpec = resolveLocation(src.spec, configDir);
        if (!locationExists(resolvedSpec)) continue;

        const gqlParser = new GraphQLParser();
        const gqlSpec = await gqlParser.parse(resolvedSpec, src.endpoint);

        const gqlTypeMap = new Map<string, any>();
        for (const t of gqlSpec.inputs ?? []) gqlTypeMap.set(t.name, t);
        for (const t of gqlSpec.types ?? []) gqlTypeMap.set(t.name, t);

        const gqlEnumMap = new Map<string, string[]>();
        for (const e of gqlSpec.enums ?? []) gqlEnumMap.set(e.name, e.values);

        const stripGqlType = (raw: string) => raw.replace(/[!\[\]]/g, '');
        const resolveEnumValues = (raw: string): string[] | undefined => {
          const values = gqlEnumMap.get(stripGqlType(raw));
          return values?.length ? values : undefined;
        };

        const resolveGqlFields = (
          typeName: string,
          visited = new Set<string>(),
        ): GqlFieldInfo[] | undefined => {
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
            enumValues: resolveEnumValues(f.typeRaw ?? f.type),
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
            enumValues: resolveEnumValues(a.typeRaw ?? a.type),
            children: children && children.length > 0 ? children : undefined,
          };
        };

        const typeMap = new Map<string, any>();
        for (const t of gqlSpec.types ?? []) {
          typeMap.set(t.name, t);
        }

        const resolveFields = (
          typeName: string,
          depth: number,
          seen: Set<string>,
        ): GqlFieldInfo[] | undefined => {
          const bare = typeName.replace(/[!\[\]]/g, '');
          if (seen.has(bare) || depth <= 0) return undefined;
          const t = typeMap.get(bare);
          if (!t?.fields?.length) return undefined;
          seen.add(bare);
          const result = t.fields.map((f: any) => {
            const fType = f.typeRaw ?? f.type ?? '';
            const children = resolveFields(fType, depth - 1, new Set(seen));
            return {
              name: f.name,
              type: fType,
              required: f.required ?? false,
              enumValues: resolveEnumValues(fType),
              children,
            };
          });
          seen.delete(bare);
          return result;
        };

        const resolveReturnFields = (returnType: string): GqlFieldInfo[] | undefined => {
          return resolveFields(returnType, 3, new Set());
        };

        const mapGqlOp = (op: any): GqlOperationInfo => ({
          name: op.name,
          description: op.description,
          args: (op.args ?? []).map(mapGqlField),
          returnType: op.returnTypeRaw ?? op.returnType ?? '',
          returnFields: resolveReturnFields(op.returnTypeRaw ?? op.returnType ?? ''),
        });

        let intro: string | undefined;
        if (src.intro) {
          const introPath = path.resolve(configDir, src.intro);
          if (fs.existsSync(introPath)) {
            intro = await renderMarkdown(fs.readFileSync(introPath, 'utf-8'));
          }
        }

        graphqlSources.push({
          title: src.title ?? 'GraphQL',
          intro,
          queries: gqlSpec.queries.map(mapGqlOp),
          mutations: gqlSpec.mutations.map(mapGqlOp),
          subscriptions: gqlSpec.subscriptions.map(mapGqlOp),
          templateDirs: sourceTemplateDirs(src),
        });
      } catch (e) {
        console.error(
          `[sdk-snippets] Failed to parse GraphQL source "${src.title}":`,
          e instanceof Error ? e.message : e,
        );
      }
    }

    // --- Process gRPC sources ---
    const grpcSources: GrpcSourceData[] = [];
    for (const src of configSources.filter((s: any) => s.type === 'grpc-spec')) {
      try {
        const resolvedSpec = resolveLocation(src.spec, configDir);
        if (!locationExists(resolvedSpec)) continue;

        const grpcParser = new GrpcParser();
        const grpcSpec = await grpcParser.parse(resolvedSpec);
        const messageMap = new Map(grpcSpec.messages.map((message) => [message.name, message]));
        const enumMap = new Map(
          grpcSpec.enums.map((enumDef) => [
            enumDef.name,
            enumDef.values.map((value) => value.name),
          ]),
        );

        const mapGrpcFields = (
          typeName: string,
          visited = new Set<string>(),
        ): BodyPropertyInfo[] | undefined => {
          const bareType = typeName.split('.').pop() ?? typeName;
          if (visited.has(bareType)) return undefined;
          const message = messageMap.get(bareType);
          if (!message?.fields.length) return undefined;
          const nextVisited = new Set([...visited, bareType]);
          const fields = message.fields.map((field) => {
            const fieldType = field.type.split('.').pop() ?? field.type;
            const children = mapGrpcFields(fieldType, nextVisited);
            const enumValues = enumMap.get(fieldType);
            return {
              name: field.name,
              type: field.repeated ? `${fieldType}[]` : fieldType,
              required: !field.optional && !field.repeated,
              description: field.description,
              enumValues: enumValues?.length ? enumValues : undefined,
              children: children?.length ? children : undefined,
            };
          });
          return fields.length ? fields : undefined;
        };

        let intro: string | undefined;
        if (src.intro) {
          const introPath = path.resolve(configDir, src.intro);
          if (fs.existsSync(introPath)) {
            intro = await renderMarkdown(fs.readFileSync(introPath, 'utf-8'));
          }
        }

        grpcSources.push({
          title: src.title ?? grpcSpec.title ?? 'gRPC',
          intro,
          bridgeUrl: src.try_now_url ?? src.bridge_url,
          templateDirs: sourceTemplateDirs(src),
          services: grpcSpec.services.map((service) => ({
            name: service.name,
            description: service.description,
            methods: service.methods.map((method) => ({
              name: method.name,
              description: method.description,
              inputType: method.inputType,
              outputType: method.outputType,
              serverStreaming: method.serverStreaming,
              clientStreaming: method.clientStreaming,
              inputFields: mapGrpcFields(method.inputType),
              outputFields: mapGrpcFields(method.outputType),
            })),
          })),
        });
      } catch (e) {
        console.error(
          `[sdk-snippets] Failed to parse gRPC source "${src.title}":`,
          e instanceof Error ? e.message : e,
        );
      }
    }

    // --- Process OpenRPC sources ---
    const openrpcSources: OpenRpcSourceData[] = [];
    for (const src of configSources.filter((s: any) => s.type === 'openrpc-spec')) {
      try {
        const resolvedSpec = resolveLocation(src.spec, configDir);
        if (!locationExists(resolvedSpec)) continue;

        const openRpcParser = new OpenRpcParser();
        const openRpcSpec = await openRpcParser.parse(resolvedSpec);

        const schemaMap = openRpcSpec.schemas ?? new Map();

        const resolveSchemaType = (schema: any): string => {
          if (!schema) return 'object';
          if (schema.ref) return schema.ref.split('/').pop() ?? 'object';
          if (schema.type === 'array' && schema.items)
            return `${resolveSchemaType(schema.items)}[]`;
          return schema.type ?? 'object';
        };

        const resolveSchemaEnum = (schema: any): Array<string | number> | undefined => {
          if (!schema) return undefined;
          if (schema.ref) {
            const refName = schema.ref.split('/').pop() ?? '';
            const resolved = schemaMap.get(refName);
            return resolved?.enum?.length ? resolved.enum : undefined;
          }
          return schema.enum?.length ? schema.enum : undefined;
        };

        const resolveSchemaProps = (schema: any): BodyPropertyInfo[] | undefined => {
          if (!schema) return undefined;
          let resolved = schema;
          if (schema.ref) {
            const refName = schema.ref.split('/').pop() ?? '';
            const found = schemaMap.get(refName);
            if (found) resolved = found;
            else return undefined;
          }
          if (!resolved.properties) return undefined;
          const props = Object.entries(resolved.properties).map(([name, s]: [string, any]) => ({
            name,
            type: resolveSchemaType(s),
            required: (resolved.required ?? []).includes(name),
            description: s.description,
          }));
          return props.length > 0 ? props : undefined;
        };

        let intro: string | undefined;
        if (src.intro) {
          const introPath = path.resolve(configDir, src.intro);
          if (fs.existsSync(introPath)) {
            intro = await renderMarkdown(fs.readFileSync(introPath, 'utf-8'));
          }
        }

        openrpcSources.push({
          title: src.title ?? 'OpenRPC',
          intro,
          serverUrl:
            src.try_now_url ??
            resolveLocalEndpoint(
              openRpcSpec.servers[0]?.url,
              restSources[0]?.baseUrl ?? '',
              '/rpc',
            ),
          templateDirs: sourceTemplateDirs(src),
          methods: openRpcSpec.methods.map((method) => ({
            name: method.name,
            summary: method.summary,
            description: method.description,
            params: method.params.map((p) => ({
              name: p.name,
              description: p.description,
              required: p.required,
              type: resolveSchemaType(p.schema),
              enumValues: resolveSchemaEnum(p.schema),
            })),
            resultName: method.result?.name,
            resultType: method.result ? resolveSchemaType(method.result.schema) : undefined,
            resultProperties: method.result ? resolveSchemaProps(method.result.schema) : undefined,
            tags: method.tags,
            deprecated: method.deprecated,
          })),
        });
      } catch (e) {
        console.error(
          `[sdk-snippets] Failed to parse OpenRPC source "${src.title}":`,
          e instanceof Error ? e.message : e,
        );
      }
    }

    // --- Step D: Build backward-compat flat fields from first source of each type ---
    const firstRest = restSources[0];
    const packageName = firstRest?.packageName ?? (globalPackageName || 'api');
    const packageNames =
      firstRest?.packageNames ??
      (Object.keys(allPackageNames).length > 0 ? allPackageNames : undefined);

    // --- Step E: Build sourceTitles from per-source arrays ---
    const sourceTitles: SourceTitles = {
      rest: restSources.map((s) => s.title),
      websocket: websocketSources.map((s) => s.title),
      graphql: graphqlSources.map((s) => s.title),
      grpc: grpcSources.map((s) => s.title),
      openrpc: openrpcSources.map((s) => s.title),
    };

    // Build backward-compat sourceIntros from first source of each type
    const sourceIntros: SourceIntros = {};
    if (restSources[0]?.intro) sourceIntros.rest = restSources[0].intro;
    if (websocketSources[0]?.intro) sourceIntros.websocket = websocketSources[0].intro;
    if (graphqlSources[0]?.intro) sourceIntros.graphql = graphqlSources[0].intro;
    if (grpcSources[0]?.intro) sourceIntros.grpc = grpcSources[0].intro;
    if (openrpcSources[0]?.intro) sourceIntros.openrpc = openrpcSources[0].intro;

    // Determine configured languages: union of all configured languages across all sources
    const configuredLangSet = new Set<string>();
    for (const src of configSources) {
      for (const langCfg of src.languages ?? []) {
        if (langCfg.language) configuredLangSet.add(langCfg.language);
      }
    }
    const languages =
      configuredLangSet.size > 0
        ? SUPPORTED_LANGUAGES.filter((l) => configuredLangSet.has(l))
        : [...SUPPORTED_LANGUAGES];

    const grpcClientClass = titleToPascalCase(sourceTitles.grpc[0] ?? 'Grpc');

    // Build backward-compat flat websocket/graphql/openrpc from first source
    const flatWebsocket: WebSocketInfo | undefined = websocketSources[0]
      ? { url: websocketSources[0].url, channels: websocketSources[0].channels }
      : undefined;
    const flatGraphql: GraphQLInfo | undefined = graphqlSources[0]
      ? {
          queries: graphqlSources[0].queries,
          mutations: graphqlSources[0].mutations,
          subscriptions: graphqlSources[0].subscriptions,
        }
      : undefined;
    const flatGrpc: GrpcInfo | undefined = grpcSources[0]
      ? { services: grpcSources[0].services }
      : undefined;
    const flatOpenrpc: OpenRpcInfo | undefined = openrpcSources[0]
      ? { methods: openrpcSources[0].methods, serverUrl: openrpcSources[0].serverUrl }
      : undefined;

    const response: SdkSnippetsResponse = {
      title: firstRest?.title ?? 'API',
      version: firstRest?.version ?? '',
      description: firstRest?.description ?? '',
      baseUrl: firstRest?.baseUrl ?? '',
      packageName,
      packageNames: packageNames && Object.keys(packageNames).length > 0 ? packageNames : undefined,
      languages,
      resources: firstRest?.resources ?? [],
      sourceTitles,
      sourceIntros: Object.keys(sourceIntros).length > 0 ? sourceIntros : undefined,
      securitySchemes: firstRest?.securitySchemes,
      globalSecurity: firstRest?.globalSecurity,
      websocket: flatWebsocket,
      graphql: flatGraphql,
      grpc: flatGrpc,
      openrpc: flatOpenrpc,
      restSources: restSources.length > 0 ? restSources : undefined,
      websocketSources: websocketSources.length > 0 ? websocketSources : undefined,
      graphqlSources: graphqlSources.length > 0 ? graphqlSources : undefined,
      grpcSources: grpcSources.length > 0 ? grpcSources : undefined,
      openrpcSources: openrpcSources.length > 0 ? openrpcSources : undefined,
    };

    // --- Step F: Render per-operation snippets ---
    try {
      const snippets: SnippetMap = {};
      const configuredLangs = response.languages;
      const multiRest = restSources.length > 1;
      const multiWs = websocketSources.length > 1;
      const multiGql = graphqlSources.length > 1;
      const multiGrpc = grpcSources.length > 1;
      const multiOpenRpc = openrpcSources.length > 1;

      // REST snippets — iterate over all REST sources
      for (let srcIdx = 0; srcIdx < restSources.length; srcIdx++) {
        const restSrc = restSources[srcIdx];
        const srcClientClass = titleToPascalCase(restSrc.title ?? 'Api');
        const srcPkgNames = restSrc.packageNames ?? {};

        for (const lang of configuredLangs) {
          const langPkgName = srcPkgNames[lang] ?? restSrc.packageName;

          for (const res of restSrc.resources) {
            for (const op of res.operations) {
              const ejsOp = {
                name: op.operationId,
                method: op.method,
                summary: op.summary,
                pathParams: op.pathParams.map((p: { name: string }) => ({
                  ...p,
                  originalName: p.name,
                })),
                queryParams: op.queryParams,
                hasBody: op.hasBody,
                contentType: op.contentType,
                isMultipart: op.contentType?.toLowerCase() === 'multipart/form-data',
                isRawBinary: op.isRawBinary,
                multipartFields: op.bodyProperties.map((p) => ({
                  ...p,
                  originalName: p.name,
                  isFile: p.type === 'file',
                  isFileArray: p.type === 'array of file',
                })),
                bodyType: op.bodyTypeName,
                responseType: op.responseTypeName,
              };
              const ejsSchemas =
                op.bodyProperties?.length > 0
                  ? [
                      {
                        className: op.bodyTypeName,
                        properties: op.bodyProperties.map(
                          (p: { name: string; type: string; required: boolean }) => ({
                            name: p.name,
                            type: p.type,
                            required: p.required,
                          }),
                        ),
                      },
                    ]
                  : [];

              const templateData = {
                clientClass: srcClientClass,
                pkgName: langPkgName,
                baseUrl: restSrc.baseUrl,
                op: ejsOp,
                resource: res,
                resources: [],
                schemas: ejsSchemas,
                config: { languageConfig: { package_name: langPkgName } },
                spec: { info: { servers: [{ url: restSrc.baseUrl }] } },
              };

              try {
                const snippet = renderSnippet(lang, 'rest/snippet', templateData, {
                  templateRoot: process.env.CORTEX_TEMPLATE_ROOT,
                  templateDir: restSrc.templateDirs?.[lang],
                });
                if (snippet) {
                  const key = multiRest
                    ? `rest:${srcIdx}:${op.operationId}`
                    : `rest:${op.operationId}`;
                  if (!snippets[key]) snippets[key] = {};
                  snippets[key][lang] = snippet.trim();
                }
              } catch (e: unknown) {
                console.error(
                  `[sdk-snippets] ${lang}/rest/${op.operationId}:`,
                  e instanceof Error ? e.message : e,
                );
              }
            }
          }
        }
      }

      // GraphQL snippets — iterate over all GraphQL sources
      for (let srcIdx = 0; srcIdx < graphqlSources.length; srcIdx++) {
        const gqlSrc = graphqlSources[srcIdx];
        const srcGqlClientClass = titleToPascalCase(gqlSrc.title ?? 'Gql');

        const allGqlOps = [
          ...(gqlSrc.queries ?? []).map(
            (q: { name: string; args?: Array<{ name: string; type: string }> }) => ({
              ...q,
              opType: 'query',
            }),
          ),
          ...(gqlSrc.mutations ?? []).map(
            (m: { name: string; args?: Array<{ name: string; type: string }> }) => ({
              ...m,
              opType: 'mutation',
            }),
          ),
          ...(gqlSrc.subscriptions ?? []).map(
            (s: { name: string; args?: Array<{ name: string; type: string }> }) => ({
              ...s,
              opType: 'subscription',
            }),
          ),
        ];
        const gqlQueries = (gqlSrc.queries ?? []).map(
          (q: { name: string; args?: Array<{ name: string; type: string }> }) => ({
            name: q.name,
            args: (q.args ?? []).map((a: { name: string; type: string }) => ({
              name: a.name,
              type: a.type,
            })),
          }),
        );

        const baseTemplateData = {
          resources: firstRest?.resources ?? [],
          config: { languageConfig: { package_name: packageName } },
          spec: { info: { servers: [{ url: firstRest?.baseUrl ?? '' }] } },
        };

        for (const gqlOp of allGqlOps) {
          for (const lang of configuredLangs) {
            try {
              const langPkgName = allPackageNames[lang] ?? packageName;
              const snippet = renderSnippet(
                lang,
                'graphql/snippet',
                {
                  ...baseTemplateData,
                  clientClass: srcGqlClientClass,
                  opType: gqlOp.opType,
                  opName: gqlOp.name,
                  args: (gqlOp.args ?? []).map((a: { name: string; type: string }) => ({
                    name: a.name,
                    type: a.type,
                  })),
                  queries: gqlOp.opType === 'query' ? gqlQueries : undefined,
                  pkgName: langPkgName,
                  baseUrl: firstRest?.baseUrl ?? '',
                  config: { languageConfig: { package_name: langPkgName } },
                },
                {
                  templateRoot: process.env.CORTEX_TEMPLATE_ROOT,
                  templateDir: gqlSrc.templateDirs?.[lang],
                },
              );
              if (snippet) {
                const key = multiGql ? `gql:${srcIdx}:${gqlOp.name}` : `gql:${gqlOp.name}`;
                if (!snippets[key]) snippets[key] = {};
                snippets[key][lang] = snippet.trim();
              }
            } catch (e: unknown) {
              console.error(
                `[sdk-snippets] ${lang}/gql/${gqlOp.name}:`,
                e instanceof Error ? e.message : e,
              );
            }
          }
        }
      }

      // WebSocket snippets — iterate over all WebSocket sources
      for (let srcIdx = 0; srcIdx < websocketSources.length; srcIdx++) {
        const wsSrc = websocketSources[srcIdx];
        const srcWsClientClass = titleToPascalCase(wsSrc.title ?? 'Ws');

        const baseTemplateData = {
          resources: firstRest?.resources ?? [],
          config: { languageConfig: { package_name: packageName } },
          spec: { info: { servers: [{ url: firstRest?.baseUrl ?? '' }] } },
        };

        for (const ch of wsSrc.channels ?? []) {
          for (const lang of configuredLangs) {
            try {
              const langPkgName = allPackageNames[lang] ?? packageName;
              const wsChannel = { ...ch, channelId: ch.name };
              const snippet = renderSnippet(
                lang,
                'websocket/snippet',
                {
                  ...baseTemplateData,
                  clientClass: srcWsClientClass,
                  channel: wsChannel,
                  pkgName: langPkgName,
                  baseUrl: firstRest?.baseUrl ?? '',
                  config: { languageConfig: { package_name: langPkgName } },
                },
                {
                  templateRoot: process.env.CORTEX_TEMPLATE_ROOT,
                  templateDir: wsSrc.templateDirs?.[lang],
                },
              );
              if (snippet) {
                const key = multiWs ? `ws:${srcIdx}:${ch.name}` : `ws:${ch.name}`;
                if (!snippets[key]) snippets[key] = {};
                snippets[key][lang] = snippet.trim();
              }
            } catch (e: unknown) {
              console.error(
                `[sdk-snippets] ${lang}/ws/${ch.name}:`,
                e instanceof Error ? e.message : e,
              );
            }
          }
        }
      }

      // gRPC snippets — iterate over all gRPC sources
      for (let srcIdx = 0; srcIdx < grpcSources.length; srcIdx++) {
        const grpcSrc = grpcSources[srcIdx];
        const srcGrpcClientClass = titleToPascalCase(grpcSrc.title) || grpcClientClass;
        const baseTemplateData = {
          resources: firstRest?.resources ?? [],
          spec: { info: { servers: [{ url: firstRest?.baseUrl ?? '' }] } },
        };

        for (const service of grpcSrc.services) {
          for (const method of service.methods) {
            for (const lang of configuredLangs) {
              try {
                const langPkgName = allPackageNames[lang] ?? packageName;
                const snippet = renderSnippet(
                  lang,
                  'grpc/snippet',
                  {
                    ...baseTemplateData,
                    clientClass: srcGrpcClientClass,
                    service: { serviceName: service.name, packageName: langPkgName },
                    method: { ...method, methodName: method.name },
                    pkgName: langPkgName,
                    config: { languageConfig: { package_name: langPkgName } },
                  },
                  {
                    templateRoot: process.env.CORTEX_TEMPLATE_ROOT,
                    templateDir: grpcSrc.templateDirs?.[lang],
                  },
                );
                if (snippet) {
                  const label = `${service.name}.${method.name}`;
                  const key = multiGrpc ? `grpc:${srcIdx}:${label}` : `grpc:${label}`;
                  if (!snippets[key]) snippets[key] = {};
                  snippets[key][lang] = snippet.trim();
                }
              } catch (e: unknown) {
                console.error(
                  `[sdk-snippets] ${lang}/grpc/${service.name}.${method.name}:`,
                  e instanceof Error ? e.message : e,
                );
              }
            }
          }
        }
      }

      // OpenRPC snippets — iterate over all OpenRPC sources
      for (let srcIdx = 0; srcIdx < openrpcSources.length; srcIdx++) {
        const openRpcSrc = openrpcSources[srcIdx];
        const srcOpenRpcClientClass = titleToPascalCase(openRpcSrc.title ?? 'JsonRpc');

        const baseTemplateData = {
          resources: firstRest?.resources ?? [],
          config: { languageConfig: { package_name: packageName } },
          spec: { info: { servers: [{ url: firstRest?.baseUrl ?? '' }] } },
        };

        for (const m of openRpcSrc.methods ?? []) {
          for (const lang of configuredLangs) {
            try {
              const langPkgName = allPackageNames[lang] ?? packageName;
              const snippet = renderSnippet(
                lang,
                'openrpc/snippet',
                {
                  ...baseTemplateData,
                  clientClass: srcOpenRpcClientClass,
                  method: { ...m, methodName: m.name, params: m.params },
                  serverUrl: openRpcSrc.serverUrl ?? firstRest?.baseUrl ?? '',
                  pkgName: langPkgName,
                  baseUrl: openRpcSrc.serverUrl ?? firstRest?.baseUrl ?? '',
                  config: { languageConfig: { package_name: langPkgName } },
                },
                {
                  templateRoot: process.env.CORTEX_TEMPLATE_ROOT,
                  templateDir: openRpcSrc.templateDirs?.[lang],
                },
              );
              if (snippet) {
                const key = multiOpenRpc ? `openrpc:${srcIdx}:${m.name}` : `openrpc:${m.name}`;
                if (!snippets[key]) snippets[key] = {};
                snippets[key][lang] = snippet.trim();
              }
            } catch (e: unknown) {
              console.error(
                `[sdk-snippets] ${lang}/openrpc/${m.name}:`,
                e instanceof Error ? e.message : e,
              );
            }
          }
        }
      }

      if (Object.keys(snippets).length > 0) {
        response.snippets = snippets;
      }
    } catch (snippetErr: unknown) {
      console.error(
        '[sdk-snippets] Snippet rendering failed:',
        snippetErr instanceof Error ? snippetErr.stack : snippetErr,
      );
    }

    return NextResponse.json(response);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to parse spec' },
      { status: 500 },
    );
  }
}
