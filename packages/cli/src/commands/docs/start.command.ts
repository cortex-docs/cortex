import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { SubCommand, CommandRunner, Option } from 'nest-commander';
import {
  getAllLanguageTemplateDirs,
  getFirstSpecPath,
  resolveGeneratorTemplateRoot,
} from '@cortex-docs/core';
import { LoggerService } from '../../services/logger.service';
import { ProjectService } from '../../services/project.service';

@SubCommand({
  name: 'start',
  description: 'Start a production Cortex Docs build',
})
export class DocsStartCommand extends CommandRunner {
  constructor(
    private readonly logger: LoggerService,
    private readonly project: ProjectService,
  ) {
    super();
  }

  async run(_params: string[], options: { output?: string; port?: number }): Promise<void> {
    const configPath = await this.project.findConfig();
    if (!configPath) throw new Error('No cortex.config.yml file was found.');
    const absoluteConfigPath = path.resolve(configPath);
    const config = await this.project.loadConfig(absoluteConfigPath);
    const outputDir = path.resolve(options.output ?? '.cortex/docs');
    const port = options.port ?? 3012;
    const templateRoot = resolveGeneratorTemplateRoot(config, absoluteConfigPath);
    const languageTemplateDirs = getAllLanguageTemplateDirs(config, absoluteConfigPath);

    const manifestPath = path.join(outputDir, '.cortex-docs-build.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error(
        `No production documentation build was found at ${outputDir}. Run \`cortex docs build\` first.`,
      );
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
      schemaVersion?: number;
      server?: string;
    };
    if (manifest.schemaVersion !== 1 || !manifest.server) {
      throw new Error(`The production documentation build at ${outputDir} is not valid.`);
    }
    const serverPath = path.resolve(outputDir, manifest.server);
    if (!serverPath.startsWith(`${outputDir}${path.sep}`) || !fs.existsSync(serverPath)) {
      throw new Error(`The production documentation server is missing from ${outputDir}.`);
    }
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      CORTEX_CONFIG_PATH: absoluteConfigPath,
      CORTEX_SPEC_PATH: getFirstSpecPath(config, 'openapi-spec'),
      CORTEX_ASYNCAPI_PATH: getFirstSpecPath(config, 'asyncapi-spec'),
      CORTEX_GRAPHQL_PATH: getFirstSpecPath(config, 'graphql-spec'),
      CORTEX_GRPC_PATH: getFirstSpecPath(config, 'grpc-spec'),
      CORTEX_OPENRPC_PATH: getFirstSpecPath(config, 'openrpc-spec'),
      CORTEX_LOGO_PATH: config.logo,
      CORTEX_FAVICON_PATH: config.favicon,
      CORTEX_TEMPLATE_ROOT: templateRoot,
      CORTEX_LANGUAGE_TEMPLATE_DIRS:
        languageTemplateDirs.length > 0 ? JSON.stringify(languageTemplateDirs) : undefined,
      PORT: String(port),
      HOSTNAME: process.env.HOSTNAME ?? '0.0.0.0',
    };

    this.logger.info(`Starting Cortex Docs at http://localhost:${port}`);
    const child = spawn(process.execPath, [serverPath], {
      cwd: path.dirname(serverPath),
      env,
      stdio: 'inherit',
    });

    const exitCode = await new Promise<number>((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => {
        if (signal) reject(new Error(`The documentation server stopped with signal ${signal}.`));
        else resolve(code ?? 1);
      });
    });
    if (exitCode !== 0) {
      throw new Error(`The documentation server stopped with exit code ${exitCode}.`);
    }
  }

  @Option({ flags: '-o, --output <dir>', description: 'Production build directory' })
  parseOutput(value: string): string {
    return value;
  }

  @Option({ flags: '-p, --port <port>', description: 'Port number' })
  parsePort(value: string): number {
    const port = Number.parseInt(value, 10);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new Error('The port must be an integer from 1 through 65535.');
    }
    return port;
  }
}
