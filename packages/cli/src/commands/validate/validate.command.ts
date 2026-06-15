import * as path from 'node:path';
import { Command, CommandRunner, Option } from 'nest-commander';
import { getFirstSpecPath } from '@cortex/core';
import { LoggerService } from '../../services/logger.service';
import { ProjectService } from '../../services/project.service';

@Command({
  name: 'validate',
  description: 'Validate your OpenAPI spec and Cortex config',
})
export class ValidateCommand extends CommandRunner {
  constructor(
    private readonly logger: LoggerService,
    private readonly project: ProjectService,
  ) {
    super();
  }

  async run(params: string[], options: { spec?: string; config?: string }): Promise<void> {
    this.logger.header('Cortex Validate');

    let hasErrors = false;

    try {
      const config = await this.project.loadConfig(options.config);
      this.logger.success('Config is valid');

      const specPath = options.spec ?? getFirstSpecPath(config, 'openapi-spec') ?? '';
      const resolvedSpecPath = path.resolve(specPath);

      const result = await this.project.validateSpec(resolvedSpecPath);

      if (result.valid) {
        this.logger.success(`Spec is valid: ${resolvedSpecPath}`);
      } else {
        this.logger.error('Spec has errors:');
        for (const err of result.errors) {
          this.logger.error(`  ${err.path ? `${err.path}: ` : ''}${err.message}`);
        }
        hasErrors = true;
      }

      for (const warn of result.warnings) {
        this.logger.warn(`${warn.path ? `${warn.path}: ` : ''}${warn.message}`);
      }
    } catch (err) {
      this.logger.error(err instanceof Error ? err.message : String(err));
      hasErrors = true;
    }

    if (hasErrors) {
      process.exitCode = 1;
    }
  }

  @Option({ flags: '-s, --spec <path>', description: 'Path to OpenAPI spec file' })
  parseSpec(val: string): string {
    return val;
  }

  @Option({ flags: '-c, --config <path>', description: 'Path to cortex config file' })
  parseConfig(val: string): string {
    return val;
  }
}
