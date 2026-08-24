import * as fs from 'node:fs';
import * as path from 'node:path';
import { Worker } from 'node:worker_threads';
import { Command, CommandRunner, Option } from 'nest-commander';
import {
  CodegenEngine,
  FileEmitter,
  assertTemplateRoot,
  createDefaultRegistry,
} from '@cortex-docs/codegen';
import { McpGenerator } from '@cortex-docs/mcp-gen';
import type { AsyncApiSpec, LanguageConfig, SourceConfig } from '@cortex-docs/core';
import {
  AsyncAPIParser,
  GraphQLParser,
  GrpcParser,
  OpenRpcParser,
  getAllLanguageTemplateDirs,
  getSourcesByType,
  resolveGeneratorTemplateRoot,
  resolveLanguageTemplateDir,
  sourceHasLanguage,
} from '@cortex-docs/core';
import { LoggerService } from '../../services/logger.service';
import { ProjectService } from '../../services/project.service';
import {
  emptyParsedSpec,
  mergeAsyncApiSpecs,
  mergeGraphQLSpecs,
  mergeGrpcSpecs,
  mergeOpenRpcSpecs,
  mergeParsedSpecs,
  sourceTitle,
} from './spec-merge';

interface ParsedSource<T> {
  source: SourceConfig;
  spec: T;
}

@Command({
  name: 'generate',
  description: 'Regenerate SDKs, MCP server, and WebSocket clients from cortex.config.yml',
})
export class GenerateCommand extends CommandRunner {
  constructor(
    private readonly logger: LoggerService,
    private readonly project: ProjectService,
  ) {
    super();
  }

