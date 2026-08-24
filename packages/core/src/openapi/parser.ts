import SwaggerParser from '@apidevtools/swagger-parser';
import type { OpenAPIV3_1 } from 'openapi-types';
import { extractExtensions, getOperationExtensions } from './extensions';
import type {
  HttpMethod,
  Operation,
  Parameter,
  ParsedSpec,
  RequestBody,
  Resource,
  ResponseInfo,
  SchemaObject,
  ValidationResult,
} from './types';

const HTTP_METHODS: HttpMethod[] = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

function isRemoteLocation(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function trimTrailingSlash(value: string): string {
  if (value === '/') return value;
  return value.replace(/\/$/, '');
}

/**
 * Resolve OpenAPI Server Objects in the context of the source document.
 *
 * OpenAPI defaults an omitted `servers` array to `/`. For a remote document,
 * that relative URL has an unambiguous origin and can be made useful to SDKs
 * and the docs UI. A local file has no HTTP origin, so its implicit server is
 * left unspecified and callers can use their runtime origin or an override.
 */
export function resolveOpenApiServers(
  specLocation: string,
  servers: OpenAPIV3_1.ServerObject[] | undefined,
): Array<{ url: string; description?: string }> {
  const remote = isRemoteLocation(specLocation);
  const candidates = servers?.length ? servers : remote ? [{ url: '/' }] : [];

  return candidates.map((server) => {
    let serverUrl = server.url;
    for (const [name, variable] of Object.entries(server.variables ?? {})) {
      serverUrl = serverUrl.replaceAll(`{${name}}`, String(variable.default));
    }

    if (remote) {
      serverUrl = new URL(serverUrl, specLocation).toString();
    }

    return {
      url: trimTrailingSlash(serverUrl),
      description: server.description,
    };
  });
}

export class OpenAPIParser {
  async parse(specPath: string): Promise<ParsedSpec> {
    const api = (await SwaggerParser.bundle(specPath)) as OpenAPIV3_1.Document;

    const extensions = extractExtensions(api as unknown as Record<string, unknown>);
    const operations = this.extractOperations(api);
    const resources = this.groupByResource(operations);
    const schemas = this.extractSchemas(api);
    this.promoteInlineSchemas(operations, schemas);

    return {
      raw: api,
      info: {
        title: api.info.title,
        version: api.info.version,
        description: api.info.description,
        servers: resolveOpenApiServers(specPath, api.servers),
      },
      resources,
      operations,
      schemas,
      extensions,
    };
  }

  async validate(specPath: string): Promise<ValidationResult> {
    const errors: { path: string; message: string }[] = [];
    const warnings: { path: string; message: string }[] = [];

    let api: OpenAPIV3_1.Document;
    try {
      api = (await SwaggerParser.bundle(specPath)) as OpenAPIV3_1.Document;

      if (
        !api ||
        typeof api !== 'object' ||
        typeof api.openapi !== 'string' ||
        !api.openapi.startsWith('3.') ||
        !api.info ||
        typeof api.info.title !== 'string' ||
        typeof api.info.version !== 'string' ||
        !api.paths ||
        typeof api.paths !== 'object'
      ) {
        throw new Error('Source is not a structurally valid OpenAPI 3.x document');
      }

      try {
        await SwaggerParser.validate(specPath);
      } catch (err) {
        warnings.push({
          path: '',
          message: `OpenAPI schema validation reported: ${err instanceof Error ? err.message : String(err)}`,
        });
      }

      if (!api.paths || Object.keys(api.paths).length === 0) {
        warnings.push({ path: 'paths', message: 'No paths defined in the spec' });
      }

      if (api.paths) {
        for (const [pathStr, pathItem] of Object.entries(api.paths)) {
          if (!pathItem) continue;
          for (const method of HTTP_METHODS) {
            const op = (pathItem as Record<string, unknown>)[method] as
              | Record<string, unknown>
              | undefined;
            if (!op) continue;
            if (!op['operationId']) {
              warnings.push({
                path: `paths.${pathStr}.${method}`,
                message: 'Missing operationId',
              });
            }
          }
        }
      }
    } catch (err) {
      errors.push({
        path: '',
        message: err instanceof Error ? err.message : String(err),
      });
      return { valid: false, errors, warnings };
    }

    return { valid: true, errors, warnings };
  }

  private extractOperations(spec: OpenAPIV3_1.Document): Operation[] {
    const operations: Operation[] = [];

    if (!spec.paths) return operations;

    for (const [path, pathItem] of Object.entries(spec.paths)) {
      if (!pathItem) continue;
      const pathParameters = this.extractParameters(
        (pathItem as OpenAPIV3_1.PathItemObject).parameters,
        spec,
      );

      for (const method of HTTP_METHODS) {
        const op = (pathItem as Record<string, unknown>)[method] as
          | OpenAPIV3_1.OperationObject
          | undefined;
        if (!op) continue;

        const opRecord = op as unknown as Record<string, unknown>;
        const extensionResource =
          typeof opRecord['x-cortex-resource'] === 'string'
            ? opRecord['x-cortex-resource'].trim()
            : '';
        const firstTag = op.tags?.find((tag) => typeof tag === 'string' && tag.trim())?.trim();
        const resourceName = extensionResource || firstTag || 'default';

        const operationId = op.operationId?.trim() || `${method}_${path.replace(/\//g, '_')}`;

        const operationParameters = this.extractParameters(op.parameters, spec);
        const parameters = new Map(
          pathParameters.map((parameter) => [`${parameter.in}:${parameter.name}`, parameter]),
        );
        for (const parameter of operationParameters) {
          parameters.set(`${parameter.in}:${parameter.name}`, parameter);
        }

        operations.push({
          operationId,
          method,
          path,
          summary: op.summary,
          description: op.description,
          parameters: Array.from(parameters.values()),
          requestBody: this.extractRequestBody(op.requestBody, spec),
          responses: this.extractResponses(op.responses, spec),
          tags: op.tags ?? [],
          resourceName,
          extensions: getOperationExtensions(opRecord),
        });
      }
    }

    return operations;
  }

  private extractParameters(
    params: (OpenAPIV3_1.ParameterObject | OpenAPIV3_1.ReferenceObject)[] | undefined,
    spec: OpenAPIV3_1.Document,
  ): Parameter[] {
    if (!params) return [];

    return params.map((candidate) => {
      const parameter = this.resolveComponentReference<OpenAPIV3_1.ParameterObject>(
        candidate,
        spec,
      );
      return {
        name: parameter.name,
        in: parameter.in as Parameter['in'],
        required: parameter.required ?? false,
        description: parameter.description,
        schema: this.convertSchema(parameter.schema as OpenAPIV3_1.SchemaObject),
      };
    });
  }

  private extractRequestBody(
    candidate: OpenAPIV3_1.RequestBodyObject | OpenAPIV3_1.ReferenceObject | undefined,
    spec: OpenAPIV3_1.Document,
  ): RequestBody | undefined {
    if (!candidate) return undefined;
    const body = this.resolveComponentReference<OpenAPIV3_1.RequestBodyObject>(candidate, spec);
    if (!body?.content) return undefined;

    const contentTypes = Object.keys(body.content);
    const contentType =
      contentTypes.find((type) => type.toLowerCase() === 'multipart/form-data') ??
      contentTypes.find((type) => {
        const schema = body.content[type]?.schema as OpenAPIV3_1.SchemaObject | undefined;
        return schema?.type === 'string' && schema.format === 'binary';
      }) ??
      contentTypes[0];
    if (!contentType) return undefined;

    const mediaType = body.content[contentType];
    return {
      required: body.required ?? false,
      contentType,
      schema: this.convertReferencedSchema(mediaType?.schema, spec),
    };
  }

  private extractResponses(
    responses: OpenAPIV3_1.ResponsesObject | undefined,
    spec: OpenAPIV3_1.Document,
  ): ResponseInfo[] {
    if (!responses) return [];

    return Object.entries(responses).map(([statusCode, candidate]) => {
      const response = this.resolveComponentReference<OpenAPIV3_1.ResponseObject>(candidate, spec);
      const contentType = response.content ? Object.keys(response.content)[0] : undefined;
      const schema =
        contentType && response.content?.[contentType]?.schema
          ? this.convertReferencedSchema(response.content[contentType].schema, spec)
          : undefined;

      return {
        statusCode,
        description: response.description ?? '',
        contentType,
        schema,
      };
    });
  }

  private resolveComponentReference<T>(
    candidate: T | OpenAPIV3_1.ReferenceObject,
    spec: OpenAPIV3_1.Document,
  ): T {
    const reference = (candidate as OpenAPIV3_1.ReferenceObject).$ref;
    if (!reference?.startsWith('#/')) return candidate as T;
    const value = reference
      .slice(2)
      .split('/')
      .reduce<unknown>((current, part) => {
        if (!current || typeof current !== 'object') return undefined;
        return (current as Record<string, unknown>)[part.replace(/~1/g, '/').replace(/~0/g, '~')];
      }, spec);
    if (!value) throw new Error(`Cannot resolve OpenAPI reference: ${reference}`);
    return value as T;
  }

  private extractSchemas(spec: OpenAPIV3_1.Document): Map<string, SchemaObject> {
    const schemas = new Map<string, SchemaObject>();

    if (!spec.components?.schemas) return schemas;

    for (const [name, schema] of Object.entries(spec.components.schemas)) {
      schemas.set(name, {
        name,
        ...this.convertSchema(schema as OpenAPIV3_1.SchemaObject),
      });
    }

    return schemas;
  }

  private convertReferencedSchema(
    candidate: OpenAPIV3_1.SchemaObject | OpenAPIV3_1.ReferenceObject | undefined,
    spec: OpenAPIV3_1.Document,
  ): SchemaObject {
    if (!candidate) return { type: 'unknown' };
    const reference = (candidate as OpenAPIV3_1.ReferenceObject).$ref;
    if (!reference?.startsWith('#/')) {
      return this.convertSchema(candidate as OpenAPIV3_1.SchemaObject);
    }

    const resolved = this.resolveComponentReference<OpenAPIV3_1.SchemaObject>(candidate, spec);
    return {
      ...this.convertSchema(resolved),
      name: reference.split('/').pop(),
      ref: reference,
    };
  }

  private convertSchema(schema?: OpenAPIV3_1.SchemaObject): SchemaObject {
    if (!schema) return { type: 'unknown' };

    const ref = (schema as OpenAPIV3_1.ReferenceObject).$ref;
    if (ref) {
      return {
        type: 'object',
        name: ref.split('/').pop(),
        ref,
      };
    }

    const result: SchemaObject = {
      type: schema.type as string,
      format: schema.format,
      description: schema.description,
      enum: schema.enum as (string | number)[],
    };

    if (Array.isArray(schema.required)) {
      result.required = schema.required;
    }

    if (schema.properties) {
      result.properties = {};
      for (const [key, value] of Object.entries(schema.properties)) {
        result.properties[key] = this.convertSchema(value as OpenAPIV3_1.SchemaObject);
      }
    }

    if ('items' in schema && schema.items) {
      result.items = this.convertSchema(schema.items as OpenAPIV3_1.SchemaObject);
    }

    if (schema.additionalProperties !== undefined) {
      result.additionalProperties =
        typeof schema.additionalProperties === 'boolean'
          ? schema.additionalProperties
          : this.convertSchema(schema.additionalProperties as OpenAPIV3_1.SchemaObject);
    }

    if (schema.oneOf) {
      result.oneOf = (schema.oneOf as OpenAPIV3_1.SchemaObject[]).map((s) => this.convertSchema(s));
    }

    if (schema.anyOf) {
      result.anyOf = (schema.anyOf as OpenAPIV3_1.SchemaObject[]).map((s) => this.convertSchema(s));
    }

    if (schema.allOf) {
      result.allOf = (schema.allOf as OpenAPIV3_1.SchemaObject[]).map((s) => this.convertSchema(s));
    }

    return result;
  }

  private promoteInlineSchemas(operations: Operation[], schemas: Map<string, SchemaObject>): void {
    for (const op of operations) {
      for (const response of op.responses) {
        if (response.schema && this.isInlineObject(response.schema)) {
          const name = this.uniqueSchemaName(op.operationId, 'Response', schemas);
          schemas.set(name, { name, ...response.schema });
          response.schema = { type: 'object', name, ref: `#/components/schemas/${name}` };
        }
      }
      if (op.requestBody?.schema && this.isInlineObject(op.requestBody.schema)) {
        const name = this.uniqueSchemaName(op.operationId, 'Request', schemas);
        schemas.set(name, { name, ...op.requestBody.schema });
        op.requestBody.schema = {
          ...op.requestBody.schema,
          name,
          ref: `#/components/schemas/${name}`,
        };
      }
    }
  }

  private isInlineObject(schema: SchemaObject): boolean {
    return schema.type === 'object' && !!schema.properties && !schema.ref;
  }

  private uniqueSchemaName(
    operationId: string,
    suffix: string,
    schemas: Map<string, SchemaObject>,
  ): string {
    const base = operationId.charAt(0).toUpperCase() + operationId.slice(1) + suffix;
    if (!schemas.has(base)) return base;
    let i = 2;
    while (schemas.has(`${base}${i}`)) i++;
    return `${base}${i}`;
  }

  private groupByResource(operations: Operation[]): Resource[] {
    const resourceMap = new Map<string, Operation[]>();

    for (const op of operations) {
      const existing = resourceMap.get(op.resourceName) ?? [];
      existing.push(op);
      resourceMap.set(op.resourceName, existing);
    }

    return Array.from(resourceMap.entries()).map(([name, ops]) => ({
      name,
      displayName: name.charAt(0).toUpperCase() + name.slice(1),
      operations: ops,
    }));
  }
}
