import { toPascalCase, toSnakeCase, toUpperSnakeCase } from '@cortex/core';
import { TemplateBasedPlugin, type LanguageTemplateConfig } from '../template-plugin';

export class RubyPlugin extends TemplateBasedPlugin {
  readonly language = 'ruby';
  readonly displayName = 'Ruby';
  readonly fileExtension = '.rb';

  protected readonly langConfig: LanguageTemplateConfig = {
    language: 'ruby',
    displayName: 'Ruby',
    fileExtension: '.rb',
    typeMap: {
      string: 'String',
      integer: 'Integer',
      number: 'Float',
      boolean: 'Boolean',
      array: (item) => `Array<${item}>`,
      object: 'Hash',
      map: (value) => `Hash<String, ${value}>`,
      any: 'Object',
      void: 'nil',
      datetime: 'String',
      file: 'FileUpload',
      nullable: (type) => `${type}`,
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
      {
        template: 'gemspec',
        path: (data) => `${data.utils.toSnakeCase(data.packageName)}.gemspec`,
      },
    ],
    packageFiles: (context) => {
      const gemName = toSnakeCase(context.languageConfig.package_name);
      const moduleName = toPascalCase(context.languageConfig.package_name);

      return [
        {
          path: `lib/${gemName}.rb`,
          content: `# frozen_string_literal: true

require_relative "${gemName}/errors"

Dir[File.expand_path("../src/**/*.rb", __dir__)].sort.each do |file|
  require file unless File.basename(file) == "index.rb"
end
`,
          overwrite: true,
        },
        {
          path: `lib/${gemName}/errors.rb`,
          content: `# frozen_string_literal: true

module ${moduleName}
  class ApiError < StandardError
    attr_reader :status, :body

    def initialize(status, body)
      @status = status
      @body = body
      super("API Error \#{status}: \#{body}")
    end
  end
end
`,
          overwrite: true,
        },
      ];
    },
  };
}
