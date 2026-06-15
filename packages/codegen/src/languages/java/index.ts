import { toPascalCase, toCamelCase, toUpperSnakeCase } from '@cortex/core';
import { TemplateBasedPlugin, resolveVersion, type LanguageTemplateConfig } from '../template-plugin';

export class JavaPlugin extends TemplateBasedPlugin {
  readonly language = 'java';
  readonly displayName = 'Java';
  readonly fileExtension = '.java';

  protected readonly langConfig: LanguageTemplateConfig = {
    language: 'java',
    displayName: 'Java',
    fileExtension: '.java',
    typeMap: {
      string: 'String',
      integer: 'Integer',
      number: 'Double',
      boolean: 'Boolean',
      array: (item) => `List<${item}>`,
      object: 'Map<String, Object>',
      map: (value) => `Map<String, ${value}>`,
      any: 'Object',
      void: 'void',
      datetime: 'String',
      nullable: (type) => type,
    },
    naming: {
      className: toPascalCase,
      methodName: toCamelCase,
      fileName: toPascalCase,
      propertyName: toCamelCase,
      enumValue: toUpperSnakeCase,
      parameterName: toCamelCase,
    },
    packageTemplates: [
      { template: 'pom-xml', path: 'pom.xml' },
    ],
    packageFiles: (context) => {
      const pkg = context.languageConfig.package_name.replace(/-/g, '.').toLowerCase();

      return [
        {
          path: `src/ApiException${'.java'}`,
          content: `package ${pkg};

public class ApiException extends Exception {
    private final int statusCode;
    private final String body;

    public ApiException(int statusCode, String body) {
        super("API Error " + statusCode + ": " + body);
        this.statusCode = statusCode;
        this.body = body;
    }

    public int getStatusCode() { return statusCode; }
    public String getBody() { return body; }
}
`,
          overwrite: true,
        },
      ];
    },
  };
}
