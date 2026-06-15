import * as fs from 'node:fs';
import * as path from 'node:path';
import { Worker } from 'node:worker_threads';
import { Command, CommandRunner, Option } from 'nest-commander';
import { CodegenEngine, FileEmitter, createDefaultRegistry } from '@cortex/codegen';
import { McpGenerator } from '@cortex/mcp-gen';
import type { ParsedSpec, AsyncApiSpec, GraphQLSpec, GrpcSpec } from '@cortex/core';
import { AsyncAPIParser, getFirstSpecPath, getSourcesByType } from '@cortex/core';
import { LoggerService } from '../../services/logger.service';
import { ProjectService } from '../../services/project.service';

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
      this.logger.info('Run `cortex init <project-name> --open-api <spec>` first to set up your project.');
      process.exitCode = 1;
      return;
    }

    const config = await this.project.loadConfig(options.config);
    this.logger.info(`Config: ${options.config ?? configFile}`);

    if (options.language) {
      config.languages = config.languages.filter((l) => l.language === options.language);
      if (config.languages.length === 0) {
        this.logger.error(`Language "${options.language}" not found in config.`);
        process.exitCode = 1;
        return;
      }
    }

    // --- Find spec paths from sources ---
    const openapiSources = getSourcesByType(config, 'openapi-spec');
    const asyncapiSources = getSourcesByType(config, 'asyncapi-spec');
    const gqlSources = getSourcesByType(config, 'graphql-spec');
    const grpcSources = getSourcesByType(config, 'grpc-spec');

    // --- Parse OpenAPI ---
    let restSpec: ParsedSpec | null = null;
    if (openapiSources.length > 0) {
      const specPath = openapiSources[0].spec;
      this.logger.info(`OpenAPI: ${specPath}`);
      restSpec = await this.project.parseSpec(specPath);
      this.logger.success(
        `Parsed: ${restSpec.info.title} v${restSpec.info.version} (${restSpec.operations.length} operations, ${restSpec.resources.length} resources)`,
      );
    }

    // --- Parse AsyncAPI ---
    let asyncSpec: AsyncApiSpec | null = null;
    if (asyncapiSources.length > 0) {
      const asyncPath = asyncapiSources[0].spec;
      this.logger.info(`AsyncAPI: ${asyncPath}`);
      const parser = new AsyncAPIParser();
      asyncSpec = await parser.parse(asyncPath);
      this.logger.success(
        `Parsed: ${asyncSpec.title} v${asyncSpec.version} (${asyncSpec.channels.length} channels)`,
      );
    }

    this.logger.info(`Languages: ${config.languages.map((l) => l.language).join(', ')}`);
    this.logger.info('');

    if (options.dryRun) {
      this.logger.info('Dry run — no files will be written.');
      for (const langConfig of config.languages) {
        this.logger.info(`  ${langConfig.language} → ${langConfig.output_dir}`);
      }
      if (asyncSpec) {
        this.logger.info(`  websocket → merged into language directories`);
      }
      if (!options.noMcp && restSpec) {
        this.logger.info(`  mcp-server → ${config.output.base_dir}/mcp-server`);
      }
      return;
    }

    // --- Parse additional specs ---
    let gqlSpec: GraphQLSpec | null = null;
    let grpcSpec: GrpcSpec | null = null;

    if (gqlSources.length > 0) {
      const gqlPath = gqlSources[0].spec;
      const { GraphQLParser } = await import('@cortex/core');
      gqlSpec = await new GraphQLParser().parse(gqlPath);
      this.logger.success(`Parsed GraphQL: ${gqlSpec.title} (${gqlSpec.queries.length} queries, ${gqlSpec.mutations.length} mutations)`);
    }

    if (grpcSources.length > 0) {
      const grpcPath = grpcSources[0].spec;
      const { GrpcParser } = await import('@cortex/core');
      grpcSpec = await new GrpcParser().parse(grpcPath);
      this.logger.success(`Parsed gRPC: ${grpcSpec.title} (${grpcSpec.services.length} services, ${grpcSpec.messages.length} messages)`);
    }

    // --- Generate unified SDK per language ---
    const emitter = new FileEmitter();
    const version = '0.1.0';

    if (restSpec) {
      const registry = createDefaultRegistry();
      const engine = new CodegenEngine(registry, emitter);
      const result = await engine.generate(restSpec, config, {
        gqlSpec: gqlSpec ?? undefined,
        asyncSpec: asyncSpec ?? undefined,
        grpcSpec: grpcSpec ?? undefined,
      });
      for (const error of result.errors) this.logger.error(error);
      if (result.errors.length > 0) return;

      const workerPath = path.resolve(__dirname, 'lang-worker.js');
      const mapReplacer = (_key: string, value: unknown) => {
        if (value instanceof Map) return { __type: 'Map', entries: Array.from(value.entries()) };
        return value;
      };
      const restResultJson = JSON.stringify(result, mapReplacer);
      const asyncSpecJson = asyncSpec ? JSON.stringify(asyncSpec, mapReplacer) : null;
      const gqlSpecJson = gqlSpec ? JSON.stringify(gqlSpec, mapReplacer) : null;
      const grpcSpecJson = grpcSpec ? JSON.stringify(grpcSpec, mapReplacer) : null;

      const workerPromises = config.languages.map((langConfig) => {
        return new Promise<{ language: string; totalFiles: number; protocols: string[]; langDir: string; error?: string }>((resolve) => {
          const worker = new Worker(workerPath, {
            workerData: {
              language: langConfig.language,
              packageName: langConfig.package_name,
              outputDir: langConfig.output_dir,
              githubRepository: langConfig.github_repository,
              restResultJson,
              asyncSpecJson,
              gqlSpecJson,
              grpcSpecJson,
              version,
              asyncapiSourceTitle: asyncapiSources[0]?.title,
              graphqlSourceTitle: gqlSources[0]?.title,
              grpcSourceTitle: grpcSources[0]?.title,
            },
          });
          worker.on('message', (msg) => resolve(msg));
          worker.on('error', (err) => resolve({ language: langConfig.language, totalFiles: 0, protocols: [], langDir: langConfig.output_dir, error: err.message }));
          worker.on('exit', (code) => {
            if (code !== 0) resolve({ language: langConfig.language, totalFiles: 0, protocols: [], langDir: langConfig.output_dir, error: `Worker exited with code ${code}` });
          });
        });
      });

      const workerResults = await Promise.all(workerPromises);
      for (const wr of workerResults) {
        if (wr.error) {
          this.logger.error(`${wr.language}: ${wr.error}`);
        } else {
          this.logger.success(`${wr.language}: ${wr.totalFiles} files [${wr.protocols.join(' + ')}] → ${wr.langDir}`);
        }
      }
    }

    // --- Generate MCP server ---
    if (!options.noMcp && restSpec) {
      this.logger.info('');
      const mcpOutputDir = path.resolve(`${config.output.base_dir}/mcp-server`);
      const mcpGen = new McpGenerator();
      const mcpResult = await mcpGen.generate(restSpec, config, {
        outputDir: mcpOutputDir,
        configDir: path.dirname(options.config ?? configFile!),
        transport: 'stdio',
        asyncApiSpec: asyncSpec ?? undefined,
        graphqlSpec: gqlSpec ?? undefined,
        grpcSpec: grpcSpec ?? undefined,
        specPaths: {
          openapi: getFirstSpecPath(config, 'openapi-spec'),
          asyncapi: getFirstSpecPath(config, 'asyncapi-spec'),
          graphql: getFirstSpecPath(config, 'graphql-spec'),
          grpc: getFirstSpecPath(config, 'grpc-spec'),
        },
      });
      this.logger.success(`mcp-server: ${mcpResult.files.length} files → ${mcpOutputDir}`);
    }

    this.logger.info('');
    this.logger.success('Generation complete!');
  }

  @Option({ flags: '-c, --config <path>', description: 'Path to cortex config file' })
  parseConfig(val: string): string { return val; }

  @Option({ flags: '-l, --language <lang>', description: 'Regenerate for a specific language only' })
  parseLanguage(val: string): string { return val; }

  @Option({ flags: '--no-mcp', description: 'Skip MCP server generation' })
  parseNoMcp(): boolean { return true; }

  @Option({ flags: '-d, --dry-run', description: 'Preview without writing files' })
  parseDryRun(): boolean { return true; }
}
