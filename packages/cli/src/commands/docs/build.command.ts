import * as fs from 'node:fs';
import * as path from 'node:path';
import { SubCommand, CommandRunner, Option } from 'nest-commander';
import { assertTemplateRoot } from '@cortex/codegen';
import {
  getAllLanguageTemplateDirs,
  getFirstSpecPath,
  isRemoteLocation,
  resolveGeneratorTemplateRoot,
} from '@cortex/core';
import { LoggerService } from '../../services/logger.service';
import { ProjectService } from '../../services/project.service';
import { resolveDocsUiPath, resolveNextBin } from './runtime';

@SubCommand({
  name: 'build',
  description: 'Build production API documentation',
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

    const foundConfigPath = await this.project.findConfig();
    const configPath = foundConfigPath ? path.resolve(foundConfigPath) : undefined;
    const config = await this.project.loadConfig();
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
    const buildDir = fs.mkdtempSync(path.join(docsUiPath, '.cortex-build-'));
    const distDir = path.basename(buildDir);
    const docsUiTsConfig = path.join(docsUiPath, 'tsconfig.json');
    const docsUiNextEnv = path.join(docsUiPath, 'next-env.d.ts');
    const originalTsConfig = fs.readFileSync(docsUiTsConfig, 'utf-8');
    const originalNextEnv = fs.readFileSync(docsUiNextEnv, 'utf-8');

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      CORTEX_DIST_DIR: distDir,
      CORTEX_STANDALONE_BUILD: '1',
    };
    if (configPath) env.CORTEX_CONFIG_PATH = configPath;
    if (specPath) env.CORTEX_SPEC_PATH = specPath;
    if (templateRoot) env.CORTEX_TEMPLATE_ROOT = templateRoot;

    this.logger.info('Building docs...');
    try {
      execFileSync(process.execPath, [nextBin, 'build', '--webpack'], {
        cwd: docsUiPath,
        env,
        stdio: 'inherit',
      });

      const standaloneRoot = path.join(buildDir, 'standalone');
      const serverPath = this.findStandaloneServer(standaloneRoot);
      if (!serverPath) throw new Error('The Next.js standalone build did not contain server.js.');

      fs.rmSync(outputDir, { recursive: true, force: true });
      fs.mkdirSync(outputDir, { recursive: true });
      fs.cpSync(standaloneRoot, outputDir, { recursive: true });

      const relativeServer = path.relative(standaloneRoot, serverPath);
      const deployedServerDir = path.dirname(path.join(outputDir, relativeServer));
      const deployedDistDir = path.join(deployedServerDir, distDir);
      fs.mkdirSync(deployedDistDir, { recursive: true });
      fs.cpSync(path.join(buildDir, 'static'), path.join(deployedDistDir, 'static'), {
        recursive: true,
      });
      const publicDir = path.join(docsUiPath, 'public');
      if (fs.existsSync(publicDir)) {
        fs.cpSync(publicDir, path.join(deployedServerDir, 'public'), { recursive: true });
      }
      fs.writeFileSync(
        path.join(outputDir, '.cortex-docs-build.json'),
        `${JSON.stringify({ schemaVersion: 1, server: relativeServer }, null, 2)}\n`,
        'utf-8',
      );
    } finally {
      fs.writeFileSync(docsUiTsConfig, originalTsConfig, 'utf-8');
      fs.writeFileSync(docsUiNextEnv, originalNextEnv, 'utf-8');
      fs.rmSync(buildDir, { recursive: true, force: true });
    }

    this.logger.success(`Docs built to ${outputDir}`);
    this.logger.info(`Start the build with: cortex docs start --output ${outputDir}`);
  }

  @Option({ flags: '-s, --spec <path>', description: 'Path to OpenAPI spec file' })
  parseSpec(val: string): string {
    return val;
  }

  @Option({ flags: '-o, --output <dir>', description: 'Output directory for built docs' })
  parseOutput(val: string): string {
    return val;
  }

  private findStandaloneServer(directory: string): string | undefined {
    if (!fs.existsSync(directory)) return undefined;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      if (entry.isFile() && entry.name === 'package.json') {
        try {
          const packageJson = JSON.parse(fs.readFileSync(candidate, 'utf-8')) as { name?: string };
          const serverPath = path.join(directory, 'server.js');
          if (packageJson.name === '@cortex/docs-ui' && fs.existsSync(serverPath)) {
            return serverPath;
          }
        } catch {
          // Ignore unrelated package manifests that cannot be parsed.
        }
      }
      if (entry.isDirectory()) {
        const nested = this.findStandaloneServer(candidate);
        if (nested) return nested;
      }
    }
    return undefined;
  }
}
