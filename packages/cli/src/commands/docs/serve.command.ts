import * as fs from 'node:fs';
import * as path from 'node:path';
import { SubCommand, CommandRunner, Option } from 'nest-commander';
import { LoggerService } from '../../services/logger.service';
import { ProjectService } from '../../services/project.service';
import { getFirstSpecPath } from '@cortex/core';

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
    let logoPath: string | undefined;
    let faviconPath: string | undefined;

    try {
      const config = await this.project.loadConfig();
      specPath = options.spec
        ? path.resolve(options.spec)
        : getFirstSpecPath(config, 'openapi-spec')
          ? path.resolve(getFirstSpecPath(config, 'openapi-spec')!)
          : undefined;
      if (options.asyncApi) {
        asyncapiPath = path.resolve(options.asyncApi);
      } else {
        const asyncPath = getFirstSpecPath(config, 'asyncapi-spec');
        if (asyncPath) asyncapiPath = path.resolve(asyncPath);
      }
      const gqlPath = getFirstSpecPath(config, 'graphql-spec');
      if (gqlPath) graphqlPath = path.resolve(gqlPath);
      const grPath = getFirstSpecPath(config, 'grpc-spec');
      if (grPath) grpcPath = path.resolve(grPath);
      if (config.logo) {
        logoPath = path.resolve(config.logo);
      }
      if (config.favicon) {
        faviconPath = path.resolve(config.favicon);
      }
    } catch {
      if (options.spec) specPath = path.resolve(options.spec);
      if (options.asyncApi) asyncapiPath = path.resolve(options.asyncApi);
    }

    const port = options.port ?? 3012;
    const projectDir = process.cwd();

    if (specPath) this.logger.info(`OpenAPI: ${specPath}`);
    if (asyncapiPath) this.logger.info(`AsyncAPI: ${asyncapiPath}`);
    if (graphqlPath) this.logger.info(`GraphQL: ${graphqlPath}`);
    if (grpcPath) this.logger.info(`gRPC: ${grpcPath}`);
    this.logger.info(`Port: ${port}`);
    this.logger.info('');

    const cliRoot = path.resolve(__dirname, '..', '..', '..');
    const docsUiPath = path.resolve(cliRoot, '..', 'docs-ui');
    this.logger.info(`Starting docs server at http://localhost:${port}`);
    this.logger.info('Press Ctrl+C to stop');

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      PORT: String(port),
    };
    if (specPath) env.CORTEX_SPEC_PATH = specPath;
    if (asyncapiPath) env.CORTEX_ASYNCAPI_PATH = asyncapiPath;
    if (graphqlPath) env.CORTEX_GRAPHQL_PATH = graphqlPath;
    if (grpcPath) env.CORTEX_GRPC_PATH = grpcPath;
    if (logoPath) env.CORTEX_LOGO_PATH = logoPath;
    if (faviconPath) env.CORTEX_FAVICON_PATH = faviconPath;

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

    const nextBin = path.join(docsUiPath, 'node_modules', '.bin', 'next');
    const nextBinResolved = fs.existsSync(nextBin)
      ? nextBin
      : path.join(cliRoot, '..', '..', 'node_modules', '.bin', 'next');

    const child = spawn(process.execPath, [nextBinResolved, 'dev', '--port', String(port)], {
      cwd: docsUiPath,
      env,
      detached: true,
      stdio: 'inherit',
    });

    let debounce: ReturnType<typeof setTimeout> | null = null;
    let generating = false;
    const IGNORE = /(^|[\\/])(generated|node_modules|\.next|assets)([\\/]|$)/;

    fs.watch(projectDir, { recursive: true }, (_event, filename) => {
      if (!filename || generating) return;
      if (IGNORE.test(filename)) return;
      const isSpec =
        /\.(yaml|yml|graphql|proto)$/.test(filename) || /cortex\.config\.(ya?ml)$/.test(filename);
      if (!isSpec) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(runGenerate, 500);
    });
    this.logger.info('Watching for spec & config changes');

    const childPid = child.pid;
    const cleanup = () => {
      if (childPid) {
        try { process.kill(-childPid, 'SIGTERM'); } catch {}
        setTimeout(() => {
          try { process.kill(-childPid, 'SIGKILL'); } catch {}
        }, 1000);
      }
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', cleanup);

    await new Promise<void>((_, reject) => {
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code !== 0) reject(new Error(`Docs server exited with code ${code}`));
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
    return parseInt(val, 10);
  }
}
