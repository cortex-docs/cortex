import { toPascalCase, toCamelCase, toKebabCase } from '@cortex/core';
import { TemplateBasedPlugin, type LanguageTemplateConfig } from '../template-plugin';

export class TypeScriptPlugin extends TemplateBasedPlugin {
  readonly language = 'typescript';
  readonly displayName = 'TypeScript';
  readonly fileExtension = '.ts';

  protected readonly langConfig: LanguageTemplateConfig = {
    language: 'typescript',
    displayName: 'TypeScript',
    fileExtension: '.ts',
    typeMap: {
      string: 'string',
      integer: 'number',
      number: 'number',
      boolean: 'boolean',
      array: (item) => `${item}[]`,
      object: 'Record<string, unknown>',
      objectLiteral: (properties) =>
        `{ ${properties
          .map((property) => {
            const name = /^[A-Za-z_$][\w$]*$/.test(property.name)
              ? property.name
              : JSON.stringify(property.name);
            return `${name}${property.required ? '' : '?'}: ${property.type}`;
          })
          .join('; ')} }`,
      map: (value) => `Record<string, ${value}>`,
      any: 'unknown',
      void: 'void',
      datetime: 'string',
      nullable: (type) => `${type} | null`,
    },
    naming: {
      className: toPascalCase,
      methodName: toCamelCase,
      fileName: toKebabCase,
      propertyName: toCamelCase,
      enumValue: toPascalCase,
      parameterName: toCamelCase,
    },
    packageTemplates: [
      { template: 'package-json', path: 'package.json' },
      { template: 'tsconfig-json', path: 'tsconfig.json' },
    ],
    packageFiles: () => [],
  };
}
