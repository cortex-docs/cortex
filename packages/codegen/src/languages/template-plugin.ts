import * as path from 'node:path';
import * as fs from 'node:fs';
import { Eta } from 'eta';
import type {
  ParsedSpec,
  SchemaObject,
  Operation,
  GraphQLSpec,
  GraphQLOperation,
  AsyncApiSpec,
  AsyncApiChannel,
  GrpcSpec,
  OpenRpcSpec,
} from '@cortex/core';
import {
  singularize,
  toPascalCase,
  titleToPascalCase,
  toCamelCase,
  toSnakeCase,
  toKebabCase,
  toUpperSnakeCase,
  hasSourceType,
  getFirstSourceByType,
  gitRepositoryUrl,
  normalizeRepositoryUrl,
} from '@cortex/core';
import type { LanguagePlugin, CodegenContext, GeneratedFile, NamingConventions } from '../plugin';
import {
  applyFileTemplateOverrides,
  createLanguageTemplateRenderer,
  findLanguageTemplateDir,
  type LayeredTemplateRenderer,
  type TemplateRenderOptions,
} from '../template-renderer';

export function resolveVersion(outputDir: string): string {
  const metadataPath = path.resolve(outputDir, '.cortex-package.json');
  try {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8')) as { version?: unknown };
    if (typeof metadata.version === 'string' && /^\d+\.\d+\.\d+$/.test(metadata.version)) {
      return metadata.version;
    }
  } catch {
    // A new package starts at 0.0.0. The publish command selects its first release version.
  }
  return '0.0.0';
}

export interface LanguageTypeMap {
  string: string;
  integer: string;
  number: string;
  boolean: string;
  array: (itemType: string) => string;
  object: string;
  objectLiteral?: (properties: Array<{ name: string; type: string; required: boolean }>) => string;
  map: (valueType: string) => string;
  any: string;
  void: string;
  datetime: string;
  file?: string;
  nullable: (type: string) => string;
}

export interface PackageTemplate {
  template: string;
  path: string | ((data: PackageTemplateData) => string);
}

export interface PackageTemplateData {
  packageName: string;
  version: string;
  project: string;
  title: string;
  hasWs: boolean;
  hasGql: boolean;
  hasOpenRpc: boolean;
  hasGrpc: boolean;
  repositoryUrl?: string;
  gitRepositoryUrl?: string;
  naming: NamingConventions;
  utils: {
    toPascalCase: typeof toPascalCase;
    toSnakeCase: typeof toSnakeCase;
    toKebabCase: typeof toKebabCase;
  };
}

export interface LanguageTemplateConfig {
  language: string;
  displayName: string;
  fileExtension: string;
  typeMap: LanguageTypeMap;
  naming: NamingConventions;
  packageFiles: (context: CodegenContext) => GeneratedFile[];
  packageTemplates?: PackageTemplate[];
  clientPath?: (data: { clientClass: string }) => string;
  typesPath?: string;
  resourcePath?: (data: { className: string; fileName: string }) => string;
  indexPath?: string;
  splitTypes?: boolean;
}

interface GqlOpData {
  name: string;
  description?: string;
  args: Array<{ name: string; type: string; typeRaw: string; required: boolean }>;
  returnType: string;
  returnTypeRaw: string;
}

interface GqlFieldData {
  name: string;
  typeRaw: string;
  required: boolean;
  description?: string;
}

interface GqlTypeData {
  name: string;
  description?: string;
  fields: GqlFieldData[];
}

interface GqlEnumData {
  name: string;
  description?: string;
  values: string[];
}

interface GqlReadmeData {
  queries: GqlOpData[];
  mutations: GqlOpData[];
  subscriptions: GqlOpData[];
  types: GqlTypeData[];
  inputs: GqlTypeData[];
  enums: GqlEnumData[];
}

interface WsChannelReadmeData {
  channelId: string;
  description?: string;
  handlerName: string;
  sendName: string;
  canSubscribe: boolean;
  canPublish: boolean;
  subscribeMessage?: { properties: Array<{ name: string; type: string }> };
  publishMessage?: { properties: Array<{ name: string; type: string }> };
}

