import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { cortexConfigSchema } from './schema';
import type { CortexConfig } from './types';
import { computeEffectiveLanguages } from './utils';

const CONFIG_FILENAMES = ['cortex.config.yml', 'cortex.config.yaml', 'cortex.yml'];

export class ConfigLoader {
  async load(configPath?: string): Promise<CortexConfig> {
    const resolvedPath = configPath ?? (await this.findConfigFile());

    if (!resolvedPath) {
      throw new Error(
        'No cortex config file found. Run `cortex init` to create one, or specify --config.',
      );
    }

    const content = fs.readFileSync(resolvedPath, 'utf-8');
    const raw = yaml.load(content);

    return this.validate(raw);
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
}
