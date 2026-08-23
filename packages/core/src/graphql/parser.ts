import * as fs from 'node:fs';
import type {
  GraphQLSpec,
  GraphQLOperation,
  GraphQLType,
  GraphQLField,
  GraphQLEnum,
  GraphQLInput,
} from './types';

export class GraphQLParser {
  async parse(specPath: string, endpoint?: string): Promise<GraphQLSpec> {
    const content = await this.loadContent(specPath);
    return this.parseSchema(content, endpoint ?? 'http://localhost:4000/graphql');
  }

  private async loadContent(specPath: string): Promise<string> {
    if (specPath.startsWith('http://') || specPath.startsWith('https://')) {
      const res = await fetch(specPath, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`Failed to fetch ${specPath}: ${res.status}`);
      return res.text();
    }
    return fs.readFileSync(specPath, 'utf-8');
  }

  private parseSchema(sdl: string, endpoint: string): GraphQLSpec {
    const types: GraphQLType[] = [];
    const enums: GraphQLEnum[] = [];
    const inputs: GraphQLInput[] = [];
    const queries: GraphQLOperation[] = [];
    const mutations: GraphQLOperation[] = [];
    const subscriptions: GraphQLOperation[] = [];

    let title = 'GraphQL API';
    const version = '1.0.0';
    let description: string | undefined;

    const blocks = this.extractBlocks(sdl);

    for (const block of blocks) {
      if (block.kind === 'type' && block.name === 'Query') {
        queries.push(...this.parseOperationFields(block.body));
      } else if (block.kind === 'type' && block.name === 'Mutation') {
        mutations.push(...this.parseOperationFields(block.body));
      } else if (block.kind === 'type' && block.name === 'Subscription') {
        subscriptions.push(...this.parseOperationFields(block.body));
      } else if (block.kind === 'type' && block.name === 'Schema') {
        // skip schema definition
      } else if (block.kind === 'type') {
        types.push({
          name: block.name,
          description: block.description,
          fields: this.parseFields(block.body),
        });
      } else if (block.kind === 'enum') {
        enums.push({
          name: block.name,
          description: block.description,
          values: this.parseEnumValues(block.body),
        });
      } else if (block.kind === 'input') {
        inputs.push({
          name: block.name,
          description: block.description,
          fields: this.parseFields(block.body),
        });
      }
    }

    const schemaDirective = sdl.match(/@title\("([^"]+)"\)/);
    if (schemaDirective) title = schemaDirective[1];

    return {
      title,
      version,
      description,
      endpoint,
      queries,
      mutations,
      subscriptions,
      types,
      enums,
      inputs,
    };
  }

  private extractBlocks(
    sdl: string,
  ): Array<{ kind: string; name: string; body: string; description?: string }> {
    const blocks: Array<{ kind: string; name: string; body: string; description?: string }> = [];
    const regex =
      /(?:"""([\s\S]*?)"""\s*)?(?:#\s*(.*?)\n\s*)?(type|input|enum|interface|union|scalar)\s+(\w+)(?:\s+implements\s+\w+(?:\s*&\s*\w+)*)?\s*\{([^}]*)\}/g;
    let match;

    while ((match = regex.exec(sdl)) !== null) {
      blocks.push({
        kind: match[3],
        name: match[4],
        body: match[5],
        description: match[1]?.trim() ?? match[2]?.trim(),
      });
    }

    return blocks;
  }

  private parseFields(body: string): GraphQLField[] {
    const fields: GraphQLField[] = [];
    const lines = body
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));

    for (const line of lines) {
      const desc = line.match(/"""(.*?)"""/)?.[1]?.trim();
      const cleaned = line
        .replace(/""".*?"""\s*/, '')
        .replace(/#.*$/, '')
        .trim();
      const match = cleaned.match(/^(\w+)(?:\([^)]*\))?\s*:\s*(.+?)$/);
      if (!match) continue;

      const [, name, typeStr] = match;
      const { type, required, isList } = this.parseTypeRef(typeStr);

      fields.push({ name, type, typeRaw: typeStr.trim(), required, description: desc, isList });
    }

    return fields;
  }

  private parseOperationFields(body: string): GraphQLOperation[] {
    const ops: GraphQLOperation[] = [];
    const lines = body
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));

    for (const line of lines) {
      const desc = line.match(/"""(.*?)"""/)?.[1]?.trim();
      const cleaned = line
        .replace(/""".*?"""\s*/, '')
        .replace(/#.*$/, '')
        .trim();

      const match = cleaned.match(/^(\w+)(?:\(([^)]*)\))?\s*:\s*(.+?)$/);
      if (!match) continue;

      const [, name, argsStr, returnTypeRaw] = match;
      const { type: returnType } = this.parseTypeRef(returnTypeRaw);
      const args = argsStr ? this.parseArgs(argsStr) : [];

      ops.push({ name, description: desc, args, returnType, returnTypeRaw: returnTypeRaw.trim() });
    }

    return ops;
  }

  private parseArgs(argsStr: string): GraphQLField[] {
    const args: GraphQLField[] = [];
    const parts = argsStr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const part of parts) {
      const match = part.match(/^(\w+)\s*:\s*(.+?)$/);
      if (!match) continue;

      const [, name, typeStr] = match;
      const { type, required, isList } = this.parseTypeRef(typeStr);
      args.push({ name, type, typeRaw: typeStr.trim(), required, isList });
    }

    return args;
  }

  private parseEnumValues(body: string): string[] {
    return body
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && !l.startsWith('"'));
  }

  private parseTypeRef(raw: string): { type: string; required: boolean; isList: boolean } {
    let s = raw.trim();
    const required = s.endsWith('!');
    if (required) s = s.slice(0, -1);
    const isList = s.startsWith('[');
    if (isList) s = s.replace(/^\[/, '').replace(/\]!?$/, '');
    s = s.replace(/!$/, '');
    return { type: s.trim(), required, isList };
  }
}