interface OpenRpcMethodReadmeData {
  methodName: string;
  callName: string;
  description?: string;
  params: Array<{ name: string; type: string; required: boolean }>;
  resultType?: string;
}

interface GrpcMethodReadmeData {
  methodName: string;
  callName: string;
  description?: string;
  inputType: string;
  outputType: string;
  inputFields: Array<{ name: string; type: string }>;
  serverStreaming: boolean;
  clientStreaming: boolean;
}

interface GrpcServiceReadmeData {
  serviceName: string;
  clientClass: string;
  clientVar: string;
  methods: GrpcMethodReadmeData[];
}

interface WsSchemaReadmeData {
  name: string;
  className: string;
  properties: Array<{ name: string; type: string; required: boolean }>;
}

interface OpenRpcSchemaReadmeData {
  name: string;
  description?: string;
  properties: Array<{ name: string; type: string; required: boolean }>;
}

interface GrpcMessageReadmeData {
  name: string;
  description?: string;
  fields: Array<{ name: string; type: string; repeated: boolean; optional: boolean }>;
}

interface GrpcEnumReadmeData {
  name: string;
  description?: string;
  values: Array<{ name: string; number: number }>;
}

export interface LanguageTemplateData {
  spec: ParsedSpec;
  version: string;
  config: CodegenContext;
  resources: ResourceData[];
  schemas: SchemaData[];
  types: LanguageTypeMap;
  naming: NamingConventions;
  lang: LanguageTemplateConfig;
  clientClass: string;
  gqlClientClass?: string;
  wsClientClass?: string;
  grpcClientClass?: string;
  openRpcClientClass?: string;
  utils: {
    singularize: typeof singularize;
    toPascalCase: typeof toPascalCase;
    toCamelCase: typeof toCamelCase;
    toSnakeCase: typeof toSnakeCase;
    toKebabCase: typeof toKebabCase;
    toUpperSnakeCase: typeof toUpperSnakeCase;
    mapType: (schema: SchemaObject) => string;
  };
  gql?: GqlReadmeData;
  wsChannels?: WsChannelReadmeData[];
  wsSchemas?: WsSchemaReadmeData[];
  grpcServices?: GrpcServiceReadmeData[];
  grpcTypes?: { messages: GrpcMessageReadmeData[]; enums: GrpcEnumReadmeData[] };
  openRpcMethods?: OpenRpcMethodReadmeData[];
  openRpcSchemas?: OpenRpcSchemaReadmeData[];
}

interface SchemaData {
  name: string;
  className: string;
  isEnum: boolean;
  enumValues?: (string | number)[];
  properties: PropertyData[];
  required: string[];
}

interface PropertyData {
  originalName: string;
  name: string;
  type: string;
  required: boolean;
  description?: string;
  isFile: boolean;
  isFileArray: boolean;
}

interface ResourceData {
  name: string;
  className: string;
  fileName: string;
  operations: OperationData[];
}

interface OperationData {
  name: string;
  method: string;
  path: string;
  summary?: string;
  pathParams: ParamData[];
  queryParams: ParamData[];
  hasBody: boolean;
  bodyType: string;
  responseType: string;
  listItemType?: string;
  responseInlineProps?: PropertyData[];
  bodyInlineProps?: PropertyData[];
  contentType?: string;
  isMultipart: boolean;
  isRawBinary: boolean;
  multipartFields: PropertyData[];
}

interface ParamData {
  originalName: string;
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

export abstract class TemplateBasedPlugin implements LanguagePlugin {
  abstract readonly language: string;
  abstract readonly displayName: string;
  abstract readonly fileExtension: string;
  protected abstract readonly langConfig: LanguageTemplateConfig;

  private eta: Eta;
  private templateRenderer?: LayeredTemplateRenderer;

  constructor() {
    this.eta = new Eta({ autoEscape: false, autoTrim: false, views: '.' });
  }