  async run(
    params: string[],
    options: { config?: string; language?: string; noMcp?: boolean; dryRun?: boolean },
  ): Promise<void> {
    this.logger.header('Cortex Generate');

    const configFile = await this.project.findConfig();
    if (!configFile && !options.config) {
      this.logger.error('No cortex.config.yml found.');
      this.logger.info(
        'Run `cortex init <project-name> --open-api <spec>` first to set up your project.',
      );
      process.exitCode = 1;
      return;
    }

    const config = await this.project.loadConfig(options.config);
    const resolvedConfigPath = path.resolve(options.config ?? configFile!);
    const templateRoot = resolveGeneratorTemplateRoot(config, resolvedConfigPath);
    assertTemplateRoot(templateRoot);
    const languageTemplateDirs = getAllLanguageTemplateDirs(config, resolvedConfigPath);
    for (const templateDir of languageTemplateDirs) assertTemplateRoot(templateDir);
    this.logger.info(`Config: ${resolvedConfigPath}`);
    if (templateRoot) this.logger.info(`Templates: ${templateRoot}`);
    if (languageTemplateDirs.length > 0) {
      this.logger.info(`Source templates: ${languageTemplateDirs.length}`);
    }

    if (options.language) {
      config.languages = config.languages.filter((l) => l.language === options.language);
      if (config.languages.length === 0) {
        this.logger.error(`Language "${options.language}" not found in config.`);
        process.exitCode = 1;
        return;
      }
    }

    const openapiSources = getSourcesByType(config, 'openapi-spec');
    const asyncapiSources = getSourcesByType(config, 'asyncapi-spec');
    const gqlSources = getSourcesByType(config, 'graphql-spec');
    const grpcSources = getSourcesByType(config, 'grpc-spec');
    const openRpcSources = getSourcesByType(config, 'openrpc-spec');

    const [restSources, asyncSources, graphQLSources, grpcParsedSources, openRpcParsedSources] =
      await Promise.all([
        this.parseSources(openapiSources, 'OpenAPI', (source) =>
          this.project.parseSpec(source.spec),
        ),
        this.parseSources(asyncapiSources, 'AsyncAPI', (source) =>
          new AsyncAPIParser().parse(source.spec),
        ),
        this.parseSources(gqlSources, 'GraphQL', (source) =>
          new GraphQLParser().parse(source.spec, source.endpoint),
        ),
        this.parseSources(grpcSources, 'gRPC', (source) => new GrpcParser().parse(source.spec)),
        this.parseSources(openRpcSources, 'OpenRPC', (source) =>
          new OpenRpcParser().parse(source.spec),
        ),
      ]);

    const projectTitle = config.title ?? config.project;
    const restSpec = mergeParsedSpecs(
      restSources.map(({ spec }) => spec),
      projectTitle,
    );
    const asyncSpec = mergeAsyncApiSpecs(
      asyncSources.map(({ spec }) => spec),
      sourceTitle(config, 'WebSocket API'),
    );
    const gqlSpec = mergeGraphQLSpecs(
      graphQLSources.map(({ spec }) => spec),
      sourceTitle(config, 'GraphQL API'),
    );
    mergeGrpcSpecs(
      grpcParsedSources.map(({ spec }) => spec),
      sourceTitle(config, 'gRPC API'),
    );
    const openRpcSpec = mergeOpenRpcSpecs(
      openRpcParsedSources.map(({ spec }) => spec),
      sourceTitle(config, 'OpenRPC API'),
    );

    this.logger.info(`Languages: ${config.languages.map((l) => l.language).join(', ')}`);
    this.logger.info('');

    if (options.dryRun) {
      this.logger.info('Dry run — no files will be written.');
      for (const langConfig of config.languages) {
        const protocols = this.protocolsForLanguage(config.sources, langConfig);
        this.logger.info(
          `  ${langConfig.language} [${protocols.join(' + ')}] → ${langConfig.output_dir}`,
        );
      }
      if (!options.noMcp && this.canGenerateMcp(config)) {
        this.logger.info(`  mcp-server → ${config.output.base_dir}/mcp-server`);
      }
      return;
    }

    // --- Generate unified SDK per language ---
    const emitter = new FileEmitter();
    if (config.languages.length > 0) {
      const workerPath = path.resolve(__dirname, 'lang-worker.js');
      const mapReplacer = (_key: string, value: unknown) => {
        if (value instanceof Map) return { __type: 'Map', entries: Array.from(value.entries()) };
        return value;
      };

      const workerPromises = config.languages.map(async (langConfig) => {
        const relevant = <T>(items: ParsedSource<T>[]) =>
          items.filter(({ source }) =>
            sourceHasLanguage(source, langConfig.language, langConfig.package_name),
          );
        const languageRestSources = relevant(restSources);
        const languageAsyncSources = relevant(asyncSources);
        const languageGraphQLSources = relevant(graphQLSources);
        const languageGrpcSources = relevant(grpcParsedSources);
        const languageOpenRpcSources = relevant(openRpcParsedSources);
        const languageRestSpec =
          mergeParsedSpecs(
            languageRestSources.map(({ spec }) => spec),
            projectTitle,
          ) ?? emptyParsedSpec(projectTitle);
        const languageAsyncSpec = mergeAsyncApiSpecs(
          languageAsyncSources.map(({ spec }) => spec),
          sourceTitle(config, 'WebSocket API'),
        );
        const languageGraphQLSpec = mergeGraphQLSpecs(
          languageGraphQLSources.map(({ spec }) => spec),
          sourceTitle(config, 'GraphQL API'),
        );
        const languageGrpcSpec = mergeGrpcSpecs(
          languageGrpcSources.map(({ spec }) => spec),
          sourceTitle(config, 'gRPC API'),
        );
        const languageOpenRpcSpec = mergeOpenRpcSpecs(
          languageOpenRpcSources.map(({ spec }) => spec),
          sourceTitle(config, 'OpenRPC API'),
        );
        const languageConfig = {
          ...config,
          sources: config.sources.filter((source) =>
            sourceHasLanguage(source, langConfig.language, langConfig.package_name),
          ),
          languages: [langConfig],
        };
        const engine = new CodegenEngine(createDefaultRegistry(), emitter);
        const result = await engine.generate(languageRestSpec, languageConfig, {
          gqlSpec: languageGraphQLSpec ?? undefined,
          asyncSpec: languageAsyncSpec ?? undefined,
          grpcSpec: languageGrpcSpec ?? undefined,
          openRpcSpec: languageOpenRpcSpec ?? undefined,
          templateRoot,
          configPath: resolvedConfigPath,
        });
        if (result.errors.length > 0) {
          return {
            language: langConfig.language,
            totalFiles: 0,
            protocols: [],
            langDir: langConfig.output_dir,
            error: result.errors.join('\n'),
          };
        }

        return new Promise<{
          language: string;
          totalFiles: number;
          protocols: string[];
          langDir: string;
          error?: string;
        }>((resolve) => {
          const worker = new Worker(workerPath, {
            workerData: {
              language: langConfig.language,
              packageName: langConfig.package_name,
              outputDir: langConfig.output_dir,
              githubRepository: langConfig.github_repository,
              hasRest: languageRestSources.length > 0,
              restResultJson: JSON.stringify(result, mapReplacer),
              asyncSpecJson: languageAsyncSpec
                ? JSON.stringify(languageAsyncSpec, mapReplacer)
                : null,
              gqlSpecJson: languageGraphQLSpec
                ? JSON.stringify(languageGraphQLSpec, mapReplacer)
                : null,
              grpcSpecJson: languageGrpcSpec ? JSON.stringify(languageGrpcSpec, mapReplacer) : null,
              openRpcSpecJson: languageOpenRpcSpec
                ? JSON.stringify(languageOpenRpcSpec, mapReplacer)
                : null,
              version: this.generatedVersion(langConfig.output_dir),
              asyncapiSourceTitle: this.combinedSourceTitle(languageAsyncSources),
              asyncapiHeartbeat: this.heartbeatFor(languageAsyncSources),
              graphqlSourceTitle: this.combinedSourceTitle(languageGraphQLSources),
              grpcSourceTitle: this.combinedSourceTitle(languageGrpcSources),
              openRpcSourceTitle: this.combinedSourceTitle(languageOpenRpcSources),
              templateRoot,
              restTemplateDir: this.templateDirFor(
                languageRestSources,
                langConfig,
                resolvedConfigPath,
              ),
              asyncapiTemplateDir: this.templateDirFor(
                languageAsyncSources,
                langConfig,
                resolvedConfigPath,
              ),
              graphqlTemplateDir: this.templateDirFor(
                languageGraphQLSources,
                langConfig,
                resolvedConfigPath,
              ),
              grpcTemplateDir: this.templateDirFor(
                languageGrpcSources,
                langConfig,
                resolvedConfigPath,
              ),
              openRpcTemplateDir: this.templateDirFor(
                languageOpenRpcSources,
                langConfig,
                resolvedConfigPath,
              ),
            },
          });
          worker.on('message', (msg) => resolve(msg));
          worker.on('error', (err) =>
            resolve({
              language: langConfig.language,
              totalFiles: 0,
              protocols: [],
              langDir: langConfig.output_dir,
              error: err.message,
            }),
          );
          worker.on('exit', (code) => {
            if (code !== 0)
              resolve({
                language: langConfig.language,
                totalFiles: 0,
                protocols: [],
                langDir: langConfig.output_dir,
                error: `Worker exited with code ${code}`,
              });
          });
        });
      });

      const workerResults = await Promise.all(workerPromises);
      let workerFailed = false;
      for (const wr of workerResults) {
        if (wr.error) {
          this.logger.error(`${wr.language}: ${wr.error}`);
          workerFailed = true;
        } else {
          this.logger.success(
            `${wr.language}: ${wr.totalFiles} files [${wr.protocols.join(' + ')}] → ${wr.langDir}`,
          );
        }
      }
      if (workerFailed) {
        process.exitCode = 1;
        return;
      }
    }

    // --- Generate MCP server ---
    if (!options.noMcp && this.canGenerateMcp(config)) {
      this.logger.info('');
      const mcpOutputDir = path.resolve(`${config.output.base_dir}/mcp-server`);
      const mcpGen = new McpGenerator();
      const mcpResult = await mcpGen.generate(restSpec ?? emptyParsedSpec(projectTitle), config, {
        outputDir: mcpOutputDir,
        configDir: path.dirname(resolvedConfigPath),
        templateRoot,
        transport: 'stdio',
        asyncApiSpec: asyncSpec ?? undefined,
        graphqlSpec: gqlSpec ?? undefined,
        openRpcSpec: openRpcSpec ?? undefined,
        specPaths: {
          openapi: openapiSources.map((source) => source.spec),
          asyncapi: asyncapiSources.map((source) => source.spec),
          graphql: gqlSources.map((source) => source.spec),
          grpc: grpcSources.map((source) => source.spec),
          openrpc: openRpcSources.map((source) => source.spec),
        },
      });
      this.logger.success(`mcp-server: ${mcpResult.files.length} files → ${mcpOutputDir}`);
    }

    this.logger.info('');
    this.logger.success('Generation complete!');
  }

