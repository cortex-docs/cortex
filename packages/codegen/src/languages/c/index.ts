import { toPascalCase, toSnakeCase, toUpperSnakeCase } from '@cortex-docs/core';
import { TemplateBasedPlugin, type LanguageTemplateConfig } from '../template-plugin';

export class CPlugin extends TemplateBasedPlugin {
  readonly language = 'c';
  readonly displayName = 'C';
  readonly fileExtension = '.h';

  protected readonly langConfig: LanguageTemplateConfig = {
    language: 'c',
    displayName: 'C',
    fileExtension: '.h',
    typeMap: {
      string: 'char*',
      integer: 'int64_t',
      number: 'double',
      boolean: 'int',
      array: (item) => (item === 'sdk_file_upload_t' ? 'sdk_file_upload_list_t' : 'cJSON*'),
      object: 'cJSON*',
      map: () => `cJSON*`,
      any: 'cJSON*',
      void: 'void',
      datetime: 'char*',
      file: 'sdk_file_upload_t',
      nullable: (type) => (type.endsWith('*') ? type : `${type}`),
    },
    naming: {
      className: toPascalCase,
      methodName: toSnakeCase,
      fileName: toSnakeCase,
      propertyName: toSnakeCase,
      enumValue: toUpperSnakeCase,
      parameterName: toSnakeCase,
    },
    packageTemplates: [
      { template: 'makefile', path: 'Makefile' },
      { template: 'conanfile', path: 'conanfile.py' },
    ],
    packageFiles: () => [],
  };
}
