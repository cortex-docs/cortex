import * as fs from 'node:fs';
import type {
  OpenRpcSpec,
  OpenRpcServer,
  OpenRpcMethod,
  OpenRpcParam,
  OpenRpcResult,
  OpenRpcSchema,
  OpenRpcErrorDef,
  OpenRpcErrorRef,
} from './types';

export class OpenRpcParser {
  async parse(specPath: string): Promise<OpenRpcSpec> {
    const content = await this.loadContent(specPath);
    const raw = JSON.parse(content);
    return this.parseDocument(raw, content);
  }

  private async loadContent(specPath: string): Promise<string> {
    if (specPath.startsWith('http://') || specPath.startsWith('https://')) {
      const res = await fetch(specPath, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`Failed to fetch ${specPath}: ${res.status}`);
      return res.text();
    }
    return fs.readFileSync(specPath, 'utf-8');
  }

  private parseDocument(raw: any, sourceContent: string): OpenRpcSpec {
    const openrpcVersion = raw.openrpc ?? '1.3.2';
    this.validateVersion(openrpcVersion);

    const schemas = this.extractSchemas(raw);
    const errors = this.extractErrors(raw);

    return {
      openrpc: openrpcVersion,
      title: raw.info?.title ?? 'OpenRPC API',
      version: raw.info?.version ?? '1.0.0',
      description: raw.info?.description,
      servers: this.extractServers(raw),
      methods: this.extractMethods(raw),
      schemas,
      errors,
      sourceContent,
    };
  }

  private validateVersion(version: string): void {
    if (!/^1\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
      throw new Error(`Unsupported OpenRPC version: ${version}. Supported: 1.x`);
    }
  }

  private extractServers(raw: any): OpenRpcServer[] {
    if (!raw.servers || !Array.isArray(raw.servers)) return [];
    return raw.servers.map((s: any) => ({
      name: s.name,
      url: s.url ?? '',
      description: s.description,
    }));
  }

  private extractMethods(raw: any): OpenRpcMethod[] {
    if (!raw.methods || !Array.isArray(raw.methods)) return [];
    return raw.methods.map((m: any) => this.parseMethod(m, raw));
  }

  private parseMethod(m: any, raw: any): OpenRpcMethod {
    const params: OpenRpcParam[] = (m.params ?? []).map((p: any) => {
      const resolved = this.resolveContentDescriptor(p, raw);
      return {
        name: resolved.name ?? 'param',
        description: resolved.description ?? resolved.summary,
        required: resolved.required ?? false,
        schema: this.convertSchema(resolved.schema, raw),
      };
    });

    let result: OpenRpcResult | undefined;
    if (m.result) {
      const resolved = this.resolveContentDescriptor(m.result, raw);
      result = {
        name: resolved.name ?? 'result',
        description: resolved.description ?? resolved.summary,
        schema: this.convertSchema(resolved.schema, raw),
      };
    }

    const tags: string[] = (m.tags ?? []).map((t: any) =>
      typeof t === 'string' ? t : (t.name ?? ''),
    );

    const errors: OpenRpcErrorRef[] = (m.errors ?? []).map((e: any) => {
      const resolved = this.resolveRef(e, raw);
      return { code: resolved.code ?? -1, message: resolved.message ?? '' };
    });

    return {
      name: m.name,
      summary: m.summary,
      description: m.description,
      params,
      result,
      tags,
      errors,
      deprecated: m.deprecated,
    };
  }

  private resolveContentDescriptor(cd: any, raw: any): any {
    if (cd?.$ref) return this.resolveRef(cd, raw);
    return cd ?? {};
  }

  private resolveRef(obj: any, raw: any): any {
    if (!obj?.$ref) return obj;
    const ref = obj.$ref as string;
    const parts = ref.replace(/^#\//, '').split('/');
    let current: any = raw;
    for (const part of parts) {
      current = current?.[part];
      if (current === undefined) return obj;
    }
    return current;
  }

  private convertSchema(schema: any, raw: any): OpenRpcSchema {
    if (!schema) return { type: 'object' };

    if (schema.$ref) {
      const refName = (schema.$ref as string).split('/').pop() ?? '';
      return { ref: schema.$ref, type: 'object', description: refName };
    }

    const result: OpenRpcSchema = {};
    if (schema.type) result.type = schema.type;
    if (schema.description) result.description = schema.description;
    if (schema.format) result.format = schema.format;
    if (schema.nullable) result.nullable = schema.nullable;
    if (schema.enum) result.enum = schema.enum;
    if (schema.default !== undefined) result.default = schema.default;

    if (schema.properties) {
      result.properties = {};
      for (const [key, val] of Object.entries(schema.properties)) {
        result.properties[key] = this.convertSchema(val, raw);
      }
    }

    if (schema.items) {
      result.items = this.convertSchema(schema.items, raw);
    }

    if (schema.required) result.required = schema.required;

    if (schema.oneOf) result.oneOf = schema.oneOf.map((s: any) => this.convertSchema(s, raw));
    if (schema.anyOf) result.anyOf = schema.anyOf.map((s: any) => this.convertSchema(s, raw));
    if (schema.allOf) result.allOf = schema.allOf.map((s: any) => this.convertSchema(s, raw));

    if (schema.additionalProperties !== undefined) {
      result.additionalProperties =
        typeof schema.additionalProperties === 'boolean'
          ? schema.additionalProperties
          : this.convertSchema(schema.additionalProperties, raw);
    }

    return result;
  }

  private extractSchemas(raw: any): Map<string, OpenRpcSchema> {
    const schemas = new Map<string, OpenRpcSchema>();
    const componentSchemas = raw.components?.schemas ?? raw.components?.contentDescriptors ?? {};
    for (const [name, schema] of Object.entries(componentSchemas)) {
      schemas.set(name, this.convertSchema(schema, raw));
    }
    return schemas;
  }

  private extractErrors(raw: any): OpenRpcErrorDef[] {
    const errors: OpenRpcErrorDef[] = [];
    const componentErrors = raw.components?.errors ?? {};
    for (const [, err] of Object.entries(componentErrors) as [string, any][]) {
      errors.push({
        code: err.code ?? -1,
        message: err.message ?? '',
        data: err.data ? this.convertSchema(err.data, raw) : undefined,
      });
    }
    return errors;
  }
}
