import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { CortexConfig } from '@cortex-docs/core';
import { findLanguageTemplateDir } from '@cortex-docs/codegen';
import {
  exportGeneratorTemplates,
  resolveGeneratorExportRoot,
} from '../src/commands/generators/export.command';

const tempDirectories: string[] = [];

function tempDir(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-generator-export-'));
  tempDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('exportGeneratorTemplates', () => {
  it('exports all installed templates for one language', () => {
    const templateRoot = tempDir();
    const result = exportGeneratorTemplates({
      templateRoot,
      languages: ['typescript'],
    });

    expect(result.created).toContain('languages/typescript/rest/client.ejs');
    expect(result.created).toContain('languages/typescript/graphql/snippet.ejs');
    expect(result.created).toContain('languages/typescript/package-json.ejs');
    expect(fs.existsSync(path.join(templateRoot, 'languages/typescript/readme.ejs'))).toBe(true);
    expect(fs.existsSync(path.join(templateRoot, 'mcp/server.ejs'))).toBe(false);
  });

  it('exports one protocol without unrelated templates', () => {
    const templateRoot = tempDir();
    const result = exportGeneratorTemplates({
      templateRoot,
      languages: ['python'],
      protocol: 'rest',
    });

    expect(result.created).toContain('languages/python/rest/client.ejs');
    expect(fs.existsSync(path.join(templateRoot, 'languages/python/graphql'))).toBe(false);
    expect(fs.existsSync(path.join(templateRoot, 'languages/python/readme.ejs'))).toBe(false);
  });

  it('exports a language directly into a source template directory', () => {
    const templateRoot = tempDir();
    const result = exportGeneratorTemplates({
      templateRoot,
      languages: ['typescript'],
      directLanguageRoot: true,
    });

    expect(result.created).toContain('rest/client.ejs');
    expect(fs.existsSync(path.join(templateRoot, 'rest/client.ejs'))).toBe(true);
    expect(fs.existsSync(path.join(templateRoot, 'languages/typescript'))).toBe(false);
  });

  it('exports MCP templates', () => {
    const templateRoot = tempDir();
    const result = exportGeneratorTemplates({ templateRoot, includeMcp: true });

    expect(result.created).toContain('mcp/server.ejs');
    expect(result.created).toContain('mcp/package-json.ejs');
    expect(fs.existsSync(path.join(templateRoot, 'mcp/handlers.ejs'))).toBe(true);
    expect(fs.existsSync(path.join(templateRoot, 'mcp/templates'))).toBe(false);
  });

  it('keeps existing templates unless force is true', () => {
    const templateRoot = tempDir();
    const destination = path.join(templateRoot, 'languages/typescript/rest/client.ejs');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, 'custom content\n', 'utf-8');

    const skipped = exportGeneratorTemplates({ templateRoot, languages: ['typescript'] });
    expect(skipped.skipped).toContain('languages/typescript/rest/client.ejs');
    expect(fs.readFileSync(destination, 'utf-8')).toBe('custom content\n');

    const replaced = exportGeneratorTemplates({
      templateRoot,
      languages: ['typescript'],
      force: true,
    });
    expect(replaced.overwritten).toContain('languages/typescript/rest/client.ejs');
    expect(fs.readFileSync(destination, 'utf-8')).toBe(
      fs.readFileSync(path.join(findLanguageTemplateDir('typescript'), 'rest/client.ejs'), 'utf-8'),
    );
  });

  it('rejects unsupported and ambiguous selections', () => {
    const templateRoot = tempDir();
    expect(() => exportGeneratorTemplates({ templateRoot })).toThrow(
      'Select a language, MCP templates, or all templates.',
    );
    expect(() => exportGeneratorTemplates({ templateRoot, languages: ['brainfuck'] })).toThrow(
      'Unsupported language "brainfuck"',
    );
    expect(() =>
      exportGeneratorTemplates({
        templateRoot,
        languages: ['typescript'],
        includeMcp: true,
        protocol: 'rest',
      }),
    ).toThrow('Use --protocol with one language export only.');
  });
});

describe('resolveGeneratorExportRoot', () => {
  const config = {
    project: 'test',
    sources: [],
    output: { base_dir: './generated' },
    generators: { templates: './cortex-templates' },
    languages: [],
  } as CortexConfig;

  it('resolves the configured root from the configuration directory', () => {
    expect(
      resolveGeneratorExportRoot(undefined, config, '/workspace/project/cortex.config.yml'),
    ).toBe(path.resolve('/workspace/project/cortex-templates'));
  });

  it('uses an explicit output directory before the configured root', () => {
    expect(resolveGeneratorExportRoot('./explicit', config)).toBe(path.resolve('./explicit'));
  });
});
