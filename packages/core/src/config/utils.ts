import type { CortexConfig, SourceConfig, SourceType, LanguageConfig } from './types';

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

export function hasSourceType(config: CortexConfig, type: SourceType): boolean {
  return config.sources.some((s) => s.type === type);
}

export function sanitizePackageName(name: string): string {
  return name.replace(/^@/, '').replace(/\//g, '-');
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
          github_repository: lang.github_repository,
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
  return source.languages.some(
    (l) => l.language === language && l.package_name === packageName,
  );
}
