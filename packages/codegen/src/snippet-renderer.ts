import * as path from 'node:path';
import * as fs from 'node:fs';
import { Eta } from 'eta';
import {
  singularize,
  toPascalCase,
  toCamelCase,
  toSnakeCase,
  toKebabCase,
  toUpperSnakeCase,
} from '@cortex/core';
import { getLanguageNaming } from './naming';

const LANGUAGE_TEMPLATE_DIRS: Record<string, string> = {};

function getTemplateDir(language: string): string {
  if (LANGUAGE_TEMPLATE_DIRS[language]) return LANGUAGE_TEMPLATE_DIRS[language];

  // Try __dirname first (works in plain Node.js)
  const fromDirname = path.resolve(__dirname, 'languages', language, 'templates');
  if (fs.existsSync(fromDirname)) {
    LANGUAGE_TEMPLATE_DIRS[language] = fromDirname;
    return fromDirname;
  }

  // Fallback: walk up from cwd to find the codegen package (works in bundled contexts)
  const candidates = [
    path.resolve(process.cwd(), 'node_modules/@cortex/codegen/dist/languages', language, 'templates'),
    path.resolve(process.cwd(), '../codegen/dist/languages', language, 'templates'),
    path.resolve(process.cwd(), '../codegen/src/languages', language, 'templates'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      LANGUAGE_TEMPLATE_DIRS[language] = candidate;
      return candidate;
    }
  }

  LANGUAGE_TEMPLATE_DIRS[language] = fromDirname;
  return fromDirname;
}

function createEta(templateDir: string): Eta {
  return new Eta({ autoEscape: false, autoTrim: false, views: templateDir, defaultExtension: '.ejs' });
}

export interface SnippetData {
  [key: string]: unknown;
}

export function renderSnippet(language: string, templateName: string, data: SnippetData): string | null {
  const dir = getTemplateDir(language);
  const templatePath = path.join(dir, `${templateName}.ejs`);
  if (!fs.existsSync(templatePath)) {
    console.error(`[renderSnippet] Template not found: ${templatePath} (__dirname: ${__dirname})`);
    return null;
  }

  const template = fs.readFileSync(templatePath, 'utf-8');
  const eta = createEta(dir);
  const naming = getLanguageNaming(language);

  const enrichedData: Record<string, unknown> = {
    ...data,
    naming,
    utils: {
      singularize,
      toPascalCase,
      toCamelCase,
      toSnakeCase,
      toKebabCase,
      toUpperSnakeCase,
    },
  };

  const resource = enrichedData.resource as Record<string, unknown> | undefined;
  if (resource?.name && !resource.className) {
    enrichedData.resource = {
      ...resource,
      className: naming.className(singularize(resource.name as string)) + 'Resource',
      fileName: naming.fileName(resource.name as string),
    };
  }

  return eta.renderString(template, enrichedData);
}

export function renderRestSnippet(
  language: string,
  data: {
    op: Record<string, unknown>;
    resource: Record<string, unknown>;
    schemas: Array<Record<string, unknown>>;
    config: { languageConfig: { package_name: string } };
    spec: { info: { servers: Array<{ url: string }> } };
    [key: string]: unknown;
  },
): string | null {
  return renderSnippet(language, 'rest/snippet', data)
    ?? renderSnippet(language, 'rest/init', data);
}

export function getAvailableSnippetTemplates(language: string): string[] {
  const dir = getTemplateDir(language);
  const templates: string[] = [];

  for (const protocol of ['rest', 'graphql', 'websocket', 'grpc']) {
    const protocolDir = path.join(dir, protocol);
    if (!fs.existsSync(protocolDir)) continue;
    for (const file of fs.readdirSync(protocolDir)) {
      if (file.endsWith('.ejs')) {
        templates.push(`${protocol}/${file.replace('.ejs', '')}`);
      }
    }
  }
  return templates;
}
