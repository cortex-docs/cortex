import * as path from 'node:path';
import { Command, CommandRunner, Option } from 'nest-commander';
import {
  AsyncAPIParser,
  GraphQLParser,
  GrpcParser,
  OpenRpcParser,
  getSourcesByType,
  isRemoteLocation,
} from '@cortex/core';
import { LoggerService } from '../../services/logger.service';
import { ProjectService } from '../../services/project.service';

@Command({
  name: 'validate',
  description: 'Validate the Cortex config and every configured API source',
})
export class ValidateCommand extends CommandRunner {
  constructor(
    private readonly logger: LoggerService,
    private readonly project: ProjectService,
  ) {
    super();
  }

  async run(_params: string[], options: { spec?: string; config?: string }): Promise<void> {
    this.logger.header('Cortex Validate');

    let hasErrors = false;
    try {
      const config = await this.project.loadConfig(options.config);
      this.logger.success('Config is valid');

      const configuredOpenApiPaths = getSourcesByType(config, 'openapi-spec').map(
        (source) => source.spec,
      );
      const openApiPaths = options.spec
        ? [isRemoteLocation(options.spec) ? options.spec : path.resolve(options.spec)]
        : configuredOpenApiPaths;

      for (const specPath of openApiPaths) {
        const result = await this.project.validateSpec(specPath);
        if (result.valid) {
          this.logger.success(`OpenAPI source is valid: ${specPath}`);
        } else {
          this.logger.error(`OpenAPI source has errors: ${specPath}`);
          for (const error of result.errors) {
            this.logger.error(`  ${error.path ? `${error.path}: ` : ''}${error.message}`);
          }
          hasErrors = true;
        }
        for (const warning of result.warnings) {
          this.logger.warn(`${warning.path ? `${warning.path}: ` : ''}${warning.message}`);
        }
      }

      const parsers = [
        {
          label: 'AsyncAPI',
          paths: getSourcesByType(config, 'asyncapi-spec').map((source) => source.spec),
          parse: (specPath: string) => new AsyncAPIParser().parse(specPath),
        },
        {
          label: 'GraphQL',
          paths: getSourcesByType(config, 'graphql-spec').map((source) => source.spec),
          parse: (specPath: string) => new GraphQLParser().parse(specPath),
        },
        {
          label: 'gRPC',
          paths: getSourcesByType(config, 'grpc-spec').map((source) => source.spec),
          parse: (specPath: string) => new GrpcParser().parse(specPath),
        },
        {
          label: 'OpenRPC',
          paths: getSourcesByType(config, 'openrpc-spec').map((source) => source.spec),
          parse: (specPath: string) => new OpenRpcParser().parse(specPath),
        },
      ];

      for (const parser of parsers) {
        for (const specPath of parser.paths) {
          try {
            await parser.parse(specPath);
            this.logger.success(`${parser.label} source is valid: ${specPath}`);
          } catch (error) {
            this.logger.error(
              `${parser.label} source has errors: ${specPath}: ${error instanceof Error ? error.message : String(error)}`,
            );
            hasErrors = true;
          }
        }
      }

      const sourceCount =
        openApiPaths.length + parsers.reduce((count, parser) => count + parser.paths.length, 0);
      if (sourceCount === 0) this.logger.warn('No API sources are configured.');
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error));
      hasErrors = true;
    }

    if (hasErrors) process.exitCode = 1;
  }

  @Option({ flags: '-s, --spec <path>', description: 'Override the configured OpenAPI source' })
  parseSpec(val: string): string {
    return val;
  }

  @Option({ flags: '-c, --config <path>', description: 'Path to cortex config file' })
  parseConfig(val: string): string {
    return val;
  }
}