  async generate(context: CodegenContext): Promise<GeneratedFile[]> {
    const files: GeneratedFile[] = [];
    const packageVersion = resolveVersion(context.languageConfig.output_dir);
    const { spec } = context;
    const lc = this.langConfig;

    const schemas = this.buildSchemas(spec, lc);
    const resources = this.buildResources(spec, lc);
    const templateDir = this.getTemplateDir();
    this.templateRenderer = createLanguageTemplateRenderer(this.language, {
      templateRoot: context.templateRoot,
      templateDir: context.templateDir,
    });
    this.eta = this.templateRenderer.eta;

    const openapiTitle = getFirstSourceByType(context.config, 'openapi-spec')?.title ?? 'Api';
    const asyncapiTitle = getFirstSourceByType(context.config, 'asyncapi-spec')?.title;
    const graphqlTitle = getFirstSourceByType(context.config, 'graphql-spec')?.title;
    const grpcTitle = getFirstSourceByType(context.config, 'grpc-spec')?.title;
    const openRpcTitle = getFirstSourceByType(context.config, 'openrpc-spec')?.title;

    const templateData: LanguageTemplateData = {
      spec,
      version: packageVersion,
      config: context,
      resources,
      schemas,
      types: lc.typeMap,
      naming: lc.naming,
      lang: lc,
      clientClass: titleToPascalCase(openapiTitle),
      gqlClientClass: graphqlTitle ? titleToPascalCase(graphqlTitle) : undefined,
      wsClientClass: asyncapiTitle ? titleToPascalCase(asyncapiTitle) : undefined,
      grpcClientClass: grpcTitle ? titleToPascalCase(grpcTitle) : undefined,
      openRpcClientClass: openRpcTitle ? titleToPascalCase(openRpcTitle) : undefined,
      utils: {
        singularize,
        toPascalCase,
        toCamelCase,
        toSnakeCase,
        toKebabCase,
        toUpperSnakeCase,
        mapType: (schema: SchemaObject) => this.mapSchemaType(schema, lc),
      },
      gql: context.gqlSpec ? this.buildGqlData(context.gqlSpec) : undefined,
      wsChannels: context.asyncSpec ? this.buildWsChannels(context.asyncSpec) : undefined,
      wsSchemas: context.asyncSpec ? this.buildWsSchemas(context.asyncSpec) : undefined,
      grpcServices: context.grpcSpec
        ? this.buildGrpcServices(
            context.grpcSpec,
            grpcTitle ? titleToPascalCase(grpcTitle) : undefined,
          )
        : undefined,
      grpcTypes: context.grpcSpec ? this.buildGrpcTypes(context.grpcSpec) : undefined,
      openRpcMethods: context.openRpcSpec
        ? this.buildOpenRpcMethods(context.openRpcSpec)
        : undefined,
      openRpcSchemas: context.openRpcSpec
        ? this.buildOpenRpcSchemas(context.openRpcSpec)
        : undefined,
    };

    const clientTemplate =
      this.loadTemplate(templateDir, 'rest/client') ?? this.loadTemplate(templateDir, 'client');
    if (clientTemplate) {
      files.push({
        path: lc.clientPath?.(templateData) ?? `src/client${lc.fileExtension}`,
        content: this.render(clientTemplate, templateData),
        overwrite: true,
      });
    }

    const typesTemplate =
      this.loadTemplate(templateDir, 'rest/types') ?? this.loadTemplate(templateDir, 'types');
    if (typesTemplate) {
      if (lc.splitTypes) {
        for (const schema of schemas) {
          files.push({
            path: `src/models/${schema.className}${lc.fileExtension}`,
            content: this.render(typesTemplate, { ...templateData, schemas: [schema] }),
            overwrite: true,
          });
        }
      } else {
        files.push({
          path: lc.typesPath ?? `src/types${lc.fileExtension}`,
          content: this.render(typesTemplate, templateData),
          overwrite: true,
        });
      }
    }

    const resourceTemplate =
      this.loadTemplate(templateDir, 'rest/resource') ?? this.loadTemplate(templateDir, 'resource');
    if (resourceTemplate) {
      for (const resource of resources) {
        files.push({
          path:
            lc.resourcePath?.(resource) ?? `src/resources/${resource.fileName}${lc.fileExtension}`,
          content: this.render(resourceTemplate, { ...templateData, resource }),
          overwrite: true,
        });
      }
    }

    const indexTemplate = this.loadTemplate(templateDir, 'index');
    if (indexTemplate) {
      files.push({
        path: lc.indexPath ?? `src/index${lc.fileExtension}`,
        content: this.render(indexTemplate, templateData),
        overwrite: true,
      });
    }

    const readmeTemplate = this.loadTemplate(templateDir, 'readme');
    if (readmeTemplate) {
      const repositoryUrl = context.languageConfig.github_repository
        ? normalizeRepositoryUrl(context.languageConfig.github_repository)
        : undefined;
      const readme = this.render(readmeTemplate, templateData);
      files.push({
        path: 'README.md',
        content: repositoryUrl ? this.addRepositoryLink(readme, repositoryUrl) : readme,
        overwrite: true,
      });
    }

    if (lc.packageTemplates) {
      const pkgData: PackageTemplateData = {
        packageName: context.languageConfig.package_name,
        version: packageVersion,
        project: context.config.project,
        title: spec.info.title,
        hasWs: hasSourceType(context.config, 'asyncapi-spec'),
        hasGql: hasSourceType(context.config, 'graphql-spec'),
        hasOpenRpc: hasSourceType(context.config, 'openrpc-spec'),
        hasGrpc: hasSourceType(context.config, 'grpc-spec'),
        repositoryUrl: context.languageConfig.github_repository
          ? normalizeRepositoryUrl(context.languageConfig.github_repository)
          : undefined,
        gitRepositoryUrl: context.languageConfig.github_repository
          ? gitRepositoryUrl(context.languageConfig.github_repository)
          : undefined,
        naming: lc.naming,
        utils: { toPascalCase, toSnakeCase, toKebabCase },
      };
      for (const pt of lc.packageTemplates) {
        const tmpl = this.loadTemplate(templateDir, pt.template);
        if (tmpl) {
          const outPath = typeof pt.path === 'function' ? pt.path(pkgData) : pt.path;
          files.push({
            path: outPath,
            content: this.eta.renderString(tmpl, pkgData),
            overwrite: true,
          });
        }
      }
    }

    files.push(...lc.packageFiles(context));

    files.push({
      path: '.cortex-package.json',
      content: `${JSON.stringify(
        {
          schemaVersion: 1,
          language: context.languageConfig.language,
          packageName: context.languageConfig.package_name,
          version: packageVersion,
          ...(context.languageConfig.github_repository
            ? { githubRepository: normalizeRepositoryUrl(context.languageConfig.github_repository) }
            : {}),
        },
        null,
        2,
      )}\n`,
      overwrite: true,
    });

    return applyFileTemplateOverrides(files, this.templateRenderer, templateData, 'language');
  }

