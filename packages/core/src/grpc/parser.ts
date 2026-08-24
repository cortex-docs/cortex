import * as fs from 'node:fs';
import type { GrpcSpec, GrpcService, GrpcMethod, GrpcMessage, GrpcField, GrpcEnum } from './types';

interface ProtoBlock {
  name: string;
  body: string;
  description?: string;
}

export class GrpcParser {
  async parse(specPath: string): Promise<GrpcSpec> {
    const content = await this.loadContent(specPath);
    return this.parseProto(content);
  }

  private async loadContent(specPath: string): Promise<string> {
    if (specPath.startsWith('http://') || specPath.startsWith('https://')) {
      const res = await fetch(specPath, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`Failed to fetch ${specPath}: ${res.status}`);
      return res.text();
    }
    return fs.readFileSync(specPath, 'utf-8');
  }

  private parseProto(content: string): GrpcSpec {
    const packageName = content.match(/\bpackage\s+([\w.]+)\s*;/)?.[1] ?? 'default';
    const services = this.extractServices(content);
    const messages = this.extractMessages(content);
    const enums = this.extractEnums(content);

    return {
      title:
        packageName
          .split('.')
          .pop()
          ?.replace(/^./, (c) => c.toUpperCase()) ?? 'gRPC API',
      version: '1.0.0',
      package: packageName,
      services,
      messages,
      enums,
      sourceContent: content,
    };
  }

  private extractServices(content: string): GrpcService[] {
    return this.extractBlocks(content, 'service').map((block) => ({
      name: block.name,
      description: block.description,
      methods: this.extractMethods(block.body),
    }));
  }

  private extractMethods(body: string): GrpcMethod[] {
    const methods: GrpcMethod[] = [];
    const regex =
      /\brpc\s+(\w+)\s*\(\s*(stream\s+)?(\.?[\w.]+)\s*\)\s*returns\s*\(\s*(stream\s+)?(\.?[\w.]+)\s*\)/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(body)) !== null) {
      methods.push({
        name: match[1],
        description: this.extractLeadingDescription(body, match.index),
        inputType: this.normalizeTypeName(match[3]),
        outputType: this.normalizeTypeName(match[5]),
        clientStreaming: Boolean(match[2]),
        serverStreaming: Boolean(match[4]),
      });
    }

    return methods;
  }

  private extractMessages(content: string): GrpcMessage[] {
    return this.extractBlocks(content, 'message').map((block) => ({
      name: block.name,
      description: block.description,
      fields: this.extractFields(block.body),
    }));
  }

  private extractFields(body: string): GrpcField[] {
    const fields: GrpcField[] = [];
    const fieldRegex =
      /(?:^|[;{}]\s*|\n\s*)(?:(repeated|optional|required)\s+)?(map\s*<\s*\.?[\w.]+\s*,\s*\.?[\w.]+\s*>|\.?[\w.]+)\s+(\w+)\s*=\s*(\d+)/g;
    let match: RegExpExecArray | null;

    while ((match = fieldRegex.exec(body)) !== null) {
      const modifier = match[1];
      const rawType = match[2];
      const mapMatch = rawType.match(/^map\s*<\s*(\.?[\w.]+)\s*,\s*(\.?[\w.]+)\s*>$/);

      fields.push({
        name: match[3],
        type: mapMatch ? 'map' : this.normalizeTypeName(rawType),
        number: Number.parseInt(match[4], 10),
        repeated: modifier === 'repeated',
        optional: modifier === 'optional',
        mapKeyType: mapMatch ? this.normalizeTypeName(mapMatch[1]) : undefined,
        mapValueType: mapMatch ? this.normalizeTypeName(mapMatch[2]) : undefined,
      });
    }

    return fields;
  }

  private extractEnums(content: string): GrpcEnum[] {
    return this.extractBlocks(content, 'enum').map((block) => {
      const values: { name: string; number: number }[] = [];
      const valueRegex = /(?:^|[;{}]\s*|\n\s*)(\w+)\s*=\s*(-?\d+)/g;
      let match: RegExpExecArray | null;

      while ((match = valueRegex.exec(block.body)) !== null) {
        values.push({ name: match[1], number: Number.parseInt(match[2], 10) });
      }

      return { name: block.name, description: block.description, values };
    });
  }

  private extractBlocks(content: string, keyword: 'service' | 'message' | 'enum'): ProtoBlock[] {
    const blocks: ProtoBlock[] = [];
    const regex = new RegExp(`\\b${keyword}\\s+(\\w+)\\s*\\{`, 'g');
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      const openBrace = content.indexOf('{', match.index);
      const closeBrace = this.findMatchingBrace(content, openBrace);
      if (closeBrace === -1) continue;

      blocks.push({
        name: match[1],
        body: content.slice(openBrace + 1, closeBrace),
        description: this.extractLeadingDescription(content, match.index),
      });
      regex.lastIndex = closeBrace + 1;
    }

    return blocks;
  }

  private findMatchingBrace(content: string, openBrace: number): number {
    let depth = 0;
    let inLineComment = false;
    let inBlockComment = false;
    let quote: '"' | "'" | undefined;

    for (let index = openBrace; index < content.length; index += 1) {
      const char = content[index];
      const next = content[index + 1];

      if (inLineComment) {
        if (char === '\n') inLineComment = false;
        continue;
      }
      if (inBlockComment) {
        if (char === '*' && next === '/') {
          inBlockComment = false;
          index += 1;
        }
        continue;
      }
      if (quote) {
        if (char === '\\') index += 1;
        else if (char === quote) quote = undefined;
        continue;
      }
      if (char === '/' && next === '/') {
        inLineComment = true;
        index += 1;
      } else if (char === '/' && next === '*') {
        inBlockComment = true;
        index += 1;
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) return index;
      }
    }

    return -1;
  }

  private extractLeadingDescription(content: string, start: number): string | undefined {
    const before = content.slice(0, start);
    const blockComment = before.match(/\/\*\*?([\s\S]*?)\*\/\s*$/);
    if (blockComment) {
      return blockComment[1]
        .split('\n')
        .map((line) => line.replace(/^\s*\*\s?/, '').trim())
        .filter(Boolean)
        .join(' ');
    }

    const lines = before.split('\n');
    const comments: string[] = [];
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index].trim();
      if (!line && comments.length === 0) continue;
      if (!line.startsWith('//')) break;
      comments.unshift(line.replace(/^\/\/\s?/, '').trim());
    }
    const description = comments.filter(Boolean).join(' ');
    return description || undefined;
  }

  private normalizeTypeName(typeName: string): string {
    return typeName.replace(/^\./, '');
  }
}
