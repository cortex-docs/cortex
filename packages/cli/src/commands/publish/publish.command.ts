import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { spawnSync } from 'node:child_process';
import { Command, CommandRunner, Option } from 'nest-commander';
import type {
  CortexConfig,
  PublishGitHubConfig,
  PublishRegistryConfig,
  SupportedLanguage,
} from '@cortex-docs/core';
import {
  gitRepositoryUrl as resolveGitRepositoryUrl,
  normalizeRepositoryUrl,
} from '@cortex-docs/core';
import { LoggerService } from '../../services/logger.service';
import { ProjectService } from '../../services/project.service';
import { hashPackageDirectory } from './package-checksum';
import {
  getPublishedChecksum,
  getPublishedGitChecksum,
  getPublishedGitVersion,
  getPublishedVersion,
  latestSemanticVersion,
} from './registry-version';

interface CortexPackageMetadata {
  schemaVersion: number;
  kind?: 'sdk' | 'mcp-server';
  language: SupportedLanguage;
  packageName: string;
  version: string;
  contentChecksum?: string;
  githubRepository?: string;
}

export interface PublishTarget {
  kind: 'sdk' | 'mcp-server';
  language: SupportedLanguage;
  packageName: string;
  version: string;
  dir: string;
  manifest: string;
  registry: PublishRegistryConfig;
  registryEnabled: boolean;
  githubEnabled: boolean;
  githubRepository?: string;
  github: PublishGitHubConfig;
  previousVersion?: string;
  previousChecksum?: string;
  contentChecksum?: string;
  publishRegistry?: boolean;
  publishGithub?: boolean;
  releaseReason?: string;
}

export interface PublishSelection {
  kind: 'sdk' | 'mcp-server';
  language?: SupportedLanguage;
}

type VersionBump = 'patch' | 'minor' | 'major';

interface PublishOptions {
  config?: string;
  dryRun?: boolean;
  sdk?: string;
  mcp?: boolean;
  bump?: VersionBump;
  registry?: string;
}

interface RunOptions {
  env?: NodeJS.ProcessEnv;
  displayArgs?: string[];
}

interface GitCredentials {
  token?: string;
  username?: string;
}

const SUPPORTED_SDK_LANGUAGES: readonly SupportedLanguage[] = [
  'typescript',
  'python',
  'go',
  'java',
  'kotlin',
  'ruby',
  'php',
  'csharp',
  'rust',
  'cpp',
  'c',
];

const SKIPPED_DIRECTORIES = new Set([
  '.git',
  '.gradle',
  '.idea',
  '.venv',
  'bin',
  'build',
  'dist',
  'node_modules',
  'obj',
  'target',
  'vendor',
]);

const SKIPPED_REPOSITORY_FILES = new Set(['Cargo.lock', 'package-lock.json']);

const CHECKSUM_PLACEHOLDER = `sha256:${'0'.repeat(64)}`;

const DEFAULT_TOKEN_ENV: Partial<Record<SupportedLanguage, string>> = {
  typescript: 'NPM_TOKEN',
  python: 'PYPI_TOKEN',
  go: 'GIT_TOKEN',
  java: 'MAVEN_TOKEN',
  kotlin: 'MAVEN_TOKEN',
  ruby: 'GEM_HOST_API_KEY',
  php: 'GIT_TOKEN',
  csharp: 'NUGET_API_KEY',
  rust: 'CARGO_REGISTRY_TOKEN',
  cpp: 'CONAN_PASSWORD',
  c: 'CONAN_PASSWORD',
};

const DEFAULT_USERNAME_ENV: Partial<Record<SupportedLanguage, string>> = {
  go: 'GIT_USERNAME',
  java: 'MAVEN_USERNAME',
  kotlin: 'MAVEN_USERNAME',
  php: 'GIT_USERNAME',
  cpp: 'CONAN_LOGIN_USERNAME',
  c: 'CONAN_LOGIN_USERNAME',
};

const DEFAULT_REGISTRY_URL: Partial<Record<SupportedLanguage, string>> = {
  typescript: 'https://registry.npmjs.org',
  python: 'https://upload.pypi.org/legacy/',
  ruby: 'https://rubygems.org',
  csharp: 'https://api.nuget.org/v3/index.json',
};

const MANIFESTS: Array<[string, SupportedLanguage]> = [
  ['package.json', 'typescript'],
  ['pyproject.toml', 'python'],
  ['setup.py', 'python'],
  ['go.mod', 'go'],
  ['pom.xml', 'java'],
  ['build.gradle.kts', 'kotlin'],
  ['composer.json', 'php'],
  ['Cargo.toml', 'rust'],
  ['CMakeLists.txt', 'cpp'],
  ['Makefile', 'c'],
];

function targetType(target: Pick<PublishTarget, 'kind' | 'language'>): string {
  return target.kind === 'mcp-server' ? 'mcp' : target.language;
}

function githubPublishConfig(
  value: PublishRegistryConfig['github'],
): PublishGitHubConfig | undefined {
  if (value === true) return {};
  if (!value || value.enabled === false) return undefined;
  return value;
}

function sameGitRepository(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) return false;
  const normalize = (value: string) =>
    resolveGitRepositoryUrl(value)
      .replace(/\.git$/i, '')
      .replace(/\/$/, '')
      .toLowerCase();
  return normalize(left) === normalize(right);
}

function versionAtLeast(candidate: string, baseline: string): boolean {
  return latestSemanticVersion([candidate, baseline]) === candidate;
}

export function incrementVersion(version: string, bump: VersionBump = 'patch'): string {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) throw new Error(`Cannot increment invalid package version: ${version}`);
  let major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]);
  if (bump === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (bump === 'minor') {
    minor += 1;
    patch = 0;
  } else {
    if (!match[4]) patch += 1;
  }
  return `${major}.${minor}.${patch}`;
}

interface FileSnapshot {
  file: string;
  content?: string;
}

