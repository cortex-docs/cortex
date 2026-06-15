import * as path from 'node:path';
import { SubCommand, CommandRunner, Option } from 'nest-commander';
import { McpGenerator } from '@cortex/mcp-gen';
import { getFirstSpecPath, getSourcesByType, AsyncAPIParser } from '@cortex/core';
import { LoggerService } from '../../services/logger.service';
import { ProjectService } from '../../services/project.service';

@SubCommand({
  name: 'generate',
  description: 'Generate an MCP server from your OpenAPI spec',
})
export class McpGenerateCommand extends CommandRunner {
  constructor(
    private readonly logger: LoggerService,
    private readonly project: ProjectService,
  ) {
    super();
  }

  async run(
    params: string[],
    options: { spec?: string; output?: string; transport?: 'stdio' | 'sse' },
  ): Promise<void> {
    this.logger.header('Cortex MCP Generate');

    const config = await this.project.loadConfig();
    const specPath = path.resolve(options.spec ?? getFirstSpecPath(config, 'openapi-spec') ?? '');
    const outputDir = path.resolve(options.output ?? '.cortex/mcp-server');
    const transport = options.transport ?? 'stdio';

    this.logger.info(`Spec: ${specPath}`);
    this.logger.info(`Output: ${outputDir}`);
    this.logger.info(`Transport: ${transport}`);
    this.logger.info('');

    const spec = await this.project.parseSpec(specPath);
    this.logger.success(
      `Parsed spec: ${spec.info.title} v${spec.info.version} (${spec.operations.length} operations)`,
    );

    const asyncapiSources = getSourcesByType(config, 'asyncapi-spec');
    let asyncApiSpec;
    if (asyncapiSources.length > 0) {
      const asyncParser = new AsyncAPIParser();
      asyncApiSpec = await asyncParser.parse(asyncapiSources[0].spec);
    }

    const gqlSources = getSourcesByType(config, 'graphql-spec');
    let graphqlSpec;
    if (gqlSources.length > 0) {
      const { GraphQLParser } = await import('@cortex/core');
      graphqlSpec = await new GraphQLParser().parse(gqlSources[0].spec);
    }

    const grpcSources = getSourcesByType(config, 'grpc-spec');
    let grpcSpec;
    if (grpcSources.length > 0) {
      const { GrpcParser } = await import('@cortex/core');
      grpcSpec = await new GrpcParser().parse(grpcSources[0].spec);
    }

    const configFile = await this.project.findConfig();

    const generator = new McpGenerator();
    const result = await generator.generate(spec, config, {
      outputDir,
      configDir: configFile ? path.dirname(configFile) : undefined,
      transport,
      asyncApiSpec,
      graphqlSpec,
      grpcSpec,
    });

    this.logger.success(`Generated MCP server: ${result.files.length} files`);
    this.logger.list(result.files);
    this.logger.info('');
    this.logger.info('Next steps:');
    this.logger.list([
      `cd ${outputDir}`,
      'npm install',
      'npm run build',
      transport === 'stdio' ? 'npm start' : `npm start  (listens on port 3200)`,
    ]);
  }

  @Option({ flags: '-s, --spec <path>', description: 'Path to OpenAPI spec file' })
  parseSpec(val: string): string {
    return val;
  }

  @Option({ flags: '-o, --output <dir>', description: 'Output directory for MCP server' })
  parseOutput(val: string): string {
    return val;
  }

  @Option({ flags: '-t, --transport <type>', description: 'Transport type: stdio or sse' })
  parseTransport(val: string): string {
    return val;
  }
}