  @Option({ flags: '-c, --config <path>', description: 'Path to cortex config file' })
  parseConfig(val: string): string {
    return val;
  }

  @Option({
    flags: '-l, --language <lang>',
    description: 'Regenerate for a specific language only',
  })
  parseLanguage(val: string): string {
    return val;
  }

  private async parseSources<T>(
    sources: SourceConfig[],
    label: string,
    parse: (source: SourceConfig) => Promise<T>,
  ): Promise<ParsedSource<T>[]> {
    return Promise.all(
      sources.map(async (source) => {
        this.logger.info(`${label}: ${source.spec}`);
        const spec = await parse(source);
        this.logger.success(`Parsed ${label}: ${source.title}`);
        return { source, spec };
      }),
    );
  }

  private protocolsForLanguage(sources: SourceConfig[], language: LanguageConfig): string[] {
    const labels: Record<SourceConfig['type'], string> = {
      'openapi-spec': 'REST',
      'asyncapi-spec': 'WS',
      'graphql-spec': 'GraphQL',
      'grpc-spec': 'gRPC',
      'openrpc-spec': 'OpenRPC',
    };
    return Array.from(
      new Set(
        sources
          .filter((source) => sourceHasLanguage(source, language.language, language.package_name))
          .map((source) => labels[source.type]),
      ),
    );
  }

