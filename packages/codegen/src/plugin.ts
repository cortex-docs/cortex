import type { ParsedSpec, CortexConfig, LanguageConfig, GraphQLSpec, AsyncApiSpec, GrpcSpec } from '@cortex/core';

export interface GeneratedFile {
  path: string;
  content: string;
  overwrite: boolean;
}

export interface NamingConventions {
  className(name: string): string;
  methodName(name: string): string;
  fileName(name: string): string;
  propertyName(name: string): string;
  enumValue(name: string): string;
  parameterName(name: string): string;
}

export interface CodegenContext {
  spec: ParsedSpec;
  config: CortexConfig;
  languageConfig: LanguageConfig;
  naming: NamingConventions;
  gqlSpec?: GraphQLSpec;
  asyncSpec?: AsyncApiSpec;
  grpcSpec?: GrpcSpec;
}

export interface LanguagePlugin {
  readonly language: string;
  readonly displayName: string;
  readonly fileExtension: string;

  generate(context: CodegenContext): Promise<GeneratedFile[]>;
}

export class PluginRegistry {
  private plugins = new Map<string, LanguagePlugin>();

  register(plugin: LanguagePlugin): void {
    this.plugins.set(plugin.language, plugin);
  }

  get(language: string): LanguagePlugin | undefined {
    return this.plugins.get(language);
  }

  getAll(): LanguagePlugin[] {
    return Array.from(this.plugins.values());
  }

  has(language: string): boolean {
    return this.plugins.has(language);
  }

  getAvailableLanguages(): string[] {
    return Array.from(this.plugins.keys());
  }
}
