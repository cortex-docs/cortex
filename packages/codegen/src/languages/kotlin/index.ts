import { toPascalCase, toCamelCase, toUpperSnakeCase } from '@cortex-docs/core';
import { TemplateBasedPlugin, type LanguageTemplateConfig } from '../template-plugin';

export class KotlinPlugin extends TemplateBasedPlugin {
  readonly language = 'kotlin';
  readonly displayName = 'Kotlin';
  readonly fileExtension = '.kt';

  protected readonly langConfig: LanguageTemplateConfig = {
    language: 'kotlin',
    displayName: 'Kotlin',
    fileExtension: '.kt',
    typeMap: {
      string: 'String',
      integer: 'Int',
      number: 'Double',
      boolean: 'Boolean',
      array: (item) => `List<${item}>`,
      object: 'Map<String, kotlinx.serialization.json.JsonElement>',
      map: (value) => `Map<String, ${value}>`,
      any: 'kotlinx.serialization.json.JsonElement',
      void: 'Unit',
      datetime: 'String',
      file: 'FileUpload',
      nullable: (type) => `${type}?`,
    },
    naming: {
      className: toPascalCase,
      methodName: toCamelCase,
      fileName: toPascalCase,
      propertyName: toCamelCase,
      enumValue: toUpperSnakeCase,
      parameterName: toCamelCase,
    },
    packageTemplates: [{ template: 'build-gradle-kts', path: 'build.gradle.kts' }],
    packageFiles: () => [],
  };
}
