import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  ParsedSpec,
  CortexConfig,
  GraphQLSpec,
  AsyncApiSpec,
  GrpcSpec,
  OpenRpcSpec,
} from '@cortex/core';
import { getSourceLanguageTemplateDir, resolveGeneratorTemplateRoot } from '@cortex/core';
import { FileEmitter, type EmitResult } from './emitter';
import type { CodegenContext, GeneratedFile } from './plugin';
import { PluginRegistry } from './plugin';
import { getLanguageNaming } from './naming';
import type { TemplateRenderOptions } from './template-renderer';

export interface GenerationResult {
  languages: LanguageResult[];
  errors: string[];
}

export interface LanguageResult {
  language: string;
  files: GeneratedFile[];
  emit: EmitResult;
}

export interface GenerateOptions extends TemplateRenderOptions {
  /** Path to cortex.config.yml. Relative source template paths use this directory. */
  configPath?: string;
  gqlSpec?: GraphQLSpec;
  asyncSpec?: AsyncApiSpec;
  grpcSpec?: GrpcSpec;
  openRpcSpec?: OpenRpcSpec;
}

export class CodegenEngine {
  constructor(
    private registry: PluginRegistry,
    private emitter: FileEmitter,
  ) {}

  async generate(
    spec: ParsedSpec,
    config: CortexConfig,
    options?: GenerateOptions,
  ): Promise<GenerationResult> {
    const result: GenerationResult = { languages: [], errors: [] };
    const templateRoot = options?.templateRoot ?? resolveGeneratorTemplateRoot(config);

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
        openRpcSpec: options?.openRpcSpec,
        templateRoot,
        templateDir:
          options?.templateDir ??
          getSourceLanguageTemplateDir(
            config,
            'openapi-spec',
            langConfig.language,
            langConfig.package_name,
            options?.configPath,
          ),
      };

      try {
        const files = await plugin.generate(context);
        this.removeLegacyBlankResource(langConfig.output_dir, plugin.fileExtension);
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

  private removeLegacyBlankResource(outputDir: string, fileExtension: string): void {
    const legacyPath = path.resolve(outputDir, 'src', 'resources', fileExtension);
    if (fs.existsSync(legacyPath) && fs.statSync(legacyPath).isFile()) {
      fs.unlinkSync(legacyPath);
    }
  }
}