  private canGenerateMcp(config: {
    sources: SourceConfig[];
    docs?: unknown[];
    mcp?: unknown;
  }): boolean {
    return config.sources.length > 0 || (config.docs?.length ?? 0) > 0 || !!config.mcp;
  }

  private combinedSourceTitle<T>(sources: ParsedSource<T>[]): string | undefined {
    const titles = sources.map(({ source }) => source.title);
    return titles.length > 0 ? titles.join(' + ') : undefined;
  }

  private heartbeatFor(sources: ParsedSource<AsyncApiSpec>[]) {
    const heartbeats = sources
      .map(({ source }) => source.websocket?.heartbeat)
      .filter((heartbeat) => heartbeat !== undefined);
    const distinct = new Set(heartbeats.map((heartbeat) => JSON.stringify(heartbeat)));
    if (distinct.size > 1) {
      throw new Error(
        'Cannot merge AsyncAPI sources with different WebSocket heartbeat configurations.',
      );
    }
    return heartbeats[0];
  }

  private templateDirFor<T>(
    sources: ParsedSource<T>[],
    language: LanguageConfig,
    configPath: string,
  ): string | undefined {
    const directories = sources
      .map(({ source }) =>
        source.languages.find(
          (candidate) =>
            candidate.language === language.language &&
            candidate.package_name === language.package_name,
        ),
      )
      .filter((sourceLanguage) => sourceLanguage?.template)
      .map((sourceLanguage) => resolveLanguageTemplateDir(sourceLanguage!, configPath)!);
    const distinct = Array.from(new Set(directories));
    if (distinct.length > 1) {
      throw new Error(
        `Cannot merge sources with different ${language.language} template directories.`,
      );
    }
    return distinct[0];
  }

  private generatedVersion(outputDir: string): string {
    try {
      const metadata = JSON.parse(
        fs.readFileSync(path.resolve(outputDir, '.cortex-package.json'), 'utf8'),
      ) as { version?: unknown };
      if (typeof metadata.version === 'string' && /^\d+\.\d+\.\d+$/.test(metadata.version))
        return metadata.version;
    } catch {
      // The language generator creates this metadata before worker generation starts.
    }
    return '0.0.0';
  }

  @Option({ flags: '--no-mcp', description: 'Skip MCP server generation' })
  parseNoMcp(): boolean {
    return true;
  }

  @Option({ flags: '-d, --dry-run', description: 'Preview without writing files' })
  parseDryRun(): boolean {
    return true;
  }
}
