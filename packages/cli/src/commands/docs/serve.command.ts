import * as fs from 'node:fs';
import * as path from 'node:path';
import { SubCommand, CommandRunner, Option } from 'nest-commander';
import { LoggerService } from '../../services/logger.service';
import { ProjectService } from '../../services/project.service';
import {
  prepareDocsUiRuntime,
  resolveDevRuntimeDirName,
  resolveDocsUiPath,
  resolveNextBin,
  syncDocsUiRuntimeSources,
} from './runtime';
import { assertTemplateRoot } from '@cortex-docs/codegen';
import {
  getAllLanguageTemplateDirs,
  getFirstSpecPath,
  isRemoteLocation,
  resolveGeneratorTemplateRoot,
} from '@cortex-docs/core';

@SubCommand({
  name: 'serve',
  description: 'Start a local API docs server with file watching',
})
export class DocsServeCommand extends CommandRunner {
  constructor(
    private readonly logger: LoggerService,
    private readonly project: ProjectService,
  ) {
    super();
  }

  async run(
    params: string[],
    options: { spec?: string; asyncApi?: string; port?: number },
  ): Promise<void> {
    this.logger.header('Cortex Docs Serve');

    let specPath: string | undefined;
    let asyncapiPath: string | undefined;
    let graphqlPath: string | undefined;
    let grpcPath: string | undefined;
    let openRpcPath: string | undefined;
    let logoPath: string | undefined;
    let faviconPath: string | undefined;
    let configPath: string | undefined;
    let templateRoot: string | undefined;
    let languageTemplateDirs: string[] = [];

    const foundConfigPath = await this.project.findConfig();
    if (foundConfigPath) {
      configPath = path.resolve(foundConfigPath);
      const config = await this.project.loadConfig(configPath);
      templateRoot = resolveGeneratorTemplateRoot(config, configPath);
      languageTemplateDirs = getAllLanguageTemplateDirs(config, configPath);
      specPath = options.spec
        ? isRemoteLocation(options.spec)
          ? options.spec
          : path.resolve(options.spec)
        : getFirstSpecPath(config, 'openapi-spec')
          ? getFirstSpecPath(config, 'openapi-spec')!
          : undefined;
      if (options.asyncApi) {
        asyncapiPath = isRemoteLocation(options.asyncApi)
          ? options.asyncApi
          : path.resolve(options.asyncApi);
      } else {
        const asyncPath = getFirstSpecPath(config, 'asyncapi-spec');
        if (asyncPath) asyncapiPath = asyncPath;
      }
      const gqlPath = getFirstSpecPath(config, 'graphql-spec');
      if (gqlPath) graphqlPath = gqlPath;
      const protoPath = getFirstSpecPath(config, 'grpc-spec');
      if (protoPath) grpcPath = protoPath;
      const orpcPath = getFirstSpecPath(config, 'openrpc-spec');
      if (orpcPath) openRpcPath = orpcPath;
      if (config.logo) {
        logoPath = config.logo;
      }
      if (config.favicon) {
        faviconPath = config.favicon;
      }
    } else {
      if (options.spec) {
        specPath = isRemoteLocation(options.spec) ? options.spec : path.resolve(options.spec);
      }
      if (options.asyncApi) {
        asyncapiPath = isRemoteLocation(options.asyncApi)
          ? options.asyncApi
          : path.resolve(options.asyncApi);
      }
    }
    assertTemplateRoot(templateRoot);
    for (const templateDir of languageTemplateDirs) assertTemplateRoot(templateDir);

    const port = options.port ?? 3012;
    const projectDir = process.cwd();

    if (specPath) this.logger.info(`OpenAPI: ${specPath}`);
    if (asyncapiPath) this.logger.info(`AsyncAPI: ${asyncapiPath}`);
    if (graphqlPath) this.logger.info(`GraphQL: ${graphqlPath}`);
    if (grpcPath) this.logger.info(`gRPC: ${grpcPath}`);
    if (openRpcPath) this.logger.info(`OpenRPC: ${openRpcPath}`);
    if (templateRoot) this.logger.info(`Templates: ${templateRoot}`);
    if (languageTemplateDirs.length > 0) {
      this.logger.info(`Source templates: ${languageTemplateDirs.length}`);
    }
    this.logger.info(`Port: ${port}`);
    this.logger.info('');

    const cliRoot = path.resolve(__dirname, '..', '..', '..');
    const docsUiPath = resolveDocsUiPath();
    const runtimeDir = path.join(docsUiPath, resolveDevRuntimeDirName(projectDir));
    prepareDocsUiRuntime(docsUiPath, runtimeDir);
    this.logger.info(`Starting docs server at http://localhost:${port}`);
    this.logger.info('Press Ctrl+C to stop');

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      PORT: String(port),
      CORTEX_DIST_DIR: '.next',
      CORTEX_DOCS_UI_ROOT: docsUiPath,
    };
    if (configPath) env.CORTEX_CONFIG_PATH = configPath;
    if (specPath) env.CORTEX_SPEC_PATH = specPath;
    if (asyncapiPath) env.CORTEX_ASYNCAPI_PATH = asyncapiPath;
    if (graphqlPath) env.CORTEX_GRAPHQL_PATH = graphqlPath;
    if (grpcPath) env.CORTEX_GRPC_PATH = grpcPath;
    if (openRpcPath) env.CORTEX_OPENRPC_PATH = openRpcPath;
    if (logoPath) env.CORTEX_LOGO_PATH = logoPath;
    if (faviconPath) env.CORTEX_FAVICON_PATH = faviconPath;
    if (templateRoot) env.CORTEX_TEMPLATE_ROOT = templateRoot;
    if (languageTemplateDirs.length > 0) {
      env.CORTEX_LANGUAGE_TEMPLATE_DIRS = JSON.stringify(languageTemplateDirs);
    }

