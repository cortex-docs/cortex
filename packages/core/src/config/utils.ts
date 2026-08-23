import * as path from 'node:path';
import type {
  CortexConfig,
  SourceConfig,
  SourceLanguageConfig,
  SourceType,
  LanguageConfig,
} from './types';

export function getSourcesByType(config: CortexConfig, type: SourceType): SourceConfig[] {
  return config.sources.filter((s) => s.type === type);
}

export function getFirstSourceByType(
  config: CortexConfig,
  type: SourceType,
): SourceConfig | undefined {
  return config.sources.find((s) => s.type === type);
}

export function getFirstSpecPath(config: CortexConfig, type: SourceType): string | undefined {
  return config.sources.find((s) => s.type === type)?.spec;
}

export function isRemoteLocation(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function resolveConfigPath(value: string, configPath: string): string {
  if (isRemoteLocation(value) || path.isAbsolute(value)) return value;
  return path.resolve(path.dirname(path.resolve(configPath)), value);
}

export function hasSourceType(config: CortexConfig, type: SourceType): boolean {
  return config.sources.some((s) => s.type === type);
}

export function sanitizePackageName(name: string): string {
  return name.replace(/^@/, '').replace(/\//g, '-');
}

export function resolveGeneratorTemplateRoot(
  config: CortexConfig,
  configPath?: string,
): string | undefined {
  const configuredRoot = config.generators?.templates;
  if (!configuredRoot) return undefined;
  if (path.isAbsolute(configuredRoot)) return path.normalize(configuredRoot);

  const configDir = configPath ? path.dirname(path.resolve(configPath)) : process.cwd();
  return path.resolve(configDir, configuredRoot);
}

export function resolveLanguageTemplateDir(
  languageConfig: Pick<SourceLanguageConfig, 'template'>,
  configPath?: string,
): string | undefined {
  const configuredDir = languageConfig.template;
  if (!configuredDir) return undefined;
  if (path.isAbsolute(configuredDir)) return path.normalize(configuredDir);

  const configDir = configPath ? path.dirname(path.resolve(configPath)) : process.cwd();
  return path.resolve(configDir, configuredDir);
}

export function getSourceLanguageTemplateDir(
  config: CortexConfig,
  sourceType: SourceType,
  language: string,
  packageName: string,
  configPath?: string,
): string | undefined {
  const source = getFirstSourceByType(config, sourceType);
  const languageConfig = source?.languages.find(
    (candidate) => candidate.language === language && candidate.package_name === packageName,
  );
  return languageConfig ? resolveLanguageTemplateDir(languageConfig, configPath) : undefined;
}

export function getAllLanguageTemplateDirs(config: CortexConfig, configPath?: string): string[] {
  const directories = new Set<string>();
  for (const source of config.sources) {
    for (const languageConfig of source.languages) {
      const directory = resolveLanguageTemplateDir(languageConfig, configPath);
      if (directory) directories.add(directory);
    }
  }
  return Array.from(directories);
}

export function normalizeRepositoryUrl(repository: string): string {
  const value = repository.trim();
  const sshMatch = value.match(/^git@github\.com:([^/]+\/.+?)(?:\.git)?$/i);
  if (sshMatch) return `https://github.com/${sshMatch[1].replace(/\.git$/i, '')}`;
  if (/^github\.com\//i.test(value)) return `https://${value.replace(/\.git$/i, '')}`;
  if (/^https?:\/\/github\.com\//i.test(value)) return value.replace(/\.git$/i, '');
  return value;
}

export function gitRepositoryUrl(repository: string): string {
  const normalized = normalizeRepositoryUrl(repository);
  return /^https?:\/\/github\.com\//i.test(normalized) && !normalized.endsWith('.git')
    ? `${normalized}.git`
    : normalized;
}

export function computeEffectiveLanguages(config: CortexConfig): LanguageConfig[] {
  const seen = new Map<string, LanguageConfig>();
  for (const source of config.sources) {
    for (const lang of source.languages) {
      const key = `${lang.language}:${lang.package_name}`;
      if (!seen.has(key)) {
        seen.set(key, {
          language: lang.language,
          package_name: lang.package_name,
          output_dir: `${config.output.base_dir}/${lang.language}/${sanitizePackageName(lang.package_name)}`,
          template: lang.template,
          github_repository: lang.github_repository,
          publish: lang.publish ?? config.publish?.registries?.[lang.language],
        });
      }
    }
  }
  return Array.from(seen.values());
}

export function sourceHasLanguage(
  source: SourceConfig,
  language: string,
  packageName: string,
): boolean {
  return source.languages.some((l) => l.language === language && l.package_name === packageName);
}
