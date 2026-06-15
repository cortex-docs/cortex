import { toPascalCase, toSnakeCase, toUpperSnakeCase } from '@cortex/core';
import { TemplateBasedPlugin, type LanguageTemplateConfig } from '../template-plugin';

export class PythonPlugin extends TemplateBasedPlugin {
  readonly language = 'python';
  readonly displayName = 'Python';
  readonly fileExtension = '.py';

  protected readonly langConfig: LanguageTemplateConfig = {
    language: 'python',
    displayName: 'Python',
    fileExtension: '.py',
    typeMap: {
      string: 'str',
      integer: 'int',
      number: 'float',
      boolean: 'bool',
      array: (item) => `list[${item}]`,
      object: 'dict[str, Any]',
      map: (value) => `dict[str, ${value}]`,
      any: 'Any',
      void: 'None',
      datetime: 'str',
      nullable: (type) => `Optional[${type}]`,
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
      { template: 'setup-py', path: 'setup.py' },
      { template: 'pyproject-toml', path: 'pyproject.toml' },
    ],
    packageFiles: () => [
      {
        path: 'src/exceptions.py',
        content: `class ApiError(Exception):\n    def __init__(self, status: int, message: str, body: str) -> None:\n        self.status = status\n        self.message = message\n        self.body = body\n        super().__init__(f"API Error {status}: {message}")\n`,
        overwrite: true,
      },
      {
        path: 'src/resources/__init__.py',
        content: '',
        overwrite: true,
      },
    ],
  };
}
