import {
  singularize,
  toPascalCase,
  toCamelCase,
  toSnakeCase,
  toKebabCase,
  toUpperSnakeCase,
} from '@cortex-docs/core';
import { getLanguageNaming } from './naming';
import { createLanguageTemplateRenderer, type TemplateRenderOptions } from './template-renderer';

export interface SnippetData {
  [key: string]: unknown;
}

export function renderLanguageTemplate(
  language: string,
  templateName: string,
  data: SnippetData,
  options?: TemplateRenderOptions,
): string | null {
  return createLanguageTemplateRenderer(language, options).render(templateName, data);
}

export function renderSnippet(
  language: string,
  templateName: string,
  data: SnippetData,
  options?: TemplateRenderOptions,
): string | null {
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

  return renderLanguageTemplate(language, templateName, enrichedData, options);
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
  options?: TemplateRenderOptions,
): string | null {
  return (
    renderSnippet(language, 'rest/snippet', data, options) ??
    renderSnippet(language, 'rest/init', data, options)
  );
}

export function getAvailableSnippetTemplates(
  language: string,
  options?: TemplateRenderOptions,
): string[] {
  const protocols = new Set(['rest', 'graphql', 'websocket', 'grpc', 'openrpc']);
  return createLanguageTemplateRenderer(language, options)
    .list()
    .filter((name) => protocols.has(name.split('/')[0]) && !name.includes('/files/'));
}
