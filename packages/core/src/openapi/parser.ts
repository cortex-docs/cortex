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

export class OpenAPIParser {
  async parse(specPath: string): Promise<ParsedSpec> {
    const api = (await SwaggerParser.bundle(specPath)) as OpenAPIV3_1.Document;

    const extensions = extractExtensions(api as unknown as Record<string, unknown>);
    const operations = this.extractOperations(api, extensions);
    const resources = this.groupByResource(operations);
    const schemas = this.extractSchemas(api);
    this.promoteInlineSchemas(operations, schemas);

    return {
      raw: api,
      info: {
        title: api.info.title,
        version: api.info.version,
        description: api.info.description,
        servers: (api.servers ?? []).map((s) => ({
          url: s.url,
          description: s.description,
        })),
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

    try {
      const api = (await SwaggerParser.validate(specPath)) as OpenAPIV3_1.Document;

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

      return { valid: true, errors, warnings };
    } catch (err) {
      errors.push({
        path: '',
        message: err instanceof Error ? err.message : String(err),
      });
      return { valid: false, errors, warnings };
    }
  }

  private extractOperations(
    spec: OpenAPIV3_1.Document,
    extensions: ReturnType<typeof extractExtensions>,
  ): Operation[] {
    const operations: Operation[] = [];

    if (!spec.paths) return operations;

    for (const [path, pathItem] of Object.entries(spec.paths)) {
      if (!pathItem) continue;

      for (const method of HTTP_METHODS) {
        const op = (pathItem as Record<string, unknown>)[method] as
          | OpenAPIV3_1.OperationObject
          | undefined;
        if (!op) continue;

        const opRecord = op as unknown as Record<string, unknown>;
        const resourceName = (opRecord['x-cortex-resource'] as string) ?? op.tags?.[0] ?? 'default';

        const operationId = op.operationId ?? `${method}_${path.replace(/\//g, '_')}`;

        operations.push({
          operationId,
          method,
          path,
          summary: op.summary,
          description: op.description,
          parameters: this.extractParameters(op.parameters as OpenAPIV3_1.ParameterObject[]),
          requestBody: this.extractRequestBody(op.requestBody as OpenAPIV3_1.RequestBodyObject),
          responses: this.extractResponses(
            op.responses as Record<string, OpenAPIV3_1.ResponseObject>,
          ),
          tags: op.tags ?? [],
          resourceName,
          extensions: getOperationExtensions(opRecord),
        });
      }
    }

    return operations;
  }

  private extractParameters(params?: OpenAPIV3_1.ParameterObject[]): Parameter[] {
    if (!params) return [];

    return params.map((p) => ({
      name: p.name,
      in: p.in as Parameter['in'],
      required: p.required ?? false,
      description: p.description,
      schema: this.convertSchema(p.schema as OpenAPIV3_1.SchemaObject),
    }));
  }

  private extractRequestBody(body?: OpenAPIV3_1.RequestBodyObject): RequestBody | undefined {
    if (!body?.content) return undefined;

    const contentType = Object.keys(body.content)[0];
    if (!contentType) return undefined;

    const mediaType = body.content[contentType];
    return {
      required: body.required ?? false,
      contentType,
      schema: this.convertSchema(mediaType?.schema as OpenAPIV3_1.SchemaObject),
    };
  }

  private extractResponses(responses?: Record<string, OpenAPIV3_1.ResponseObject>): ResponseInfo[] {
    if (!responses) return [];

    return Object.entries(responses).map(([statusCode, response]) => {
      const contentType = response.content ? Object.keys(response.content)[0] : undefined;
      const schema =
        contentType && response.content?.[contentType]?.schema
          ? this.convertSchema(response.content[contentType].schema as OpenAPIV3_1.SchemaObject)
          : undefined;

      return {
        statusCode,
        description: response.description ?? '',
        contentType,
        schema,
      };
    });
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

    if (schema.required) {
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
        op.requestBody.schema = { type: 'object', name, ref: `#/components/schemas/${name}` };
      }
    }
  }

  private isInlineObject(schema: SchemaObject): boolean {
    return schema.type === 'object' && !!schema.properties && !schema.ref;
  }

  private uniqueSchemaName(operationId: string, suffix: string, schemas: Map<string, SchemaObject>): string {
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
