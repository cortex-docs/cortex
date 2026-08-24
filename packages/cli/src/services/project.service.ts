import { Injectable } from '@nestjs/common';
import { ConfigLoader, OpenAPIParser } from '@cortex-docs/core';
import type { CortexConfig, ParsedSpec } from '@cortex-docs/core';

@Injectable()
export class ProjectService {
  private configLoader = new ConfigLoader();
  private parser = new OpenAPIParser();

  async loadConfig(configPath?: string): Promise<CortexConfig> {
    return this.configLoader.load(configPath);
  }

  async findConfig(): Promise<string | null> {
    return this.configLoader.findConfigFile();
  }

  async parseSpec(specPath: string): Promise<ParsedSpec> {
    return this.parser.parse(specPath);
  }

  async validateSpec(specPath: string) {
    return this.parser.validate(specPath);
  }

  validateConfig(raw: unknown): CortexConfig {
    return this.configLoader.validate(raw);
  }
}
