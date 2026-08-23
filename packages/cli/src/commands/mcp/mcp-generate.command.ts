import * as path from 'node:path';
import { SubCommand, CommandRunner, Option } from 'nest-commander';
import { McpGenerator } from '@cortex/mcp-gen';
import {
  AsyncAPIParser,
  GraphQLParser,
  GrpcParser,
  OpenRpcParser,
  getSourcesByType,
  isRemoteLocation,
  resolveGeneratorTemplateRoot,
} from '@cortex/core';
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
} from '../generate/spec-merge';

@SubCommand({
  name: 'generate',
  description: 'Generate an MCP server from configured API sources and documentation',
})
export class McpGenerateCommand extends CommandRunner {
  constructor(
    private readonly logger: LoggerService,
    private readonly project: ProjectService,
  ) {
    super();
  }

  async run(
    _params: string[],
    options: { spec?: string; output?: string; transport?: 'stdio' | 'sse' },
  ): Promise<void> {
    this.logger.header('Cortex MCP Generate');

    const configFile = await this.project.findConfig();
    if (!configFile) throw new Error('No cortex.config.yml file was found.');
    const configPath = path.resolve(configFile);
    const config = await this.project.loadConfig(configPath);
    const templateRoot = resolveGeneratorTemplateRoot(config, configPath);
    const outputDir = path.resolve(options.output ?? '.cortex/mcp-server');
    const transport = options.transport ?? 'stdio';

    const openapiPaths = options.spec
      ? [isRemoteLocation(options.spec) ? options.spec : path.resolve(options.spec)]
      : getSourcesByType(config, 'openapi-spec').map((source) => source.spec);
    const asyncapiPaths = getSourcesByType(config, 'asyncapi-spec').map((source) => source.spec);
    const graphqlSources = getSourcesByType(config, 'graphql-spec');
    const graphqlPaths = graphqlSources.map((source) => source.spec);
    const grpcPaths = getSourcesByType(config, 'grpc-spec').map((source) => source.spec);
    const openrpcPaths = getSourcesByType(config, 'openrpc-spec').map((source) => source.spec);

    this.logger.info(
      `Sources: ${openapiPaths.length + asyncapiPaths.length + graphqlPaths.length + grpcPaths.length + openrpcPaths.length}`,
    );
    this.logger.info(`Output: ${outputDir}`);
    this.logger.info(`Transport: ${transport}`);
    this.logger.info('');

    const [restSpecs, asyncApiSpecs, graphqlSpecs, grpcSpecs, openRpcSpecs] = await Promise.all([
      Promise.all(openapiPaths.map((specPath) => this.project.parseSpec(specPath))),
      Promise.all(asyncapiPaths.map((specPath) => new AsyncAPIParser().parse(specPath))),
      Promise.all(
        graphqlPaths.map((specPath, index) =>
          new GraphQLParser().parse(specPath, graphqlSources[index].endpoint),
        ),
      ),
      Promise.all(grpcPaths.map((specPath) => new GrpcParser().parse(specPath))),
      Promise.all(openrpcPaths.map((specPath) => new OpenRpcParser().parse(specPath))),
    ]);

    const projectTitle = config.title ?? config.project;
    const restSpec = mergeParsedSpecs(restSpecs, projectTitle) ?? emptyParsedSpec(projectTitle);
    const asyncApiSpec = mergeAsyncApiSpecs(asyncApiSpecs, sourceTitle(config, 'WebSocket API'));
    const graphqlSpec = mergeGraphQLSpecs(graphqlSpecs, sourceTitle(config, 'GraphQL API'));
    const openRpcSpec = mergeOpenRpcSpecs(openRpcSpecs, sourceTitle(config, 'OpenRPC API'));
    // Parse and merge gRPC sources to reject invalid or conflicting definitions. The generated
    // MCP package exposes the protobuf files as resources, but it does not create gRPC tools.
    mergeGrpcSpecs(grpcSpecs, sourceTitle(config, 'gRPC API'));

    const generator = new McpGenerator();
    const result = await generator.generate(restSpec, config, {
      outputDir,
      configDir: path.dirname(configPath),
      templateRoot,
      transport,
      asyncApiSpec: asyncApiSpec ?? undefined,
      graphqlSpec: graphqlSpec ?? undefined,
      openRpcSpec: openRpcSpec ?? undefined,
      specPaths: {
        openapi: openapiPaths,
        asyncapi: asyncapiPaths,
        graphql: graphqlPaths,
        grpc: grpcPaths,
        openrpc: openrpcPaths,
      },
    });

    this.logger.success(`Generated MCP server: ${result.files.length} files`);
    this.logger.list(result.files);
    this.logger.info('');
    this.logger.info('Next steps:');
    this.logger.list([
      `cd ${outputDir}`,
      'npm install',
      'npm run build',
      transport === 'stdio' ? 'npm start' : 'npm start  (listens on port 3200)',
    ]);
  }

  @Option({ flags: '-s, --spec <path>', description: 'Override the configured OpenAPI source' })
  parseSpec(val: string): string {
    return val;
  }

  @Option({ flags: '-o, --output <dir>', description: 'Output directory for MCP server' })
  parseOutput(val: string): string {
    return val;
  }

  @Option({ flags: '-t, --transport <type>', description: 'Transport type: stdio or sse' })
  parseTransport(val: string): 'stdio' | 'sse' {
    if (val !== 'stdio' && val !== 'sse') {
      throw new Error('Transport must be either "stdio" or "sse".');
    }
    return val;
  }
}
