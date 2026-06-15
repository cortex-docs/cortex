import { toPascalCase, toSnakeCase, toUpperSnakeCase } from '@cortex/core';
import { TemplateBasedPlugin, type LanguageTemplateConfig } from '../template-plugin';

export class CppPlugin extends TemplateBasedPlugin {
  readonly language = 'cpp';
  readonly displayName = 'C++';
  readonly fileExtension = '.hpp';

  protected readonly langConfig: LanguageTemplateConfig = {
    language: 'cpp',
    displayName: 'C++',
    fileExtension: '.hpp',
    typeMap: {
      string: 'std::string',
      integer: 'int64_t',
      number: 'double',
      boolean: 'bool',
      array: (item) => `std::vector<${item}>`,
      object: 'nlohmann::json',
      map: (value) => `std::map<std::string, ${value}>`,
      any: 'nlohmann::json',
      void: 'void',
      datetime: 'std::string',
      nullable: (type) => `std::optional<${type}>`,
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
      { template: 'cmake', path: 'CMakeLists.txt' },
    ],
    packageFiles: () => [],
  };
}
