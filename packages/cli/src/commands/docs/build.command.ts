import * as path from 'node:path';
import { SubCommand, CommandRunner, Option } from 'nest-commander';
import { getFirstSpecPath } from '@cortex/core';
import { LoggerService } from '../../services/logger.service';
import { ProjectService } from '../../services/project.service';

@SubCommand({
  name: 'build',
  description: 'Build static API documentation',
})
export class DocsBuildCommand extends CommandRunner {
  constructor(
    private readonly logger: LoggerService,
    private readonly project: ProjectService,
  ) {
    super();
  }

  async run(params: string[], options: { spec?: string; output?: string }): Promise<void> {
    this.logger.header('Cortex Docs Build');

    const config = await this.project.loadConfig();
    const specPath = path.resolve(options.spec ?? getFirstSpecPath(config, 'openapi-spec') ?? '');
    const outputDir = path.resolve(options.output ?? '.cortex/docs');

    this.logger.info(`Spec: ${specPath}`);
    this.logger.info(`Output: ${outputDir}`);
    this.logger.info('');

    const docsUiPath = path.resolve(__dirname, '../../..', 'docs-ui');

    const { execSync } = await import('node:child_process');

    this.logger.info('Building docs...');
    execSync('npx next build', {
      cwd: docsUiPath,
      env: {
        ...process.env,
        CORTEX_SPEC_PATH: specPath,
        CORTEX_OUTPUT_DIR: outputDir,
      },
      stdio: 'inherit',
    });

    this.logger.success(`Docs built to ${outputDir}`);
  }

  @Option({ flags: '-s, --spec <path>', description: 'Path to OpenAPI spec file' })
  parseSpec(val: string): string {
    return val;
  }

  @Option({ flags: '-o, --output <dir>', description: 'Output directory for built docs' })
  parseOutput(val: string): string {
    return val;
  }
}
