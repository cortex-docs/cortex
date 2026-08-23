import { toPascalCase, toUpperSnakeCase } from '@cortex/core';
import { TemplateBasedPlugin, type LanguageTemplateConfig } from '../template-plugin';

export class CSharpPlugin extends TemplateBasedPlugin {
  readonly language = 'csharp';
  readonly displayName = 'C#';
  readonly fileExtension = '.cs';

  protected readonly langConfig: LanguageTemplateConfig = {
    language: 'csharp',
    displayName: 'C#',
    fileExtension: '.cs',
    typeMap: {
      string: 'string',
      integer: 'int',
      number: 'double',
      boolean: 'bool',
      array: (item) => `List<${item}>`,
      object: 'Dictionary<string, object>',
      map: (value) => `Dictionary<string, ${value}>`,
      any: 'object',
      void: 'void',
      datetime: 'DateTimeOffset',
      file: 'FileUpload',
      nullable: (type) => `${type}?`,
    },
    naming: {
      className: toPascalCase,
      methodName: toPascalCase,
      fileName: toPascalCase,
      propertyName: toPascalCase,
      enumValue: toUpperSnakeCase,
      parameterName: toPascalCase,
    },
    packageTemplates: [
      {
        template: 'csproj',
        path: (data) => `${data.utils.toPascalCase(data.packageName)}.csproj`,
      },
    ],
    packageFiles: (context) => {
      const ns = toPascalCase(context.languageConfig.package_name);

      return [
        {
          path: 'ApiException.cs',
          content: `namespace ${ns};

public class ApiException : Exception
{
    public int StatusCode { get; }
    public string Body { get; }

    public ApiException(int statusCode, string body)
        : base($"API Error {statusCode}: {body}")
    {
        StatusCode = statusCode;
        Body = body;
    }
}
`,
          overwrite: true,
        },
      ];
    },
  };
}