  private addRepositoryLink(content: string, repositoryUrl: string): string {
    const heading = content.match(/^# .+$/m);
    if (heading?.index === undefined) return content;
    const insertAt = heading.index + heading[0].length;
    return `${content.slice(0, insertAt)}\n\n[Source repository](${repositoryUrl})${content.slice(insertAt)}`;
  }

  getTemplateDir(): string {
    return findLanguageTemplateDir(this.language);
  }

  loadTemplate(dir: string, name: string): string | null {
    if (this.templateRenderer) return this.templateRenderer.load(name);
    const candidates = [path.join(dir, `${name}.ejs`)];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return fs.readFileSync(candidate, 'utf-8');
    }
    return null;
  }

  private render(
    template: string,
    data: LanguageTemplateData & { resource?: ResourceData },
  ): string {
    return this.eta.renderString(template, data);
  }

  renderSnippet(
    templateName: string,
    data: Record<string, unknown>,
    options?: TemplateRenderOptions,
  ): string | null {
    return createLanguageTemplateRenderer(this.language, options).render(templateName, data);
  }

  private buildSchemas(spec: ParsedSpec, lc: LanguageTemplateConfig): SchemaData[] {
    const schemas: SchemaData[] = [];

    for (const [name, schema] of spec.schemas) {
      if (schema.enum) {
        schemas.push({
          name,
          className: lc.naming.className(name),
          isEnum: true,
          enumValues: schema.enum,
          properties: [],
          required: [],
        });
      } else if (schema.type === 'object' || schema.properties) {
        schemas.push({
          name,
          className: lc.naming.className(name),
          isEnum: false,
          properties: schema.properties
            ? Object.entries(schema.properties).map(([propName, propSchema]) => ({
                originalName: propName,
                name: lc.naming.propertyName(propName),
                type: this.mapSchemaType(propSchema, lc),
                required: schema.required?.includes(propName) ?? false,
                description: propSchema.description,
                isFile: this.isBinarySchema(propSchema),
                isFileArray: this.isBinaryArraySchema(propSchema),
              }))
            : [],
          required: schema.required ?? [],
        });
      }
    }

    return schemas;
  }

