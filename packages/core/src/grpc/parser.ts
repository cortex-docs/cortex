import * as fs from 'node:fs';
import type {
  GrpcSpec,
  GrpcService,
  GrpcMethod,
  GrpcMessage,
  GrpcField,
  GrpcEnum,
} from './types';

export class GrpcParser {
  async parse(specPath: string): Promise<GrpcSpec> {
    const content = await this.loadContent(specPath);
    return this.parseProto(content);
  }

  private async loadContent(specPath: string): Promise<string> {
    if (specPath.startsWith('http://') || specPath.startsWith('https://')) {
      const res = await fetch(specPath);
      if (!res.ok) throw new Error(`Failed to fetch ${specPath}: ${res.status}`);
      return res.text();
    }
    return fs.readFileSync(specPath, 'utf-8');
  }

  private parseProto(content: string): GrpcSpec {
    const packageName = content.match(/package\s+([\w.]+)\s*;/)?.[1] ?? 'default';
    const services = this.extractServices(content);
    const messages = this.extractMessages(content);
    const enums = this.extractEnums(content);

    return {
      title: packageName.split('.').pop()?.replace(/^./, (c) => c.toUpperCase()) ?? 'gRPC API',
      version: '1.0.0',
      package: packageName,
      services,
      messages,
      enums,
      sourceContent: content,
    };
  }

  private extractServices(content: string): GrpcService[] {
    const services: GrpcService[] = [];
    const regex = /(?:\/\/\s*(.*?)\n\s*)?service\s+(\w+)\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      services.push({
        name: match[2],
        description: match[1]?.trim(),
        methods: this.extractMethods(match[3]),
      });
    }

    return services;
  }

  private extractMethods(body: string): GrpcMethod[] {
    const methods: GrpcMethod[] = [];
    const regex = /(?:\/\/\s*(.*?)\n\s*)?rpc\s+(\w+)\s*\(\s*(stream\s+)?(\w+)\s*\)\s*returns\s*\(\s*(stream\s+)?(\w+)\s*\)/g;
    let match;

    while ((match = regex.exec(body)) !== null) {
      methods.push({
        name: match[2],
        description: match[1]?.trim(),
        inputType: match[4],
        outputType: match[6],
        clientStreaming: !!match[3],
        serverStreaming: !!match[5],
      });
    }

    return methods;
  }

  private extractMessages(content: string): GrpcMessage[] {
    const messages: GrpcMessage[] = [];
    const regex = /(?:\/\/\s*(.*?)\n\s*)?message\s+(\w+)\s*\{([^}]*)\}/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      messages.push({
        name: match[2],
        description: match[1]?.trim(),
        fields: this.extractFields(match[3]),
      });
    }

    return messages;
  }

  private extractFields(body: string): GrpcField[] {
    const fields: GrpcField[] = [];
    const lines = body.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//') && !l.startsWith('reserved'));

    for (const line of lines) {
      const mapMatch = line.match(/^map<(\w+),\s*(\w+)>\s+(\w+)\s*=\s*(\d+)/);
      if (mapMatch) {
        fields.push({
          name: mapMatch[3],
          type: 'map',
          number: parseInt(mapMatch[4], 10),
          repeated: false,
          optional: false,
          mapKeyType: mapMatch[1],
          mapValueType: mapMatch[2],
        });
        continue;
      }

      const match = line.match(/^(repeated\s+|optional\s+)?([\w.]+)\s+(\w+)\s*=\s*(\d+)/);
      if (!match) continue;

      const modifier = match[1]?.trim();
      fields.push({
        name: match[3],
        type: match[2],
        number: parseInt(match[4], 10),
        repeated: modifier === 'repeated',
        optional: modifier === 'optional',
      });
    }

    return fields;
  }

  private extractEnums(content: string): GrpcEnum[] {
    const enums: GrpcEnum[] = [];
    const regex = /(?:\/\/\s*(.*?)\n\s*)?enum\s+(\w+)\s*\{([^}]*)\}/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      const values: { name: string; number: number }[] = [];
      const lines = match[3].split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//'));

      for (const line of lines) {
        const vm = line.match(/^(\w+)\s*=\s*(\d+)/);
        if (vm) values.push({ name: vm[1], number: parseInt(vm[2], 10) });
      }

      enums.push({ name: match[2], description: match[1]?.trim(), values });
    }

    return enums;
  }
}
