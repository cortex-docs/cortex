import { toPascalCase, toSnakeCase } from '@cortex/core';
import { TemplateBasedPlugin, type LanguageTemplateConfig } from '../template-plugin';

export class RustPlugin extends TemplateBasedPlugin {
  readonly language = 'rust';
  readonly displayName = 'Rust';
  readonly fileExtension = '.rs';

  protected readonly langConfig: LanguageTemplateConfig = {
    language: 'rust',
    displayName: 'Rust',
    fileExtension: '.rs',
    typeMap: {
      string: 'String',
      integer: 'i64',
      number: 'f64',
      boolean: 'bool',
      array: (item) => `Vec<${item}>`,
      object: 'serde_json::Value',
      map: (value) => `std::collections::HashMap<String, ${value}>`,
      any: 'serde_json::Value',
      void: '()',
      datetime: 'String',
      nullable: (type) => `Option<${type}>`,
    },
    naming: {
      className: toPascalCase,
      methodName: toSnakeCase,
      fileName: toSnakeCase,
      propertyName: toSnakeCase,
      enumValue: toPascalCase,
      parameterName: toSnakeCase,
    },
    packageTemplates: [
      { template: 'cargo-toml', path: 'Cargo.toml' },
    ],
    packageFiles: () => [],
  };
}