  private buildResources(spec: ParsedSpec, lc: LanguageTemplateConfig): ResourceData[] {
    return spec.resources.map((resource) => ({
      name: resource.name,
      className: lc.naming.className(singularize(resource.name)) + 'Resource',
      fileName: lc.naming.fileName(resource.name),
      operations: resource.operations.map((op) => this.buildOperation(op, lc, spec)),
    }));
  }

  private buildInlineProps(
    schema: SchemaObject | undefined,
    lc: LanguageTemplateConfig,
  ): PropertyData[] | undefined {
    if (!schema || schema.ref || !schema.properties) return undefined;
    if (schema.type !== 'object') return undefined;
    return Object.entries(schema.properties).map(([propName, propSchema]) => ({
      originalName: propName,
      name: lc.naming.propertyName(propName),
      type: this.mapSchemaType(propSchema, lc),
      required: schema.required?.includes(propName) ?? false,
      description: propSchema.description,
      isFile: this.isBinarySchema(propSchema),
      isFileArray: this.isBinaryArraySchema(propSchema),
    }));
  }

  private buildOperation(
    op: Operation,
    lc: LanguageTemplateConfig,
    spec: ParsedSpec,
  ): OperationData {
    const response =
      op.responses.find((r) => r.statusCode.startsWith('2') && r.schema) ??
      op.responses.find((r) => r.statusCode.startsWith('2'));

    let listItemType: string | undefined;
    const schema = response?.schema;
    if (schema?.type === 'object' && schema.properties) {
      const dataProp = schema.properties['data'];
      if (dataProp?.type === 'array' && dataProp.items) {
        listItemType = this.mapSchemaType(dataProp.items, lc);
      }
    }

    const responseType = this.mapResponseType(op, lc);
    const bodyType = op.requestBody?.schema
      ? this.mapSchemaType(op.requestBody.schema, lc)
      : lc.typeMap.object;
    const requestSchema =
      op.requestBody?.schema.ref && op.requestBody.schema.name
        ? (spec.schemas.get(op.requestBody.schema.name) ?? op.requestBody.schema)
        : op.requestBody?.schema;
    const multipartFields =
      op.requestBody?.contentType.toLowerCase() === 'multipart/form-data'
        ? (this.buildInlineProps(requestSchema, lc) ?? [])
        : [];
    const isRawBinary =
      !!op.requestBody &&
      op.requestBody.contentType.toLowerCase() !== 'multipart/form-data' &&
      this.isBinarySchema(requestSchema);

    return {
      name: (op.extensions['method-name'] as string) ?? lc.naming.methodName(op.operationId),
      method: op.method.toUpperCase(),
      path: op.path,
      summary: op.summary,
      pathParams: op.parameters
        .filter((p) => p.in === 'path')
        .map((p) => ({
          originalName: p.name,
          name: lc.naming.parameterName(p.name),
          type: this.mapSchemaType(p.schema, lc),
          required: p.required,
          description: p.description,
        })),
      queryParams: op.parameters
        .filter((p) => p.in === 'query')
        .map((p) => ({
          originalName: p.name,
          name: lc.naming.parameterName(p.name),
          type: this.mapSchemaType(p.schema, lc),
          required: p.required,
          description: p.description,
        })),
      hasBody: !!op.requestBody,
      bodyType,
      responseType,
      listItemType,
      responseInlineProps:
        responseType === lc.typeMap.object
          ? this.buildInlineProps(response?.schema, lc)
          : undefined,
      bodyInlineProps:
        bodyType === lc.typeMap.object && op.requestBody?.schema
          ? this.buildInlineProps(op.requestBody.schema, lc)
          : undefined,
      contentType: op.requestBody?.contentType,
      isMultipart: op.requestBody?.contentType.toLowerCase() === 'multipart/form-data',
      isRawBinary,
      multipartFields,
    };
  }