    const { spawn, execSync } = await import('node:child_process');

    const cliMain = path.resolve(cliRoot, 'dist', 'main.js');
    const runGenerate = () => {
      if (generating) return;
      generating = true;
      try {
        this.logger.info('Spec changed — regenerating...');
        execSync(`"${process.execPath}" "${cliMain}" generate`, {
          cwd: projectDir,
          stdio: 'inherit',
        });
        this.logger.success('Regeneration complete');
      } catch {
        this.logger.error('Regeneration failed');
      } finally {
        setTimeout(() => {
          generating = false;
        }, 1000);
      }
    };

    const nextBinResolved = resolveNextBin(docsUiPath);

    const child = spawn(process.execPath, [nextBinResolved, 'dev', '--port', String(port)], {
      cwd: runtimeDir,
      env,
      stdio: 'inherit',
    });

    let debounce: ReturnType<typeof setTimeout> | null = null;
    let runtimeSyncDebounce: ReturnType<typeof setTimeout> | null = null;
    let generating = false;
    const IGNORE = /(^|[\\/])(generated|node_modules|\.next|\.cortex|assets)([\\/]|$)/;

    const onChange = (_event: string, filename: string | Buffer | null) => {
      if (!filename || generating) return;
      const changedPath = filename.toString();
      if (IGNORE.test(changedPath)) return;
      const isSpec =
        /\.(yaml|yml|graphql|json|ejs)$/.test(changedPath) ||
        /cortex\.config\.(ya?ml)$/.test(changedPath);
      if (!isSpec) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(runGenerate, 500);
    };
    const watchers = [fs.watch(projectDir, { recursive: true }, onChange)];
    const extraTemplateDirs = new Set(
      [templateRoot, ...languageTemplateDirs].filter(
        (directory): directory is string =>
          !!directory &&
          directory !== projectDir &&
          !directory.startsWith(`${projectDir}${path.sep}`),
      ),
    );
    for (const templateDir of extraTemplateDirs) {
      watchers.push(fs.watch(templateDir, { recursive: true }, onChange));
    }

    watchers.push(
      fs.watch(docsUiPath, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        const changedPath = filename.toString();
        if (!/^(app|components|hooks|lib|public)[\\/]/.test(changedPath)) return;
        if (runtimeSyncDebounce) clearTimeout(runtimeSyncDebounce);
        runtimeSyncDebounce = setTimeout(() => {
          syncDocsUiRuntimeSources(docsUiPath, runtimeDir);
        }, 50);
      }),
    );
    this.logger.info('Watching for spec, configuration, and template changes');

    const cleanup = () => {
      for (const watcher of watchers) watcher.close();
      if (debounce) clearTimeout(debounce);
      if (runtimeSyncDebounce) clearTimeout(runtimeSyncDebounce);
      if (child.pid && !child.killed) {
        child.kill('SIGTERM');
      }
      process.exit(0);
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    await new Promise<void>((resolve, reject) => {
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          reject(new Error(`Docs server exited with code ${code}`));
        } else {
          resolve();
        }
      });
    });
  }

  @Option({ flags: '-s, --spec <path>', description: 'Path to OpenAPI spec file' })
  parseSpec(val: string): string {
    return val;
  }

  @Option({ flags: '--async-api <path>', description: 'Path to AsyncAPI spec file' })
  parseAsyncApi(val: string): string {
    return val;
  }

  @Option({ flags: '-p, --port <number>', description: 'Port to serve on (default: 3012)' })
  parsePort(val: string): number {
    const port = Number.parseInt(val, 10);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new Error('The port must be an integer from 1 through 65535.');
    }
    return port;
  }
}
