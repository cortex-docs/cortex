import * as fs from 'node:fs';
import * as path from 'node:path';
import { SubCommand, CommandRunner, Option } from 'nest-commander';
import { createDefaultRegistry, findLanguageTemplateDir } from '@cortex-docs/codegen';
import {
  resolveGeneratorTemplateRoot,
  resolveLanguageTemplateDir,
  type CortexConfig,
} from '@cortex-docs/core';
import { findMcpTemplateDir } from '@cortex-docs/mcp-gen';
import { LoggerService } from '../../services/logger.service';
import { ProjectService } from '../../services/project.service';

export const GENERATOR_PROTOCOLS = ['rest', 'graphql', 'websocket', 'grpc', 'openrpc'] as const;

export type GeneratorProtocol = (typeof GENERATOR_PROTOCOLS)[number];

export interface GeneratorExportRequest {
  templateRoot: string;
  languages?: string[];
  includeMcp?: boolean;
  protocol?: string;
  force?: boolean;
  /** Copy one language directly into this directory instead of languages/<language>. */
  directLanguageRoot?: boolean;
}

export interface GeneratorExportResult {
  templateRoot: string;
  created: string[];
  overwritten: string[];
  skipped: string[];
}

interface ExportCommandOptions {
  language?: string;
  mcp?: boolean;
  all?: boolean;
  output?: string;
  protocol?: string;
  force?: boolean;
  config?: string;
}

function portablePath(value: string): string {
  return value.split(path.sep).join('/');
}

function collectTemplates(root: string, options?: { ignoreTopLevel?: Set<string> }): string[] {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`Built-in template directory not found: ${root}`);
  }

  const files: string[] = [];
  const visit = (directory: string, relativeDirectory = ''): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!relativeDirectory && options?.ignoreTopLevel?.has(entry.name)) continue;
      const relativePath = path.join(relativeDirectory, entry.name);
      const sourcePath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(sourcePath, relativePath);
      if (entry.isFile() && entry.name.endsWith('.ejs')) files.push(relativePath);
    }
  };
  visit(root);
  return files.sort();
}

function copyTemplates(
  sourceRoot: string,
  destinationRoot: string,
  reportPrefix: string,
  result: GeneratorExportResult,
  force: boolean,
  options?: { ignoreTopLevel?: Set<string> },
): void {
  for (const relativePath of collectTemplates(sourceRoot, options)) {
    const sourcePath = path.join(sourceRoot, relativePath);
    const destinationPath = path.join(destinationRoot, relativePath);
    const reportPath = portablePath(path.join(reportPrefix, relativePath));

    if (fs.existsSync(destinationPath) && !force) {
      result.skipped.push(reportPath);
      continue;
    }

    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    const existed = fs.existsSync(destinationPath);
    fs.copyFileSync(sourcePath, destinationPath);
    (existed ? result.overwritten : result.created).push(reportPath);
  }
}

export function exportGeneratorTemplates(request: GeneratorExportRequest): GeneratorExportResult {
  const availableLanguages = createDefaultRegistry().getAvailableLanguages();
  const languages = request.languages ?? [];
  const protocol = request.protocol;

  for (const language of languages) {
    if (!availableLanguages.includes(language)) {
      throw new Error(
        `Unsupported language "${language}". Available languages: ${availableLanguages.join(', ')}`,
      );
    }
  }
  if (protocol && !GENERATOR_PROTOCOLS.includes(protocol as GeneratorProtocol)) {
    throw new Error(
      `Unsupported protocol "${protocol}". Available protocols: ${GENERATOR_PROTOCOLS.join(', ')}`,
    );
  }
  if (protocol && (languages.length !== 1 || request.includeMcp)) {
    throw new Error('Use --protocol with one language export only.');
  }
  if (request.directLanguageRoot && (languages.length !== 1 || request.includeMcp)) {
    throw new Error('A direct language export requires one language only.');
  }
  if (languages.length === 0 && !request.includeMcp) {
    throw new Error('Select a language, MCP templates, or all templates.');
  }

  const templateRoot = path.resolve(request.templateRoot);
  if (fs.existsSync(templateRoot) && !fs.statSync(templateRoot).isDirectory()) {
    throw new Error(`Template output path is not a directory: ${templateRoot}`);
  }
  fs.mkdirSync(templateRoot, { recursive: true });

  const result: GeneratorExportResult = {
    templateRoot,
    created: [],
    overwritten: [],
    skipped: [],
  };

  for (const language of languages) {
    const languageRoot = findLanguageTemplateDir(language);
    const sourceRoot = protocol ? path.join(languageRoot, protocol) : languageRoot;
    const relativeRoot = request.directLanguageRoot
      ? (protocol ?? '')
      : path.join('languages', language, ...(protocol ? [protocol] : []));
    copyTemplates(
      sourceRoot,
      path.join(templateRoot, relativeRoot),
      relativeRoot,
      result,
      request.force === true,
    );
  }

  if (request.includeMcp) {
    copyTemplates(
      findMcpTemplateDir(),
      path.join(templateRoot, 'mcp'),
      'mcp',
      result,
      request.force === true,
      { ignoreTopLevel: new Set(['templates']) },
    );
  }

  return result;
}