  private isBinarySchema(schema: SchemaObject | undefined): boolean {
    return schema?.type === 'string' && schema.format === 'binary';
  }

  private isBinaryArraySchema(schema: SchemaObject | undefined): boolean {
    return schema?.type === 'array' && this.isBinarySchema(schema.items);
  }

  private mapResponseType(op: Operation, lc: LanguageTemplateConfig): string {
    const response =
      op.responses.find((r) => r.statusCode.startsWith('2') && r.schema) ??
      op.responses.find((r) => r.statusCode.startsWith('2'));

    return response?.schema ? this.mapSchemaType(response.schema, lc) : lc.typeMap.void;
  }

  private buildGqlData(spec: GraphQLSpec): GqlReadmeData {
    const mapOp = (op: GraphQLOperation): GqlOpData => ({
      name: op.name,
      description: op.description,
      args: op.args.map((a) => ({
        name: a.name,
        type: a.type,
        typeRaw: a.typeRaw,
        required: a.required,
      })),
      returnType: op.returnType,
      returnTypeRaw: op.returnTypeRaw,
    });
    const mapFields = (
      fields: Array<{ name: string; typeRaw: string; required: boolean; description?: string }>,
    ): GqlFieldData[] =>
      fields.map((f) => ({
        name: f.name,
        typeRaw: f.typeRaw,
        required: f.required,
        description: f.description,
      }));
    return {
      queries: spec.queries.map(mapOp),
      mutations: spec.mutations.map(mapOp),
      subscriptions: spec.subscriptions.map(mapOp),
      types: (spec.types ?? []).map((t) => ({
        name: t.name,
        description: t.description,
        fields: mapFields(t.fields),
      })),
      inputs: (spec.inputs ?? []).map((i) => ({
        name: i.name,
        description: i.description,
        fields: mapFields(i.fields),
      })),
      enums: (spec.enums ?? []).map((e) => ({
        name: e.name,
        description: e.description,
        values: e.values,
      })),
    };
  }

  private buildWsChannels(spec: AsyncApiSpec): WsChannelReadmeData[] {
    return spec.channels.map((ch: AsyncApiChannel) => {
      const channelId = ch.name;
      const segments = channelId.split('/').map((s) => s.charAt(0).toUpperCase() + s.slice(1));
      const handlerName = 'on' + segments.join('');
      const sendName = 'send' + segments.join('');

      const buildProps = (
        schema?: SchemaObject,
      ): Array<{ name: string; type: string }> | undefined => {
        if (!schema?.properties) return undefined;
        return Object.entries(schema.properties).map(([name, propSchema]) => ({
          name,
          type: propSchema.type ?? 'string',
        }));
      };

      return {
        channelId,
        description: ch.description,
        handlerName,
        sendName,
        canSubscribe: !!ch.subscribe,
        canPublish: !!ch.publish,
        subscribeMessage: ch.subscribe?.message.schema
          ? { properties: buildProps(ch.subscribe.message.schema) ?? [] }
          : undefined,
        publishMessage: ch.publish?.message.schema
          ? { properties: buildProps(ch.publish.message.schema) ?? [] }
          : undefined,
      };
    });
  }

  private buildGrpcServices(spec: GrpcSpec, grpcClientClass?: string): GrpcServiceReadmeData[] {
    const messagesByName = new Map(spec.messages.map((message) => [message.name, message]));
    const numericProtoTypes = new Set([
      'int32',
      'int64',
      'uint32',
      'uint64',
      'sint32',
      'sint64',
      'fixed32',
      'fixed64',
      'sfixed32',
      'sfixed64',
      'float',
      'double',
    ]);

    return spec.services.map((service) => {
      const clientClass = grpcClientClass ?? `${service.name}Client`;
      const clientVar = grpcClientClass
        ? grpcClientClass.charAt(0).toLowerCase() + grpcClientClass.slice(1)
        : service.name.charAt(0).toLowerCase() +
          service.name.slice(1).replace(/Service$/, '') +
          'Client';

      return {
        serviceName: service.name,
        clientClass,
        clientVar,
        methods: service.methods.map((method) => ({
          methodName: method.name,
          callName: method.name.charAt(0).toLowerCase() + method.name.slice(1),
          description: method.description,
          inputType: method.inputType,
          outputType: method.outputType,
          inputFields: (messagesByName.get(method.inputType)?.fields ?? []).map((field) => ({
            name: field.name,
            type: numericProtoTypes.has(field.type)
              ? 'number'
              : field.type === 'bool'
                ? 'boolean'
                : 'string',
          })),
          serverStreaming: method.serverStreaming,
          clientStreaming: method.clientStreaming,
        })),
      };
    });
  }

