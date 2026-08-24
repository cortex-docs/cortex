import { toPascalCase, toCamelCase, toUpperSnakeCase } from '@cortex-docs/core';
import { TemplateBasedPlugin, type LanguageTemplateConfig } from '../template-plugin';

export class PhpPlugin extends TemplateBasedPlugin {
  readonly language = 'php';
  readonly displayName = 'PHP';
  readonly fileExtension = '.php';

  protected readonly langConfig: LanguageTemplateConfig = {
    language: 'php',
    displayName: 'PHP',
    fileExtension: '.php',
    typeMap: {
      string: 'string',
      integer: 'int',
      number: 'float',
      boolean: 'bool',
      array: (item) => `array<${item}>`,
      object: 'array',
      map: (value) => `array<string, ${value}>`,
      any: 'mixed',
      void: 'void',
      datetime: 'string',
      file: 'FileUpload',
      nullable: (type) => `?${type}`,
    },
    naming: {
      className: toPascalCase,
      methodName: toCamelCase,
      fileName: toPascalCase,
      propertyName: toCamelCase,
      enumValue: toUpperSnakeCase,
      parameterName: toCamelCase,
    },
    packageTemplates: [{ template: 'composer-json', path: 'composer.json' }],
    packageFiles: (context) => {
      const ns = toPascalCase(context.languageConfig.package_name.replace(/[\/.]+/g, '-'));

      return [
        {
          path: 'src/ApiException.php',
          content: `<?php

declare(strict_types=1);

namespace ${ns};

class ApiException extends \\RuntimeException
{
    public function __construct(
        public readonly int $statusCode,
        public readonly string $body,
    ) {
        parent::__construct("API Error {$statusCode}: {$body}");
    }
}
`,
          overwrite: true,
        },
      ];
    },
  };
}
