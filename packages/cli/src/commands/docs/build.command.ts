import * as fs from 'node:fs';
import * as path from 'node:path';
import { SubCommand, CommandRunner, Option } from 'nest-commander';
import { assertTemplateRoot } from '@cortex-docs/codegen';
import {
  getAllLanguageTemplateDirs,
  getFirstSpecPath,
  isRemoteLocation,
  resolveGeneratorTemplateRoot,
} from '@cortex-docs/core';
import { LoggerService } from '../../services/logger.service';
import { ProjectService } from '../../services/project.service';
import { prepareDocsUiBuildRuntime, resolveDocsUiPath, resolveNextBin } from './runtime';

@SubCommand({
  name: 'build',
  description: 'Build static HTML API documentation',
})
export class DocsBuildCommand extends CommandRunner {
  constructor(
    private readonly logger: LoggerService,
    private readonly project: ProjectService,
  ) {
    super();
  }

  async run(
    params: string[],
    options: { spec?: string; output?: string; config?: string; repository?: string },
  ): Promise<void> {
    this.logger.header('Cortex Docs Build');

    const foundConfigPath = options.config ?? (await this.project.findConfig());
    const configPath = foundConfigPath ? path.resolve(foundConfigPath) : undefined;
    const config = await this.project.loadConfig(configPath);
    const templateRoot = resolveGeneratorTemplateRoot(config, configPath);
    assertTemplateRoot(templateRoot);
    const languageTemplateDirs = getAllLanguageTemplateDirs(config, configPath);
    for (const templateDir of languageTemplateDirs) assertTemplateRoot(templateDir);
    const specPath = options.spec
      ? isRemoteLocation(options.spec)
        ? options.spec
        : path.resolve(options.spec)
      : getFirstSpecPath(config, 'openapi-spec');
    const outputDir = path.resolve(options.output ?? '.cortex/docs');

    if (specPath) this.logger.info(`Spec: ${specPath}`);
    if (templateRoot) this.logger.info(`Templates: ${templateRoot}`);
    if (languageTemplateDirs.length > 0) {
      this.logger.info(`Source templates: ${languageTemplateDirs.length}`);
    }
    this.logger.info(`Output: ${outputDir}`);
    this.logger.info('');

    const docsUiPath = resolveDocsUiPath();
    const nextBin = resolveNextBin(docsUiPath);

    const { execFileSync } = await import('node:child_process');
    const runtimeDir = fs.mkdtempSync(path.join(docsUiPath, '.cortex-build-'));
    const exportDir = path.join(runtimeDir, 'out');

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      CORTEX_DIST_DIR: '.next',
      CORTEX_DOCS_UI_ROOT: docsUiPath,
      CORTEX_STATIC_EXPORT: '1',
      CORTEX_CLOUDFLARE: '0',
    };
    if (options.repository)
      for (const key of Object.keys(env)) {
        if (
          key.startsWith('CORTEX_') &&
          ![
            'CORTEX_DIST_DIR',
            'CORTEX_DOCS_UI_ROOT',
            'CORTEX_STATIC_EXPORT',
            'CORTEX_CLOUDFLARE',
          ].includes(key)
        )
          delete env[key];
      }
    if (configPath) env.CORTEX_CONFIG_PATH = configPath;
    if (options.repository) env.CORTEX_HOSTED_REPOSITORY = options.repository;
    if (specPath) env.CORTEX_SPEC_PATH = specPath;
    const asyncApiPath = getFirstSpecPath(config, 'asyncapi-spec');
    if (asyncApiPath) env.CORTEX_ASYNCAPI_PATH = asyncApiPath;
    const graphqlPath = getFirstSpecPath(config, 'graphql-spec');
    if (graphqlPath) env.CORTEX_GRAPHQL_PATH = graphqlPath;
    const grpcPath = getFirstSpecPath(config, 'grpc-spec');
    if (grpcPath) env.CORTEX_GRPC_PATH = grpcPath;
    const openRpcPath = getFirstSpecPath(config, 'openrpc-spec');
    if (openRpcPath) env.CORTEX_OPENRPC_PATH = openRpcPath;
    if (config.logo) env.CORTEX_LOGO_PATH = config.logo;
    if (config.favicon) env.CORTEX_FAVICON_PATH = config.favicon;
    if (templateRoot) env.CORTEX_TEMPLATE_ROOT = templateRoot;
    if (languageTemplateDirs.length > 0) {
      env.CORTEX_LANGUAGE_TEMPLATE_DIRS = JSON.stringify(languageTemplateDirs);
    }

    this.logger.info('Building static docs...');
    try {
      prepareDocsUiBuildRuntime(docsUiPath, runtimeDir);
      if (env.CORTEX_HOSTED_REPOSITORY) {
        // Next's static exporter requires at least one parameter per dynamic route.
        // Omit unused routes from this isolated build for Markdown-only projects.
        const removeRoute = (route: string) =>
          fs.rmSync(path.join(runtimeDir, 'app', route), { recursive: true, force: true });
        const hasDocs = config.docs?.some((section) => section.sources.length > 0);
        if (!config.sources.length) {
          removeRoute('api-reference/[...slug]');
          removeRoute('sdks/[language]');
        }
        if (!hasDocs) removeRoute('docs/[slug]');
        if (!hasDocs && !config.sources.some((source) => source.intro)) removeRoute('mcp/[tool]');
        const assets = configPath ? path.join(path.dirname(configPath), 'assets') : '';
        if (
          !assets ||
          !fs.existsSync(assets) ||
          !fs
            .readdirSync(assets, { recursive: true, withFileTypes: true })
            .some((entry) => entry.isFile())
        )
          removeRoute('assets/[...path]');
      }
      execFileSync(process.execPath, [nextBin, 'build', '--webpack'], {
        cwd: runtimeDir,
        env,
        stdio: 'inherit',
      });

      if (!fs.existsSync(path.join(exportDir, 'index.html'))) {
        throw new Error('The static documentation build did not contain index.html.');
      }

      fs.rmSync(outputDir, { recursive: true, force: true });
      fs.cpSync(exportDir, outputDir, { recursive: true });
    } finally {
      fs.rmSync(runtimeDir, { recursive: true, force: true });
    }

    this.logger.success(`Static docs built to ${outputDir}`);
    this.logger.info('Deploy this directory to a static web host.');
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