export function resolveGeneratorExportRoot(
  output: string | undefined,
  config: CortexConfig | undefined,
  configPath?: string,
): string | undefined {
  if (output) return path.resolve(output);
  return config ? resolveGeneratorTemplateRoot(config, configPath) : undefined;
}

@SubCommand({
  name: 'export',
  description: 'Export installed generator templates for customization',
})
export class GeneratorsExportCommand extends CommandRunner {
  constructor(
    private readonly logger: LoggerService,
    private readonly project: ProjectService,
  ) {
    super();
  }

  async run(_params: string[], options: ExportCommandOptions): Promise<void> {
    this.logger.header('Cortex Generator Export');

    try {
      if (options.all && (options.language || options.mcp)) {
        throw new Error('Do not combine --all with --language or --mcp.');
      }

      const configPath = options.config
        ? path.resolve(options.config)
        : ((await this.project.findConfig()) ?? undefined);
      const config =
        !options.output && configPath ? await this.project.loadConfig(configPath) : undefined;

      const availableLanguages = createDefaultRegistry().getAvailableLanguages();
      const languages = options.all
        ? availableLanguages
        : options.language
          ? [options.language]
          : [];

      const requests: GeneratorExportRequest[] = [];
      if (options.language && !options.output && config) {
        const directRoots = new Set<string>();
        const protocolSourceType = options.protocol
          ? (
              {
                rest: 'openapi-spec',
                websocket: 'asyncapi-spec',
                graphql: 'graphql-spec',
                grpc: 'grpc-spec',
                openrpc: 'openrpc-spec',
              } as const
            )[options.protocol as GeneratorProtocol]
          : undefined;
        for (const source of config.sources) {
          if (protocolSourceType && source.type !== protocolSourceType) continue;
          for (const languageConfig of source.languages) {
            if (languageConfig.language !== options.language || !languageConfig.template) continue;
            const resolved = resolveLanguageTemplateDir(languageConfig, configPath);
            if (resolved) directRoots.add(resolved);
          }
        }
        for (const directRoot of directRoots) {
          requests.push({
            templateRoot: directRoot,
            languages,
            protocol: options.protocol,
            force: options.force,
            directLanguageRoot: true,
          });
        }
      }

      if (requests.length === 0 || options.output || options.all || options.mcp) {
        const templateRoot = resolveGeneratorExportRoot(options.output, config, configPath);
        if (!templateRoot) {
          throw new Error(
            'Set a language template path, set generators.templates, or use --output.',
          );
        }
        requests.push({
          templateRoot,
          languages,
          includeMcp: options.all || options.mcp,
          protocol: options.protocol,
          force: options.force,
        });
      }

      const results = requests.map(exportGeneratorTemplates);
      for (const result of results) {
        this.logger.info(`Output: ${result.templateRoot}`);
        const resultWritten = [...result.created, ...result.overwritten].sort();
        if (resultWritten.length > 0) this.logger.list(resultWritten);
      }
      const written = results
        .flatMap((result) => [...result.created, ...result.overwritten])
        .sort();
      const overwritten = results.flatMap((result) => result.overwritten);
      const skipped = results.flatMap((result) => result.skipped);
      this.logger.success(`Exported ${written.length} template${written.length === 1 ? '' : 's'}.`);
      if (overwritten.length > 0) {
        this.logger.warn(
          `Replaced ${overwritten.length} existing template${overwritten.length === 1 ? '' : 's'}.`,
        );
      }
      if (skipped.length > 0) {
        this.logger.warn(
          `Skipped ${skipped.length} existing template${skipped.length === 1 ? '' : 's'}. Use --force to replace them.`,
        );
      }
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }

  @Option({ flags: '-l, --language <language>', description: 'SDK language to export' })
  parseLanguage(value: string): string {
    return value;
  }

  @Option({ flags: '--mcp', description: 'Export MCP server templates' })
  parseMcp(): boolean {
    return true;
  }

  @Option({ flags: '--all', description: 'Export all SDK and MCP templates' })
  parseAll(): boolean {
    return true;
  }

  @Option({ flags: '-p, --protocol <protocol>', description: 'Export one language protocol only' })
  parseProtocol(value: string): string {
    return value;
  }

  @Option({ flags: '-o, --output <directory>', description: 'Template output directory' })
  parseOutput(value: string): string {
    return value;
  }

  @Option({ flags: '-c, --config <path>', description: 'Path to the Cortex configuration file' })
  parseConfig(value: string): string {
    return value;
  }

  @Option({ flags: '-f, --force', description: 'Replace existing template files' })
  parseForce(): boolean {
    return true;
  }
}