  private buildGrpcTypes(spec: GrpcSpec): {
    messages: GrpcMessageReadmeData[];
    enums: GrpcEnumReadmeData[];
  } {
    return {
      messages: spec.messages.map((message) => ({
        name: message.name,
        description: message.description,
        fields: message.fields.map((field) => ({
          name: field.name,
          type: field.type,
          repeated: field.repeated,
          optional: field.optional,
        })),
      })),
      enums: (spec.enums ?? []).map((grpcEnum) => ({
        name: grpcEnum.name,
        description: grpcEnum.description,
        values: grpcEnum.values.map((value) => ({ name: value.name, number: value.number })),
      })),
    };
  }

  private buildOpenRpcMethods(spec: OpenRpcSpec): OpenRpcMethodReadmeData[] {
    return spec.methods.map((method) => ({
      methodName: method.name,
      callName: method.name.charAt(0).toLowerCase() + method.name.slice(1),
      description: method.description,
      params: method.params.map((p) => ({
        name: p.name,
        type: p.schema.type ?? 'string',
        required: p.required,
      })),
      resultType: method.result?.schema.type,
    }));
  }

  private buildWsSchemas(spec: AsyncApiSpec): WsSchemaReadmeData[] {
    const schemas: WsSchemaReadmeData[] = [];
    for (const [name, schema] of spec.schemas) {
      if (schema.properties) {
        schemas.push({
          name,
          className: toPascalCase(name),
          properties: Object.entries(schema.properties).map(([propName, propSchema]) => ({
            name: propName,
            type: propSchema.type ?? 'string',
            required: schema.required?.includes(propName) ?? false,
          })),
        });
      }
    }
    return schemas;
  }

  private buildOpenRpcSchemas(spec: OpenRpcSpec): OpenRpcSchemaReadmeData[] {
    const schemas: OpenRpcSchemaReadmeData[] = [];
    for (const [name, schema] of spec.schemas) {
      if (schema.properties) {
        schemas.push({
          name,
          description: schema.description,
          properties: Object.entries(schema.properties).map(([propName, propSchema]) => ({
            name: propName,
            type: propSchema.type ?? 'string',
            required: schema.required?.includes(propName) ?? false,
          })),
        });
      }
    }
    return schemas;
  }

  protected mapSchemaType(schema: SchemaObject, lc: LanguageTemplateConfig): string {
    const { typeMap: types, naming } = lc;

    if (schema.ref && schema.name) return naming.className(schema.name);
    if (schema.enum) return types.string;

    switch (schema.type) {
      case 'string':
        if (schema.format === 'binary') return types.file ?? types.string;
        return schema.format === 'date-time' ? types.datetime : types.string;
      case 'integer':
        return types.integer;
      case 'number':
        return types.number;
      case 'boolean':
        return types.boolean;
      case 'array':
        return schema.items
          ? types.array(this.mapSchemaType(schema.items, lc))
          : types.array(types.any);
      case 'object':
        if (schema.properties && types.objectLiteral) {
          return types.objectLiteral(
            Object.entries(schema.properties).map(([name, propertySchema]) => ({
              name,
              type: this.mapSchemaType(propertySchema, lc),
              required: schema.required?.includes(name) ?? false,
            })),
          );
        }
        if (schema.additionalProperties && typeof schema.additionalProperties !== 'boolean') {
          return types.map(this.mapSchemaType(schema.additionalProperties, lc));
        }
        return types.object;
      default:
        return types.any;
    }
  }
}
