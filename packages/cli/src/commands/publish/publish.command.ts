import * as path from 'node:path';
import * as fs from 'node:fs';
import { execSync } from 'node:child_process';
import { Command, CommandRunner, Option } from 'nest-commander';
import { LoggerService } from '../../services/logger.service';

interface PublishTarget {
  language: string;
  dir: string;
  command: string;
  check: string;
}

@Command({
  name: 'publish',
  description: 'Publish generated SDKs to package registries',
  arguments: '[dir]',
})
export class PublishCommand extends CommandRunner {
  constructor(private readonly logger: LoggerService) {
    super();
  }

  async run(
    params: string[],
    options: { dryRun?: boolean; language?: string; registry?: string },
  ): Promise<void> {
    this.logger.header('Cortex Publish');

    const baseDir = path.resolve(params[0] ?? './generated');

    if (!fs.existsSync(baseDir)) {
      this.logger.error(`Directory not found: ${baseDir}`);
      this.logger.info('Run `cortex generate` first to create SDKs.');
      process.exitCode = 1;
      return;
    }

    const targets = this.detectTargets(baseDir, options.language, options.registry);

    if (targets.length === 0) {
      this.logger.warn('No publishable SDKs found.');
      this.logger.info('Looked in: ' + baseDir);
      return;
    }

    this.logger.info(`Found ${targets.length} SDK(s) to publish:\n`);

    for (const target of targets) {
      this.logger.info(`  ${target.language} → ${target.dir}`);
    }
    this.logger.info('');

    for (const target of targets) {
      await this.publishTarget(target, options.dryRun ?? false);
    }

    this.logger.info('');
    this.logger.success('Publish complete!');
  }

  @Option({ flags: '-d, --dry-run', description: 'Preview publish commands without executing' })
  parseDryRun(): boolean {
    return true;
  }

  @Option({ flags: '-l, --language <lang>', description: 'Publish only a specific language SDK' })
  parseLanguage(val: string): string {
    return val;
  }

  @Option({ flags: '-r, --registry <url>', description: 'Override registry URL (npm only)' })
  parseRegistry(val: string): string {
    return val;
  }

  private detectTargets(baseDir: string, language?: string, registry?: string): PublishTarget[] {
    const targets: PublishTarget[] = [];

    const entries = fs.readdirSync(baseDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (language && entry.name !== language) continue;

      const dir = path.join(baseDir, entry.name);
      const target = this.identifyTarget(dir, entry.name, registry);
      if (target) targets.push(target);
    }

    return targets;
  }

  private identifyTarget(dir: string, name: string, registry?: string): PublishTarget | null {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      const registryFlag = registry ? ` --registry ${registry}` : '';
      return {
        language: name,
        dir,
        command: `npm publish --access public${registryFlag}`,
        check: 'npm pack --dry-run',
      };
    }

    if (fs.existsSync(path.join(dir, 'setup.py')) || fs.existsSync(path.join(dir, 'pyproject.toml'))) {
      return {
        language: name,
        dir,
        command: 'python -m build && twine upload dist/*',
        check: 'python -m build',
      };
    }

    if (fs.existsSync(path.join(dir, 'go.mod'))) {
      return {
        language: name,
        dir,
        command: 'git tag v0.1.0 && git push origin v0.1.0',
        check: 'go build ./...',
      };
    }

    if (fs.existsSync(path.join(dir, 'pom.xml'))) {
      return {
        language: name,
        dir,
        command: 'mvn deploy',
        check: 'mvn compile',
      };
    }

    if (fs.existsSync(path.join(dir, 'build.gradle.kts'))) {
      return {
        language: name,
        dir,
        command: 'gradle publish',
        check: 'gradle build',
      };
    }

    const gemspec = fs.readdirSync(dir).find((f) => f.endsWith('.gemspec'));
    if (gemspec) {
      const gemName = gemspec.replace('.gemspec', '');
      return {
        language: name,
        dir,
        command: `gem build ${gemspec} && gem push ${gemName}-*.gem`,
        check: `gem build ${gemspec}`,
      };
    }

    if (fs.existsSync(path.join(dir, 'composer.json'))) {
      return {
        language: name,
        dir,
        command: 'git tag v0.1.0 && git push origin v0.1.0',
        check: 'composer validate',
      };
    }

    const csproj = fs.readdirSync(dir).find((f) => f.endsWith('.csproj'));
    if (csproj) {
      return {
        language: name,
        dir,
        command: 'dotnet pack -c Release && dotnet nuget push **/*.nupkg',
        check: 'dotnet build',
      };
    }

    return null;
  }

  private async publishTarget(target: PublishTarget, dryRun: boolean): Promise<void> {
    if (dryRun) {
      this.logger.info(`[dry-run] ${target.language}: ${target.command}`);
      this.logger.info(`  in ${target.dir}`);
      return;
    }

    try {
      this.logger.info(`Publishing ${target.language}...`);
      execSync(target.command, { cwd: target.dir, stdio: 'inherit' });
      this.logger.success(`${target.language}: published`);
    } catch (err) {
      this.logger.error(`${target.language}: publish failed`);
      this.logger.error(err instanceof Error ? err.message : String(err));
    }
  }
}
