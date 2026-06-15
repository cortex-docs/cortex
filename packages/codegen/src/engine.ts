import type { ParsedSpec, CortexConfig, GraphQLSpec, AsyncApiSpec, GrpcSpec } from '@cortex/core';
import { FileEmitter, type EmitResult } from './emitter';
import type { CodegenContext, GeneratedFile, NamingConventions } from './plugin';
import { PluginRegistry } from './plugin';
import { getLanguageNaming } from './naming';

export interface GenerationResult {
  languages: LanguageResult[];
  errors: string[];
}

export interface LanguageResult {
  language: string;
  files: GeneratedFile[];
  emit: EmitResult;
}

export interface GenerateOptions {
  gqlSpec?: GraphQLSpec;
  asyncSpec?: AsyncApiSpec;
  grpcSpec?: GrpcSpec;
}

export class CodegenEngine {
  constructor(
    private registry: PluginRegistry,
    private emitter: FileEmitter,
  ) {}

  async generate(spec: ParsedSpec, config: CortexConfig, options?: GenerateOptions): Promise<GenerationResult> {
    const result: GenerationResult = { languages: [], errors: [] };

    for (const langConfig of config.languages) {
      const plugin = this.registry.get(langConfig.language);
      if (!plugin) {
        result.errors.push(
          `No plugin registered for language: ${langConfig.language}. Available: ${this.registry.getAvailableLanguages().join(', ')}`,
        );
        continue;
      }

      const naming = getLanguageNaming(langConfig.language);
      const context: CodegenContext = {
        spec,
        config,
        languageConfig: langConfig,
        naming,
        gqlSpec: options?.gqlSpec,
        asyncSpec: options?.asyncSpec,
        grpcSpec: options?.grpcSpec,
      };

      try {
        const files = await plugin.generate(context);
        const emit = await this.emitter.writeFiles(files, langConfig.output_dir);

        result.languages.push({
          language: langConfig.language,
          files,
          emit,
        });
      } catch (err) {
        result.errors.push(
          `Failed to generate ${langConfig.language}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return result;
  }
}
