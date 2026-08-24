import { toPascalCase, toCamelCase, toSnakeCase, toUpperSnakeCase } from '@cortex-docs/core';
import { TemplateBasedPlugin, type LanguageTemplateConfig } from '../template-plugin';

export class GoPlugin extends TemplateBasedPlugin {
  readonly language = 'go';
  readonly displayName = 'Go';
  readonly fileExtension = '.go';

  protected readonly langConfig: LanguageTemplateConfig = {
    language: 'go',
    displayName: 'Go',
    fileExtension: '.go',
    typeMap: {
      string: 'string',
      integer: 'int',
      number: 'float64',
      boolean: 'bool',
      array: (item) => `[]${item}`,
      object: 'map[string]interface{}',
      objectLiteral: (properties) => {
        const fields = properties.map((prop) => {
          const fieldType = prop.required ? prop.type : `*${prop.type}`;
          const omitEmpty = prop.required ? '' : ',omitempty';
          return `\t${toPascalCase(prop.name)} ${fieldType} \`json:"${prop.name}${omitEmpty}"\``;
        });
        return `struct {\n${fields.join('\n')}\n}`;
      },
      map: (value) => `map[string]${value}`,
      any: 'interface{}',
      void: '',
      datetime: 'string',
      file: 'FileUpload',
      nullable: (type) => `*${type}`,
    },
    naming: {
      className: toPascalCase,
      methodName: toPascalCase,
      fileName: toSnakeCase,
      propertyName: toPascalCase,
      enumValue: toUpperSnakeCase,
      parameterName: toCamelCase,
    },
    packageTemplates: [{ template: 'go-mod', path: 'go.mod' }],
    clientPath: () => 'client.go',
    typesPath: 'types.go',
    resourcePath: (resource) => `${resource.fileName}.go`,
    indexPath: 'index.go',
    packageFiles: (context) => {
      const parts = context.languageConfig.package_name.split('/');
      const pkgName = parts[parts.length - 1].replace(/-/g, '');

      return [
        {
          path: 'errors.go',
          content: `package ${pkgName}\n\nimport "fmt"\n\n// APIError represents an error response from the API.\ntype APIError struct {\n\tStatusCode int\n\tBody       string\n}\n\nfunc (e *APIError) Error() string {\n\treturn fmt.Sprintf("API error %d: %s", e.StatusCode, e.Body)\n}\n`,
          overwrite: true,
        },
      ];
    },
  };
}
