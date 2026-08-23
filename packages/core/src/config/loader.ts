import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { cortexConfigSchema } from './schema';
import type { CortexConfig } from './types';
import { computeEffectiveLanguages } from './utils';
import { resolveConfigPath } from './utils';

const CONFIG_FILENAMES = ['cortex.config.yml', 'cortex.config.yaml', 'cortex.yml'];

export class ConfigLoader {
  async load(configPath?: string): Promise<CortexConfig> {
    const resolvedPath = configPath ?? (await this.findConfigFile());

    if (!resolvedPath) {
      throw new Error(
        'No cortex config file found. Run `cortex init` to create one, or specify --config.',
      );
    }

    const absoluteConfigPath = path.resolve(resolvedPath);
    const content = fs.readFileSync(absoluteConfigPath, 'utf-8');
    const raw = yaml.load(content);

    return this.resolvePaths(this.validate(raw), absoluteConfigPath);
  }

  async findConfigFile(startDir?: string): Promise<string | null> {
    let dir = startDir ?? process.cwd();

    for (let i = 0; i < 10; i++) {
      for (const filename of CONFIG_FILENAMES) {
        const candidate = path.join(dir, filename);
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }

      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }

    return null;
  }

  validate(raw: unknown): CortexConfig {
    const result = cortexConfigSchema.safeParse(raw);

    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(`Invalid cortex config:\n${issues}`);
    }

    const data = result.data;
    const languages = computeEffectiveLanguages(data as CortexConfig);

    return { ...data, languages } as CortexConfig;
  }

  private resolvePaths(config: CortexConfig, configPath: string): CortexConfig {
    const sources = config.sources.map((source) => ({
      ...source,
      spec: resolveConfigPath(source.spec, configPath),
      intro: source.intro ? resolveConfigPath(source.intro, configPath) : undefined,
      languages: source.languages.map((language) => ({
        ...language,
        template: language.template ? resolveConfigPath(language.template, configPath) : undefined,
      })),
    }));

    const docs = config.docs?.map((section) => ({
      ...section,
      sources: section.sources.map((document) => ({
        ...document,
        document: resolveConfigPath(document.document, configPath),
      })),
    }));

    const home = config.home
      ? {
          ...config.home,
          sections: config.home.sections?.map((section) => ({
            ...section,
            icon: section.icon ? resolveConfigPath(section.icon, configPath) : undefined,
            background: section.background
              ? resolveConfigPath(section.background, configPath)
              : undefined,
          })),
        }
      : undefined;

    const resolved = {
      ...config,
      logo: config.logo ? resolveConfigPath(config.logo, configPath) : undefined,
      logo_dark: config.logo_dark ? resolveConfigPath(config.logo_dark, configPath) : undefined,
      logo_light: config.logo_light ? resolveConfigPath(config.logo_light, configPath) : undefined,
      favicon: config.favicon ? resolveConfigPath(config.favicon, configPath) : undefined,
      generators: config.generators
        ? { templates: resolveConfigPath(config.generators.templates, configPath) }
        : undefined,
      output: {
        base_dir: resolveConfigPath(config.output.base_dir, configPath),
      },
      sources,
      docs,
      home,
    } as CortexConfig;

    return { ...resolved, languages: computeEffectiveLanguages(resolved) };
  }
}
