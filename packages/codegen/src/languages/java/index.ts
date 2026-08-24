import { toPascalCase, toCamelCase, toUpperSnakeCase } from '@cortex-docs/core';
import { TemplateBasedPlugin, type LanguageTemplateConfig } from '../template-plugin';

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
      file: 'FileUpload',
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
    packageTemplates: [{ template: 'pom-xml', path: 'pom.xml' }],
    clientPath: (data) => `src/${data.clientClass}.java`,
    resourcePath: (resource) => `src/resources/${resource.className}.java`,
    splitTypes: true,
    packageFiles: (context) => {
      const pkg = context.languageConfig.package_name.replace(/-/g, '.').toLowerCase();

      return [
        {
          path: 'src/models/FileUpload.java',
          content: `package ${pkg}.models;

public class FileUpload {
    private final String filename;
    private final byte[] data;
    private final String contentType;

    public FileUpload(String filename, byte[] data) {
        this(filename, data, "application/octet-stream");
    }

    public FileUpload(String filename, byte[] data, String contentType) {
        this.filename = filename;
        this.data = data;
        this.contentType = contentType;
    }

    public String getFilename() { return filename; }
    public byte[] getData() { return data; }
    public String getContentType() { return contentType; }
}
`,
          overwrite: true,
        },
        {
          path: 'src/PaginatedResponse.java',
          content: `package ${pkg};

import java.util.List;

public class PaginatedResponse<T> {
    private List<T> data;
    private String nextCursor;

    public List<T> getData() { return data; }
    public String getNextCursor() { return nextCursor; }
}
`,
          overwrite: true,
        },
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