export function updateTargetVersion(
  target: PublishTarget,
  version: string,
  contentChecksum?: string,
): () => void {
  const updates = new Map<string, string>();

  const readContent = (file: string): string => updates.get(file) ?? fs.readFileSync(file, 'utf8');

  const updateJson = (file: string, values: Record<string, unknown>, required = true): boolean => {
    if (!fs.existsSync(file)) {
      if (required) throw new Error(`Package manifest not found: ${file}`);
      return false;
    }
    const data = JSON.parse(readContent(file)) as Record<string, unknown>;
    updates.set(file, `${JSON.stringify({ ...data, ...values }, null, 2)}\n`);
    return true;
  };

  const transformText = (
    file: string,
    transform: (content: string) => string | undefined,
    required = true,
  ): boolean => {
    if (!fs.existsSync(file)) {
      if (required) throw new Error(`Package manifest not found: ${file}`);
      return false;
    }
    const next = transform(readContent(file));
    if (next === undefined) {
      if (required) throw new Error(`Package metadata field not found: ${file}`);
      return false;
    }
    updates.set(file, next);
    return true;
  };

  const updateText = (
    file: string,
    pattern: RegExp,
    replacement: string,
    required = true,
  ): boolean => {
    return transformText(
      file,
      (content) => (pattern.test(content) ? content.replace(pattern, replacement) : undefined),
      required,
    );
  };

  switch (target.language) {
    case 'typescript': {
      const packageFile = path.join(target.dir, 'package.json');
      const packageJson = JSON.parse(readContent(packageFile)) as Record<string, unknown>;
      const values: Record<string, unknown> = { version };
      if (contentChecksum) {
        const cortex =
          packageJson.cortex && typeof packageJson.cortex === 'object'
            ? (packageJson.cortex as Record<string, unknown>)
            : {};
        const files = Array.isArray(packageJson.files)
          ? packageJson.files.filter((file): file is string => typeof file === 'string')
          : undefined;
        values.cortex = { ...cortex, contentChecksum };
        if (files && !files.includes('.cortex-package.json'))
          values.files = [...files, '.cortex-package.json'];
      }
      updateJson(packageFile, values);
      if (target.kind === 'mcp-server') {
        updateText(
          path.join(target.dir, 'src/server.ts'),
          /(version:\s*)['"][^'"]+['"]/,
          `$1'${version}'`,
          false,
        );
      }
      break;
    }
    case 'python': {
      const pyproject = updateText(
        path.join(target.dir, 'pyproject.toml'),
        /^(version\s*=\s*)["'][^"']+["']/m,
        `$1"${version}"`,
        false,
      );
      const setup = updateText(
        path.join(target.dir, 'setup.py'),
        /(version\s*=\s*)["'][^"']+["']/,
        `$1"${version}"`,
        false,
      );
      if (!pyproject && !setup) throw new Error(`Python version field not found: ${target.dir}`);
      break;
    }
    case 'java': {
      const pom = path.join(target.dir, 'pom.xml');
      updateText(pom, /(<version>)[^<]+(<\/version>)/, `$1${version}$2`);
      if (contentChecksum) {
        transformText(pom, (content) => {
          if (/<cortex\.contentChecksum>[^<]*<\/cortex\.contentChecksum>/.test(content)) {
            return content.replace(
              /(<cortex\.contentChecksum>)[^<]*(<\/cortex\.contentChecksum>)/,
              `$1${contentChecksum}$2`,
            );
          }
          if (/<\/properties>/.test(content)) {
            return content.replace(
              /<\/properties>/,
              `    <cortex.contentChecksum>${contentChecksum}</cortex.contentChecksum>\n    </properties>`,
            );
          }
          return content.replace(
            /<\/project>/,
            `    <properties>\n        <cortex.contentChecksum>${contentChecksum}</cortex.contentChecksum>\n    </properties>\n</project>`,
          );
        });
      }
      break;
    }
    case 'kotlin': {
      const gradle = path.join(target.dir, 'build.gradle.kts');
      updateText(gradle, /^(version\s*=\s*)["'][^"']+["']/m, `$1"${version}"`);
      if (contentChecksum) {
        const block = `// cortex-publish-metadata:start\nval cortexContentChecksum = "${contentChecksum}"\n\npublishing {\n    publications.withType<MavenPublication>().configureEach {\n        pom.withXml {\n            val properties = asNode().appendNode("properties")\n            properties.appendNode("cortex.contentChecksum", cortexContentChecksum)\n        }\n    }\n}\n// cortex-publish-metadata:end`;
        transformText(gradle, (content) => {
          const pattern =
            /\/\/ cortex-publish-metadata:start[\s\S]*?\/\/ cortex-publish-metadata:end/;
          return pattern.test(content)
            ? content.replace(pattern, block)
            : `${content.trimEnd()}\n\n${block}\n`;
        });
      }
      break;
    }
    case 'ruby': {
      const gemspec = path.join(target.dir, target.manifest);
      updateText(gemspec, /(s\.version\s*=\s*)["'][^"']+["']/, `$1"${version}"`);
      if (contentChecksum) {
        transformText(gemspec, (content) => {
          const checksumEntry = `"cortex_content_checksum" => "${contentChecksum}"`;
          const checksumPattern = /"cortex_content_checksum"\s*=>\s*"[^"]*"/;
          if (checksumPattern.test(content)) return content.replace(checksumPattern, checksumEntry);
          const metadataPattern = /^(\s*s\.metadata\s*=\s*\{)([^\n}]*)(\}\s*)$/m;
          if (metadataPattern.test(content)) {
            return content.replace(
              metadataPattern,
              (_match, start: string, entries: string, end: string) => {
                const separator = entries.trim() ? ', ' : '';
                return `${start}${entries.trimEnd()}${separator}${checksumEntry} ${end}`;
              },
            );
          }
          const line = `  s.metadata    = { ${checksumEntry} }`;
          return content.replace(/^(\s*s\.version\s*=.*)$/m, `$1\n${line}`);
        });
      }
      for (const entry of fs.readdirSync(path.join(target.dir, 'lib'))) {
        const indexFile = path.join(target.dir, 'lib', entry);
        if (
          fs.statSync(indexFile).isFile() &&
          /VERSION\s*=/.test(fs.readFileSync(indexFile, 'utf8'))
        ) {
          updateText(indexFile, /(VERSION\s*=\s*)["'][^"']+["']/, `$1"${version}"`, false);
        }
      }
      break;
    }
    case 'csharp':
      updateText(
        path.join(target.dir, target.manifest),
        /(<Version>)[^<]+(<\/Version>)/,
        `$1${version}$2`,
      );
      break;
    case 'rust':
      updateText(
        path.join(target.dir, 'Cargo.toml'),
        /^(version\s*=\s*)["'][^"']+["']/m,
        `$1"${version}"`,
      );
      break;
    case 'cpp':
      updateText(
        path.join(target.dir, 'conanfile.py'),
        /^(\s*version\s*=\s*)["'][^"']+["']/m,
        `$1"${version}"`,
      );
      updateText(
        path.join(target.dir, 'CMakeLists.txt'),
        /(project\([^\n]*\sVERSION\s+)[^\s)]+/,
        `$1${version}`,
        false,
      );
      break;
    case 'c':
      updateText(
        path.join(target.dir, 'conanfile.py'),
        /^(\s*version\s*=\s*)["'][^"']+["']/m,
        `$1"${version}"`,
      );
      break;
    case 'go':
    case 'php':
      break;
  }

  const metadataPath = path.join(target.dir, '.cortex-package.json');
  const metadataValues = contentChecksum ? { version, contentChecksum } : { version };
  if (fs.existsSync(metadataPath)) {
    updateJson(metadataPath, metadataValues);
  } else {
    updates.set(
      metadataPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          kind: target.kind,
          language: target.language,
          packageName: target.packageName,
          version,
          ...(contentChecksum ? { contentChecksum } : {}),
        },
        null,
        2,
      )}\n`,
    );
  }

  const snapshots: FileSnapshot[] = Array.from(updates.keys()).map((file) => ({
    file,
    content: fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined,
  }));
  for (const [file, content] of updates) fs.writeFileSync(file, content, 'utf8');

  return () => {
    for (const snapshot of snapshots) {
      if (snapshot.content === undefined) fs.rmSync(snapshot.file, { force: true });
      else fs.writeFileSync(snapshot.file, snapshot.content, 'utf8');
    }
  };
}

export function calculatePackageChecksum(target: PublishTarget): string {
  const restore = updateTargetVersion(target, '0.0.0', CHECKSUM_PLACEHOLDER);
  try {
    return hashPackageDirectory(target.dir);
  } finally {
    restore();
  }
}

function quote(value: string): string {
  return /^[A-Za-z0-9_./:@=+-]+$/.test(value) ? value : JSON.stringify(value);
}

function packageNameFromManifest(dir: string, language: SupportedLanguage): string {
  try {
    if (language === 'typescript') {
      return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).name;
    }
    if (language === 'python') {
      const content = fs.readFileSync(path.join(dir, 'pyproject.toml'), 'utf8');
      return content.match(/^name\s*=\s*["']([^"']+)["']/m)?.[1] ?? path.basename(dir);
    }
    if (language === 'go') {
      return (
        fs.readFileSync(path.join(dir, 'go.mod'), 'utf8').match(/^module\s+(.+)$/m)?.[1] ??
        path.basename(dir)
      );
    }
    if (language === 'java') {
      const content = fs.readFileSync(path.join(dir, 'pom.xml'), 'utf8');
      return content.match(/<artifactId>([^<]+)<\/artifactId>/)?.[1] ?? path.basename(dir);
    }
    if (language === 'ruby') {
      return (
        fs
          .readdirSync(dir)
          .find((file) => file.endsWith('.gemspec'))
          ?.replace(/\.gemspec$/, '') ?? path.basename(dir)
      );
    }
    if (language === 'php') {
      return JSON.parse(fs.readFileSync(path.join(dir, 'composer.json'), 'utf8')).name;
    }
    if (language === 'rust') {
      const content = fs.readFileSync(path.join(dir, 'Cargo.toml'), 'utf8');
      return content.match(/^name\s*=\s*["']([^"']+)["']/m)?.[1] ?? path.basename(dir);
    }
  } catch {
    // Discovery still works with the directory name when a legacy manifest is incomplete.
  }
  return path.basename(dir);
}

function versionFromManifest(dir: string, language: SupportedLanguage): string {
  try {
    const file =
      language === 'typescript'
        ? 'package.json'
        : language === 'python'
          ? 'pyproject.toml'
          : language === 'java'
            ? 'pom.xml'
            : language === 'kotlin'
              ? 'build.gradle.kts'
              : language === 'rust'
                ? 'Cargo.toml'
                : language === 'csharp'
                  ? fs.readdirSync(dir).find((entry) => entry.endsWith('.csproj'))
                  : language === 'ruby'
                    ? fs.readdirSync(dir).find((entry) => entry.endsWith('.gemspec'))
                    : undefined;
    if (!file) return '0.0.0';
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    if (language === 'typescript') return JSON.parse(content).version ?? '0.0.0';
    return (
      content
        .match(
          language === 'java' || language === 'csharp'
            ? /<Version>([^<]+)<\/Version>|<version>([^<]+)<\/version>/
            : /(?:version\s*=|s\.version\s*=)\s*["']([^"']+)["']/,
        )
        ?.slice(1)
        .find(Boolean) ?? '0.0.0'
    );
  } catch {
    return '0.0.0';
  }
}

function identifyLegacyManifest(
  dir: string,
): { manifest: string; language: SupportedLanguage } | null {
  const gemspec = fs.readdirSync(dir).find((file) => file.endsWith('.gemspec'));
  if (gemspec) return { manifest: gemspec, language: 'ruby' };
  const csproj = fs.readdirSync(dir).find((file) => file.endsWith('.csproj'));
  if (csproj) return { manifest: csproj, language: 'csharp' };
  for (const [manifest, language] of MANIFESTS) {
    if (fs.existsSync(path.join(dir, manifest))) return { manifest, language };
  }
  return null;
}

export function discoverPublishTargets(
  baseDir: string,
  config?: CortexConfig,
  selection?: PublishSelection,
  registryOverride?: string,
): PublishTarget[] {
  const targets: PublishTarget[] = [];
  const visited = new Set<string>();

  const visit = (dir: string): void => {
    const metadataPath = path.join(dir, '.cortex-package.json');
    let metadata: CortexPackageMetadata | undefined;
    let legacy: { manifest: string; language: SupportedLanguage } | null = null;

    if (fs.existsSync(metadataPath)) {
      try {
        metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8')) as CortexPackageMetadata;
      } catch {
        throw new Error(`Invalid package metadata: ${metadataPath}`);
      }
    } else {
      legacy = identifyLegacyManifest(dir);
    }

    const language = metadata?.language ?? legacy?.language;
    const kind = metadata?.kind ?? 'sdk';
    const matchesFilter =
      !selection ||
      (selection.kind === kind && (!selection.language || selection.language === language));
    if (language && matchesFilter) {
      const manifest =
        legacy?.manifest ?? identifyLegacyManifest(dir)?.manifest ?? '.cortex-package.json';
      const packageName = metadata?.packageName ?? packageNameFromManifest(dir, language);
      const languageConfig =
        kind === 'sdk'
          ? config?.languages.find(
              (entry) => entry.language === language && entry.package_name === packageName,
            )
          : undefined;
      const inherited =
        kind === 'mcp-server'
          ? { ...config?.publish?.registries?.typescript, ...config?.publish?.mcp }
          : config?.publish?.registries?.[language];
      const registry = {
        ...inherited,
        ...languageConfig?.publish,
        ...(registryOverride ? { url: registryOverride, enabled: true } : {}),
      };
      const githubRepositoryValue =
        kind === 'mcp-server'
          ? (config?.mcp?.github_repository ?? metadata?.githubRepository)
          : (languageConfig?.github_repository ?? metadata?.githubRepository);
      const githubRepository = githubRepositoryValue
        ? normalizeRepositoryUrl(githubRepositoryValue)
        : undefined;
      const github = githubPublishConfig(registry.github);
      const registryEnabled = registry.enabled !== false;
      const duplicateGitDestination =
        registryEnabled &&
        (language === 'go' || language === 'php') &&
        sameGitRepository(registry.url, githubRepository);
      const githubEnabled = Boolean(github) && !duplicateGitDestination;
      if (!config || metadata || languageConfig) {
        targets.push({
          kind,
          language,
          packageName,
          version: metadata?.version ?? versionFromManifest(dir, language),
          dir,
          manifest,
          registry,
          registryEnabled,
          githubEnabled,
          githubRepository,
          github: github ?? {},
        });
        return;
      }
    }

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || SKIPPED_DIRECTORIES.has(entry.name)) continue;
      const child = path.join(dir, entry.name);
      const real = fs.realpathSync(child);
      if (visited.has(real)) continue;
      visited.add(real);
      visit(child);
    }
  };

  visited.add(fs.realpathSync(baseDir));
  visit(baseDir);
  return targets.sort(
    (a, b) =>
      targetType(a).localeCompare(targetType(b)) || a.packageName.localeCompare(b.packageName),
  );
}

@Command({
  name: 'publish',
  description: 'Build and publish generated SDKs and the MCP server',
  arguments: '[dir]',
})
export class PublishCommand extends CommandRunner {
  constructor(
    private readonly logger: LoggerService,
    private readonly project: ProjectService,
  ) {
    super();
  }

  async run(params: string[], options: PublishOptions): Promise<void> {
    this.logger.header('Cortex Publish');

    if (options.sdk && options.mcp) {
      this.logger.error('Use either --sdk or --mcp, not both.');
      process.exitCode = 1;
      return;
    }
    if (options.sdk && !SUPPORTED_SDK_LANGUAGES.includes(options.sdk as SupportedLanguage)) {
      this.logger.error(`Unsupported SDK language "${options.sdk}".`);
      this.logger.info(`Supported SDK languages: ${SUPPORTED_SDK_LANGUAGES.join(', ')}`);
      process.exitCode = 1;
      return;
    }

    const selection: PublishSelection | undefined = options.mcp
      ? { kind: 'mcp-server' }
      : options.sdk
        ? { kind: 'sdk', language: options.sdk as SupportedLanguage }
        : undefined;

    const configPath = options.config ?? (await this.project.findConfig());
    const config = configPath ? await this.project.loadConfig(configPath) : undefined;
    const configDir = configPath ? path.dirname(path.resolve(configPath)) : process.cwd();
    const baseDir = path.resolve(configDir, params[0] ?? config?.output.base_dir ?? './generated');

    if (!fs.existsSync(baseDir)) {
      this.logger.error(`Directory not found: ${baseDir}`);
      this.logger.info('Run `cortex generate` first to create SDKs.');
      process.exitCode = 1;
      return;
    }

    const targets = discoverPublishTargets(baseDir, config, selection, options.registry);
    if (targets.length === 0) {
      this.logger.warn('No publishable SDK or MCP packages found.');
      this.logger.info(`Looked in: ${baseDir}`);
      return;
    }

    const bump = options.bump ?? 'patch';
    const resolvedTargets: PublishTarget[] = [];
    let failures = 0;
    let unchanged = 0;
    this.logger.info('Comparing generated package checksums with published releases...');
    for (const target of targets) {
      try {
        if (!target.registryEnabled && !target.githubEnabled) {
          throw new Error('No publish destination is enabled');
        }
        if (target.githubEnabled && !target.githubRepository) {
          throw new Error(`GitHub publishing requires github_repository for ${target.packageName}`);
        }

        target.contentChecksum = calculatePackageChecksum(target);

        const registryUrl = target.registryEnabled
          ? this.registryUrl(target, target.language !== 'rust')
          : undefined;
        const registryCredentials = target.registryEnabled ? this.credentials(target, false) : {};
        const githubUrl = target.githubEnabled
          ? resolveGitRepositoryUrl(target.githubRepository!)
          : undefined;
        const githubCredentials = target.githubEnabled ? this.githubCredentials(target, false) : {};

        const registryVersion = target.registryEnabled
          ? await getPublishedVersion(target, registryUrl, registryCredentials)
          : undefined;
        const githubVersion = target.githubEnabled
          ? getPublishedGitVersion(target, githubUrl!, githubCredentials)
          : undefined;
        const registryChecksum = registryVersion
          ? await getPublishedChecksum(target, registryUrl, registryCredentials, registryVersion)
          : undefined;
        const githubChecksum = githubVersion
          ? getPublishedGitChecksum(target, githubUrl!, githubCredentials, githubVersion)
          : undefined;

        const states = [
          ...(target.registryEnabled
            ? [{ name: 'package registry', version: registryVersion, checksum: registryChecksum }]
            : []),
          ...(target.githubEnabled
            ? [{ name: 'GitHub', version: githubVersion, checksum: githubChecksum }]
            : []),
        ];
        const previousVersions = states.flatMap((state) => (state.version ? [state.version] : []));
        target.previousVersion = latestSemanticVersion(previousVersions) ?? '0.0.0';
        target.previousChecksum = registryChecksum ?? githubChecksum;

        if (states.every((state) => state.checksum === target.contentChecksum)) {
          unchanged += 1;
          this.logger.info(
            `  ${targetType(target)}: ${target.packageName} ${target.previousVersion} is unchanged`,
          );
          continue;
        }

        const matchingStates = states.filter(
          (state) => state.checksum === target.contentChecksum && state.version,
        );
        const matchingVersion = latestSemanticVersion(
          matchingStates.flatMap((state) => (state.version ? [state.version] : [])),
        );
        const mismatchedStates = states.filter(
          (state) => state.checksum !== target.contentChecksum,
        );
        const hasVersionConflict =
          Boolean(matchingVersion) &&
          mismatchedStates.some(
            (state) => state.version && versionAtLeast(state.version, matchingVersion!),
          );

        if (matchingVersion && !hasVersionConflict) {
          target.version = matchingVersion;
          target.publishRegistry =
            target.registryEnabled && registryChecksum !== target.contentChecksum;
          target.publishGithub = target.githubEnabled && githubChecksum !== target.contentChecksum;
          const destinations = mismatchedStates.map((state) => state.name).join(' and ');
          target.releaseReason = `${destinations} destination is behind`;
        } else {
          target.version = incrementVersion(target.previousVersion, bump);
          target.publishRegistry = target.registryEnabled;
          target.publishGithub = target.githubEnabled;
          target.releaseReason = states.every((state) => !state.version)
            ? 'new package'
            : states.some((state) => state.version && !state.checksum)
              ? 'checksum metadata not found'
              : 'content changed';
        }
        resolvedTargets.push(target);
      } catch (error) {
        failures += 1;
        this.logger.error(`${targetType(target)}: version lookup failed`);
        this.logger.error(error instanceof Error ? error.message : String(error));
      }
    }

    this.logger.info(`Found ${resolvedTargets.length} package publish plan(s):\n`);
    for (const target of resolvedTargets) {
      const destinations = [
        ...(target.publishRegistry ? ['package registry'] : []),
        ...(target.publishGithub ? ['GitHub'] : []),
      ].join(' and ');
      const versionChange =
        target.previousVersion === target.version
          ? target.version
          : `${target.previousVersion} → ${target.version}`;
      this.logger.info(
        `  ${targetType(target)}: ${target.packageName} ${versionChange} (${target.releaseReason}; ${destinations})`,
      );
    }
    this.logger.info('');

    for (const target of resolvedTargets) {
      const published = await this.publishTarget(target, options.dryRun ?? false);
      if (!published) failures += 1;
    }

    this.logger.info('');
    if (failures > 0) {
      this.logger.error(`Publish finished with ${failures} failure(s).`);
      process.exitCode = 1;
    } else if (resolvedTargets.length === 0 && unchanged > 0) {
      this.logger.success('All selected packages are unchanged. Nothing was published.');
    } else if (options.dryRun) {
      this.logger.success('Publish plan complete. No packages were uploaded.');
    } else {
      this.logger.success(
        `Publish complete!${unchanged > 0 ? ` Skipped ${unchanged} unchanged package(s).` : ''}`,
      );
    }
  }

  @Option({ flags: '-c, --config <path>', description: 'Path to cortex.config.yml' })
  parseConfig(value: string): string {
    return value;
  }

  @Option({
    flags: '-d, --dry-run',
    description: 'Preview build and publish commands without executing',
  })
  parseDryRun(): boolean {
    return true;
  }

  @Option({ flags: '-s, --sdk <language>', description: 'Publish one SDK language' })
  parseSdk(value: string): string {
    return value;
  }

  @Option({ flags: '-m, --mcp', description: 'Publish only the generated MCP server' })
  parseMcp(): boolean {
    return true;
  }

  @Option({
    flags: '-b, --bump <level>',
    description: 'Automatic version increase: patch, minor, or major (default: patch)',
  })
  parseBump(value: string): VersionBump {
    if (value !== 'patch' && value !== 'minor' && value !== 'major') {
      throw new Error(`Invalid version increase: ${value}. Use patch, minor, or major.`);
    }
    return value;
  }

  @Option({ flags: '-r, --registry <url>', description: 'Override the configured registry URL' })
  parseRegistry(value: string): string {
    return value;
  }

  private registryUrl(target: PublishTarget, required = false): string | undefined {
    const url = target.registry.url ?? DEFAULT_REGISTRY_URL[target.language];
    if (required && !url) {
      const configPath =
        target.kind === 'mcp-server'
          ? 'publish.mcp.url'
          : `publish.registries.${target.language}.url`;
      throw new Error(`${targetType(target)} requires ${configPath}`);
    }
    return url;
  }

  private credentials(
    target: PublishTarget,
    required = true,
  ): { token?: string; username?: string; tokenEnv?: string; usernameEnv?: string } {
    if (target.registry.auth === false) return {};
    const tokenEnv = target.registry.token_env ?? DEFAULT_TOKEN_ENV[target.language];
    const usernameEnv = target.registry.username_env ?? DEFAULT_USERNAME_ENV[target.language];
    const token = tokenEnv ? process.env[tokenEnv] : undefined;
    const username = usernameEnv ? process.env[usernameEnv] : undefined;
    if (required && !token) {
      throw new Error(
        `Missing publish credential. Set ${tokenEnv ?? 'a token environment variable'} or configure auth: false.`,
      );
    }
    return { token, username, tokenEnv, usernameEnv };
  }

  private githubCredentials(
    target: PublishTarget,
    required = true,
  ): { token?: string; username?: string; tokenEnv?: string; usernameEnv?: string } {
    if (target.github.auth === false) return {};
    const tokenEnv = target.github.token_env ?? 'GITHUB_TOKEN';
    const usernameEnv = target.github.username_env ?? 'GITHUB_USERNAME';
    const token = process.env[tokenEnv];
    const username = process.env[usernameEnv];
    if (required && !token) {
      throw new Error(
        `Missing GitHub publish credential. Set ${tokenEnv} or configure github.auth: false.`,
      );
    }
    return { token, username, tokenEnv, usernameEnv };
  }

  private runCommand(command: string, args: string[], cwd: string, options: RunOptions = {}): void {
    const displayArgs = options.displayArgs ?? args;
    this.logger.info(`  $ ${[command, ...displayArgs].map(quote).join(' ')}`);
    const result = spawnSync(command, args, {
      cwd,
      env: { ...process.env, ...options.env },
      stdio: 'inherit',
      shell: false,
    });
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(`${command} exited with status ${result.status ?? 'unknown'}`);
  }

  private showCommand(command: string, args: string[]): void {
    this.logger.info(`  [dry-run] $ ${[command, ...args].map(quote).join(' ')}`);
  }

  private async publishTarget(target: PublishTarget, dryRun: boolean): Promise<boolean> {
    const type = targetType(target);
    this.logger.info(`${dryRun ? 'Planning' : 'Publishing'} ${type} (${target.packageName})...`);
    let restoreVersion: (() => void) | undefined;
    try {
      if (dryRun) {
        this.logger.info(`  version: ${target.previousVersion} → ${target.version}`);
        this.showPlan(target);
      } else {
        restoreVersion = updateTargetVersion(target, target.version, target.contentChecksum);
        if (target.publishRegistry) this.publish(target);
        if (target.publishGithub) {
          if (!target.publishRegistry) this.validateGithubPackage(target);
          this.publishGithub(target);
        }
      }
      this.logger.success(`${type}: ${dryRun ? 'ready' : 'published'}`);
      return true;
    } catch (error) {
      restoreVersion?.();
      this.logger.error(`${type}: publish failed`);
      this.logger.error(error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  private showPlan(target: PublishTarget): void {
    if (target.publishRegistry) this.showRegistryPlan(target);
    if (target.publishGithub) {
      const tokenEnv =
        target.github.auth === false ? undefined : (target.github.token_env ?? 'GITHUB_TOKEN');
      if (tokenEnv) this.logger.info(`  GitHub credential: ${tokenEnv}`);
      if (!target.publishRegistry) this.showGithubValidationPlan(target);
      const repository = resolveGitRepositoryUrl(target.githubRepository!);
      const branch = target.github.branch ?? 'main';
      this.logger.info(`  [dry-run] publish v${target.version} to ${repository} on ${branch}`);
    }
  }

  private showRegistryPlan(target: PublishTarget): void {
    const url = target.registry.url ?? DEFAULT_REGISTRY_URL[target.language] ?? '<configured-url>';
    const tokenEnv =
      target.registry.auth === false
        ? undefined
        : (target.registry.token_env ?? DEFAULT_TOKEN_ENV[target.language]);
    if (tokenEnv) this.logger.info(`  credential: ${tokenEnv}`);
    switch (target.language) {
      case 'typescript':
        this.showCommand('npm', ['install', '--ignore-scripts']);
        this.showCommand('npm', ['run', 'build', '--if-present']);
        this.showCommand('npm', ['pack', '--dry-run']);
        this.showCommand('npm', [
          'publish',
          '--access',
          target.registry.access ?? 'public',
          '--registry',
          url,
        ]);
        break;
      case 'python':
        this.showCommand('python', ['-m', 'build']);
        this.showCommand('python', ['-m', 'twine', 'upload', '--repository-url', url, 'dist/*']);
        break;
      case 'go':
        this.showCommand('go', ['test', './...']);
        this.logger.info(`  [dry-run] publish v${target.version} to ${url} using git`);
        break;
      case 'java':
        this.showCommand('mvn', ['--batch-mode', 'package', '-DskipTests']);
        this.showCommand('mvn', [
          '--batch-mode',
          'deploy',
          `-DaltDeploymentRepository=cortex::default::${url}`,
          '-DskipTests',
        ]);
        break;
      case 'kotlin':
        this.showCommand('gradle', ['build', '--no-daemon']);
        this.showCommand('gradle', ['publish', '--no-daemon', `-PcortexPublishUrl=${url}`]);
        break;
      case 'ruby':
        this.showCommand('gem', ['build', target.manifest]);
        this.showCommand('gem', [
          'push',
          `${target.packageName}-${target.version}.gem`,
          '--host',
          url,
        ]);
        break;
      case 'php':
        this.showCommand('composer', ['validate', '--strict']);
        this.logger.info(`  [dry-run] publish v${target.version} to ${url} using git`);
        break;
      case 'csharp':
        this.showCommand('dotnet', ['pack', '-c', 'Release', '-o', '.cortex-publish']);
        this.showCommand('dotnet', [
          'nuget',
          'push',
          '.cortex-publish/*.nupkg',
          '--source',
          url,
          '--api-key',
          '<redacted>',
        ]);
        break;
      case 'rust':
        this.showCommand('cargo', ['publish', '--dry-run']);
        this.showCommand('cargo', ['publish', ...(target.registry.url ? ['--index', url] : [])]);
        break;
      case 'cpp':
      case 'c': {
        const name = target.registry.name ?? 'cortex';
        const packageRef = `${target.packageName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()}-${target.language}/${target.version}`;
        this.showCommand('conan', ['create', '.', '--build=missing']);
        this.showCommand('conan', ['upload', packageRef, '--remote', name, '--confirm']);
        break;
      }
    }
  }

  private showGithubValidationPlan(target: PublishTarget): void {
    switch (target.language) {
      case 'typescript':
        this.showCommand('npm', ['install', '--ignore-scripts']);
        this.showCommand('npm', ['run', 'build', '--if-present']);
        this.showCommand('npm', ['pack', '--dry-run']);
        break;
      case 'python':
        this.showCommand('python', ['-m', 'build']);
        break;
      case 'go':
        this.showCommand('go', ['test', './...']);
        break;
      case 'java':
        this.showCommand('mvn', ['--batch-mode', 'package', '-DskipTests']);
        break;
      case 'kotlin':
        this.showCommand('gradle', ['build', '--no-daemon']);
        break;
      case 'ruby':
        this.showCommand('gem', ['build', target.manifest]);
        break;
      case 'php':
        this.showCommand('composer', ['validate', '--strict']);
        break;
      case 'csharp':
        this.showCommand('dotnet', ['pack', '-c', 'Release', '-o', '.cortex-publish']);
        break;
      case 'rust':
        this.showCommand('cargo', ['publish', '--dry-run', '--allow-dirty']);
        break;
      case 'cpp':
      case 'c':
        this.showCommand('conan', ['create', '.', '--build=missing']);
        break;
    }
  }

  private publish(target: PublishTarget): void {
    switch (target.language) {
      case 'typescript':
        return this.publishNpm(target);
      case 'python':
        return this.publishPython(target);
      case 'go':
        return this.publishVcs(target, true);
      case 'java':
        return this.publishMaven(target);
      case 'kotlin':
        return this.publishGradle(target);
      case 'ruby':
        return this.publishRuby(target);
      case 'php':
        return this.publishVcs(target, false);
      case 'csharp':
        return this.publishNuget(target);
      case 'rust':
        return this.publishCargo(target);
      case 'cpp':
      case 'c':
        return this.publishConan(target);
    }
  }

  private validateGithubPackage(target: PublishTarget): void {
    switch (target.language) {
      case 'typescript':
        this.runCommand('npm', ['install', '--ignore-scripts'], target.dir);
        this.runCommand('npm', ['run', 'build', '--if-present'], target.dir);
        this.runCommand('npm', ['pack', '--dry-run'], target.dir);
        return;
      case 'python':
        fs.rmSync(path.join(target.dir, 'dist'), { recursive: true, force: true });
        this.runCommand('python', ['-m', 'build'], target.dir);
        return;
      case 'go':
        this.runCommand('go', ['test', './...'], target.dir);
        return;
      case 'java':
        this.runCommand('mvn', ['--batch-mode', 'package', '-DskipTests'], target.dir);
        return;
      case 'kotlin':
        this.runCommand('gradle', ['build', '--no-daemon'], target.dir);
        return;
      case 'ruby':
        for (const file of fs.readdirSync(target.dir).filter((entry) => entry.endsWith('.gem'))) {
          fs.rmSync(path.join(target.dir, file), { force: true });
        }
        this.runCommand('gem', ['build', target.manifest], target.dir);
        return;
      case 'php':
        this.runCommand('composer', ['validate', '--strict'], target.dir);
        return;
      case 'csharp': {
        const output = path.join(target.dir, '.cortex-publish');
        fs.rmSync(output, { recursive: true, force: true });
        this.runCommand('dotnet', ['pack', '-c', 'Release', '-o', output], target.dir);
        return;
      }
      case 'rust':
        this.runCommand('cargo', ['publish', '--dry-run', '--allow-dirty'], target.dir);
        return;
      case 'cpp':
      case 'c': {
        const conanHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-github-conan-'));
        try {
          const env = { CONAN_HOME: conanHome };
          this.runCommand('conan', ['profile', 'detect', '--force'], target.dir, { env });
          this.runCommand('conan', ['create', '.', '--build=missing'], target.dir, { env });
        } finally {
          fs.rmSync(conanHome, { recursive: true, force: true });
        }
      }
    }
  }

  private publishNpm(target: PublishTarget): void {
    const url = this.registryUrl(target, true)!;
    const credentials = this.credentials(target);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-npm-'));
    try {
      const npmrc = path.join(tempDir, '.npmrc');
      const registryAuthKey = new URL(url).host + new URL(url).pathname.replace(/\/$/, '');
      fs.writeFileSync(
        npmrc,
        `registry=${url}\n//${registryAuthKey}/:_authToken=\${NODE_AUTH_TOKEN}\nalways-auth=true\n`,
        { mode: 0o600 },
      );
      const env = { npm_config_userconfig: npmrc, NODE_AUTH_TOKEN: credentials.token };
      this.runCommand('npm', ['install', '--ignore-scripts'], target.dir, { env });
      this.runCommand('npm', ['run', 'build', '--if-present'], target.dir, { env });
      this.runCommand('npm', ['pack', '--dry-run'], target.dir, { env });
      this.runCommand(
        'npm',
        ['publish', '--access', target.registry.access ?? 'public', '--registry', url],
        target.dir,
        { env },
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  private publishPython(target: PublishTarget): void {
    const url = this.registryUrl(target, true)!;
    const credentials = this.credentials(target);
    const env = {
      TWINE_USERNAME: credentials.username ?? '__token__',
      TWINE_PASSWORD: credentials.token ?? 'local',
      TWINE_NON_INTERACTIVE: '1',
    };
    fs.rmSync(path.join(target.dir, 'dist'), { recursive: true, force: true });
    this.runCommand('python', ['-m', 'build'], target.dir, { env });
    const artifacts = fs
      .readdirSync(path.join(target.dir, 'dist'))
      .filter((file) => file.endsWith('.whl') || file.endsWith('.tar.gz'))
      .map((file) => path.join('dist', file));
    if (artifacts.length === 0) throw new Error('Python build produced no wheel or source archive');
    this.runCommand(
      'python',
      ['-m', 'twine', 'upload', '--non-interactive', '--repository-url', url, ...artifacts],
      target.dir,
      { env },
    );
  }

  private publishMaven(target: PublishTarget): void {
    const url = this.registryUrl(target, true)!;
    const credentials = this.credentials(target);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-maven-'));
    try {
      const settings = path.join(tempDir, 'settings.xml');
      const username = credentials.username ?? 'token';
      fs.writeFileSync(
        settings,
        `<?xml version="1.0" encoding="UTF-8"?>
<settings xmlns="http://maven.apache.org/SETTINGS/1.2.0">
  <servers><server><id>cortex</id><username>${this.escapeXml(username)}</username><password>${this.escapeXml(credentials.token ?? '')}</password></server></servers>
</settings>\n`,
        { mode: 0o600 },
      );
      this.runCommand(
        'mvn',
        ['--batch-mode', '--settings', settings, 'package', '-DskipTests'],
        target.dir,
      );
      this.runCommand(
        'mvn',
        [
          '--batch-mode',
          '--settings',
          settings,
          'deploy',
          `-DaltDeploymentRepository=cortex::default::${url}`,
          '-DskipTests',
        ],
        target.dir,
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  private publishGradle(target: PublishTarget): void {
    const url = this.registryUrl(target, true)!;
    const credentials = this.credentials(target);
    this.runCommand('gradle', ['build', '--no-daemon'], target.dir);
    const args = ['publish', '--no-daemon', `-PcortexPublishUrl=${url}`];
    const displayArgs = [...args];
    if (credentials.username) {
      args.push(`-PcortexPublishUsername=${credentials.username}`);
      displayArgs.push('-PcortexPublishUsername=<redacted>');
    }
    if (credentials.token) {
      args.push(`-PcortexPublishToken=${credentials.token}`);
      displayArgs.push('-PcortexPublishToken=<redacted>');
    }
    this.runCommand('gradle', args, target.dir, { displayArgs });
  }

  private publishRuby(target: PublishTarget): void {
    const url = this.registryUrl(target, true)!;
    const credentials = this.credentials(target);
    for (const file of fs.readdirSync(target.dir).filter((entry) => entry.endsWith('.gem'))) {
      fs.rmSync(path.join(target.dir, file), { force: true });
    }
    this.runCommand('gem', ['build', target.manifest], target.dir, {
      env: { GEM_HOST_API_KEY: credentials.token },
    });
    const artifact = fs.readdirSync(target.dir).find((file) => file.endsWith('.gem'));
    if (!artifact) throw new Error('gem build produced no .gem file');
    this.runCommand('gem', ['push', artifact, '--host', url], target.dir, {
      env: { GEM_HOST_API_KEY: credentials.token },
    });
  }

  private publishNuget(target: PublishTarget): void {
    const url = this.registryUrl(target, true)!;
    const credentials = this.credentials(target);
    const output = path.join(target.dir, '.cortex-publish');
    fs.rmSync(output, { recursive: true, force: true });
    this.runCommand('dotnet', ['pack', '-c', 'Release', '-o', output], target.dir);
    const artifacts = fs
      .readdirSync(output)
      .filter((file) => file.endsWith('.nupkg') && !file.endsWith('.symbols.nupkg'));
    if (artifacts.length === 0) throw new Error('dotnet pack produced no .nupkg file');
    for (const artifact of artifacts) {
      const args = [
        'nuget',
        'push',
        path.join(output, artifact),
        '--source',
        url,
        '--api-key',
        credentials.token ?? 'local',
      ];
      this.runCommand('dotnet', args, target.dir, {
        displayArgs: [...args.slice(0, -1), '<redacted>'],
      });
    }
  }

  private publishCargo(target: PublishTarget): void {
    const credentials = this.credentials(target);
    this.runCommand('cargo', ['publish', '--dry-run', '--allow-dirty'], target.dir);
    const args = ['publish', '--allow-dirty'];
    if (target.registry.url) args.push('--index', target.registry.url);
    if (credentials.token) args.push('--token', credentials.token);
    const displayArgs = credentials.token ? [...args.slice(0, -1), '<redacted>'] : args;
    this.runCommand('cargo', args, target.dir, { displayArgs });
  }

  private publishConan(target: PublishTarget): void {
    const url = this.registryUrl(target, true)!;
    const credentials = this.credentials(target);
    const registryName = target.registry.name ?? 'cortex';
    const conanHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-conan-'));
    const env = { CONAN_HOME: conanHome };
    try {
      this.runCommand('conan', ['profile', 'detect', '--force'], target.dir, { env });
      this.runCommand('conan', ['remote', 'add', registryName, url, '--force'], target.dir, {
        env,
      });
      if (credentials.token) {
        const args = [
          'remote',
          'login',
          registryName,
          credentials.username ?? 'token',
          '--password',
          credentials.token,
        ];
        this.runCommand('conan', args, target.dir, {
          env,
          displayArgs: [...args.slice(0, -1), '<redacted>'],
        });
      }
      this.runCommand('conan', ['create', '.', '--build=missing'], target.dir, { env });
      const packageRef = `${target.packageName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()}-${target.language}/${target.version}`;
      this.runCommand(
        'conan',
        ['upload', packageRef, '--remote', registryName, '--confirm'],
        target.dir,
        { env },
      );
    } finally {
      fs.rmSync(conanHome, { recursive: true, force: true });
    }
  }

  private publishVcs(target: PublishTarget, runGoTests: boolean): void {
    const repository = this.registryUrl(target, true)!;
    const credentials = this.credentials(target);
    if (runGoTests) this.runCommand('go', ['test', './...'], target.dir);
    else this.runCommand('composer', ['validate', '--strict'], target.dir);

    this.publishGitRepository(target, repository, credentials, 'main');
  }

  private publishGithub(target: PublishTarget): void {
    const repository = resolveGitRepositoryUrl(target.githubRepository!);
    const credentials = this.githubCredentials(target);
    this.publishGitRepository(target, repository, credentials, target.github.branch ?? 'main');
  }

  private publishGitRepository(
    target: PublishTarget,
    repository: string,
    credentials: GitCredentials,
    branch: string,
  ): void {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-vcs-'));
    const checkout = path.join(tempDir, 'checkout');
    const askPass = path.join(tempDir, 'askpass.sh');
    const env: NodeJS.ProcessEnv = { GIT_TERMINAL_PROMPT: '0' };
    try {
      if (credentials.token) {
        fs.writeFileSync(
          askPass,
          '#!/bin/sh\ncase "$1" in *Username*) printf "%s" "$CORTEX_GIT_USERNAME" ;; *) printf "%s" "$CORTEX_GIT_TOKEN" ;; esac\n',
          { mode: 0o700 },
        );
        env.GIT_ASKPASS = askPass;
        env.CORTEX_GIT_USERNAME = credentials.username ?? 'token';
        env.CORTEX_GIT_TOKEN = credentials.token;
      }
      this.runCommand('git', ['clone', repository, checkout], tempDir, { env });
      const remoteBranch = spawnSync('git', ['rev-parse', '--verify', `origin/${branch}`], {
        cwd: checkout,
        env: { ...process.env, ...env },
        stdio: 'ignore',
      });
      this.runCommand(
        'git',
        remoteBranch.status === 0
          ? ['checkout', '-B', branch, `origin/${branch}`]
          : ['checkout', '-B', branch],
        checkout,
        { env },
      );
      for (const entry of fs.readdirSync(checkout)) {
        if (entry === '.git' || entry === '.github') continue;
        fs.rmSync(path.join(checkout, entry), { recursive: true, force: true });
      }
      for (const entry of fs.readdirSync(target.dir)) {
        if (
          SKIPPED_DIRECTORIES.has(entry) ||
          SKIPPED_REPOSITORY_FILES.has(entry) ||
          entry === '.cortex-publish' ||
          entry.endsWith('.gem') ||
          entry.endsWith('.pyc')
        )
          continue;
        fs.cpSync(path.join(target.dir, entry), path.join(checkout, entry), {
          recursive: true,
          filter: (source) => {
            const name = path.basename(source);
            return (
              !SKIPPED_DIRECTORIES.has(name) &&
              !SKIPPED_REPOSITORY_FILES.has(name) &&
              !name.endsWith('.gem') &&
              !name.endsWith('.pyc')
            );
          },
        });
      }
      this.runCommand('git', ['config', 'user.name', 'Cortex Publisher'], checkout, { env });
      this.runCommand('git', ['config', 'user.email', 'cortex-publisher@localhost'], checkout, {
        env,
      });
      this.runCommand('git', ['add', '--all'], checkout, { env });
      const status = spawnSync('git', ['status', '--porcelain'], {
        cwd: checkout,
        env: { ...process.env, ...env },
        encoding: 'utf8',
      });
      if (status.status !== 0) throw new Error('Unable to inspect the VCS publish checkout');
      if (status.stdout.trim())
        this.runCommand('git', ['commit', '-m', `Release v${target.version}`], checkout, { env });
      this.runCommand('git', ['tag', `v${target.version}`], checkout, { env });
      this.runCommand('git', ['push', 'origin', `HEAD:refs/heads/${branch}`], checkout, { env });
      this.runCommand('git', ['push', 'origin', `refs/tags/v${target.version}`], checkout, { env });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
