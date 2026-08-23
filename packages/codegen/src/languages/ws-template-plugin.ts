import type { AsyncApiSpec, SchemaObject, WebSocketHeartbeatConfig } from '@cortex/core';
import {
  toPascalCase,
  titleToPascalCase,
  toCamelCase,
  toSnakeCase,
  toKebabCase,
  toUpperSnakeCase,
} from '@cortex/core';
import type { GeneratedFile, NamingConventions } from '../plugin';
import {
  applyFileTemplateOverrides,
  createLanguageTemplateRenderer,
  type TemplateRenderOptions,
} from '../template-renderer';
import type { LanguageTypeMap } from './template-plugin';

export interface WsTemplateData {
  spec: AsyncApiSpec;
  channels: WsChannelData[];
  schemas: WsSchemaData[];
  types: LanguageTypeMap;
  naming: NamingConventions;
  packageName: string;
  version: string;
  serverUrl: string;
  clientClass: string;
  heartbeat: WsHeartbeatData;
}

export interface WsHeartbeatData {
  enabled: boolean;
  format: 'json' | 'text';
  intervalMs: number;
  timeoutMs: number;
  hasClientMessage: boolean;
  hasClientResponse: boolean;
  hasServerMessage: boolean;
  hasServerResponse: boolean;
  clientMessageLiteral: string;
  clientResponseLiteral: string;
  serverMessageLiteral: string;
  serverResponseLiteral: string;
}

export interface WsChannelData {
  name: string;
  className: string;
  methodName: string;
  description?: string;
  canSubscribe: boolean;
  canPublish: boolean;
  subscribeSchema?: WsSchemaData;
  publishSchema?: WsSchemaData;
}

export interface WsSchemaData {
  name: string;
  className: string;
  properties: WsPropertyData[];
  required: string[];
}

export interface WsPropertyData {
  originalName: string;
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

export interface WsLanguageConfig {
  language: string;
  fileExtension: string;
  typeMap: LanguageTypeMap;
  naming: NamingConventions;
  packageFiles: (data: WsTemplateData) => GeneratedFile[];
}

export class WsTemplateEngine {
  async generate(
    spec: AsyncApiSpec,
    packageName: string,
    version: string,
    langConfig: WsLanguageConfig,
    sourceTitle?: string,
    heartbeatConfig?: WebSocketHeartbeatConfig,
    options?: TemplateRenderOptions,
  ): Promise<GeneratedFile[]> {
    const files: GeneratedFile[] = [];
    const renderer = createLanguageTemplateRenderer(langConfig.language, options);

    const channels = this.buildChannels(spec, langConfig);
    const schemas = this.buildSchemas(spec, langConfig);
    const serverUrl = spec.servers[0]?.url ?? 'ws://localhost:8080';
    const heartbeat = this.buildHeartbeat(heartbeatConfig, langConfig.language);

    const data: WsTemplateData = {
      spec,
      channels,
      schemas,
      types: langConfig.typeMap,
      naming: langConfig.naming,
      packageName,
      version,
      serverUrl,
      clientClass: titleToPascalCase(sourceTitle ?? 'Ws'),
      heartbeat,
    };
    const sourceDir = langConfig.language === 'go' ? 'src/websocket' : 'src';

    const clientContent =
      renderer.render('websocket/client', data) ?? renderer.render('ws-client', data);
    if (clientContent !== null) {
      files.push({
        path: `${sourceDir}/ws-client${langConfig.fileExtension}`,
        content: clientContent,
        overwrite: true,
      });
    }

    const typesContent =
      renderer.render('websocket/types', data) ?? renderer.render('ws-types', data);
    if (typesContent !== null) {
      files.push({
        path: `${sourceDir}/ws-types${langConfig.fileExtension}`,
        content: typesContent,
        overwrite: true,
      });
    }

    files.push(...langConfig.packageFiles(data));
    return applyFileTemplateOverrides(files, renderer, data, 'websocket');
  }

  private buildHeartbeat(
    config: WebSocketHeartbeatConfig | undefined,
    language: string,
  ): WsHeartbeatData {
    const enabled = config?.enabled !== false && !!config;
    const format = config?.format ?? 'json';
    const toWire = (value: unknown): string =>
      format === 'text' ? String(value) : JSON.stringify(value);
    const literal = (value: unknown): string =>
      this.stringLiteral(value === undefined ? '' : toWire(value), language);

    return {
      enabled,
      format,
      intervalMs: enabled && config?.client ? (config.interval_ms ?? 30_000) : 0,
      timeoutMs: enabled ? (config?.timeout_ms ?? 10_000) : 0,
      hasClientMessage: enabled && config?.client !== undefined,
      hasClientResponse: enabled && config?.client?.response !== undefined,
      hasServerMessage: enabled && config?.server !== undefined,
      hasServerResponse: enabled && config?.server?.response !== undefined,
      clientMessageLiteral: literal(config?.client?.message),
      clientResponseLiteral: literal(config?.client?.response),
      serverMessageLiteral: literal(config?.server?.message),
      serverResponseLiteral: literal(config?.server?.response),
    };
  }

  private stringLiteral(value: string, language: string): string {
    if (language === 'php' || language === 'ruby') {
      return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
    }
    return JSON.stringify(value);
  }

  private buildChannels(spec: AsyncApiSpec, lc: WsLanguageConfig): WsChannelData[] {
    return spec.channels.map((ch) => ({
      name: ch.name,
      className: toPascalCase(ch.name.replace(/[^a-zA-Z0-9]/g, '-')),
      methodName: lc.naming.methodName(ch.name.replace(/[^a-zA-Z0-9]/g, '-')),
      description: ch.description,
      canSubscribe: !!ch.subscribe,
      canPublish: !!ch.publish,
      subscribeSchema: ch.subscribe?.message.schema
        ? this.buildSchema('subscribe', ch.subscribe.message.schema, lc)
        : undefined,
      publishSchema: ch.publish?.message.schema
        ? this.buildSchema('publish', ch.publish.message.schema, lc)
        : undefined,
    }));
  }

  private buildSchemas(spec: AsyncApiSpec, lc: WsLanguageConfig): WsSchemaData[] {
    const schemas: WsSchemaData[] = [];
    for (const [name, schema] of spec.schemas) {
      if (schema.properties) {
        schemas.push(this.buildSchema(name, schema, lc));
      }
    }
    return schemas;
  }

  private buildSchema(name: string, schema: SchemaObject, lc: WsLanguageConfig): WsSchemaData {
    return {
      name,
      className: toPascalCase(name),
      properties: schema.properties
        ? Object.entries(schema.properties).map(([propName, propSchema]) => ({
            originalName: propName,
            name: lc.naming.propertyName(propName),
            type: this.mapType(propSchema, lc.typeMap),
            required: schema.required?.includes(propName) ?? false,
            description: propSchema.description,
          }))
        : [],
      required: schema.required ?? [],
    };
  }

  private mapType(schema: SchemaObject, types: LanguageTypeMap): string {
    if (schema.enum) return types.string;
    switch (schema.type) {
      case 'string':
        return schema.format === 'date-time' ? types.datetime : types.string;
      case 'integer':
        return types.integer;
      case 'number':
        return types.number;
      case 'boolean':
        return types.boolean;
      case 'array':
        return schema.items
          ? types.array(this.mapType(schema.items, types))
          : types.array(types.any);
      case 'object':
        return types.object;
      default:
        return types.any;
    }
  }
}

export interface WsCodegenContext {
  spec: AsyncApiSpec;
  packageName: string;
  outputDir: string;
}

export function createWsPluginForLanguage(language: string): WsLanguageConfig | null {
  const configs: Record<string, WsLanguageConfig> = {
    typescript: {
      language: 'typescript',
      fileExtension: '.ts',
      typeMap: {
        string: 'string',
        integer: 'number',
        number: 'number',
        boolean: 'boolean',
        array: (i) => `${i}[]`,
        object: 'Record<string, unknown>',
        map: (v) => `Record<string, ${v}>`,
        any: 'unknown',
        void: 'void',
        datetime: 'string',
        nullable: (t) => `${t} | null`,
      },
      naming: {
        className: toPascalCase,
        methodName: toCamelCase,
        fileName: toKebabCase,
        propertyName: toCamelCase,
        enumValue: toPascalCase,
        parameterName: toCamelCase,
      },
      packageFiles: (data) => [
        {
          path: 'package.json',
          content:
            JSON.stringify(
              {
                name: data.packageName,
                version: data.version,
                type: 'module',
                description: `WebSocket SDK for ${data.spec.title}`,
                main: './dist/ws-client.js',
                types: './dist/ws-client.d.ts',
                exports: { '.': { types: './dist/ws-client.d.ts', import: './dist/ws-client.js' } },
                scripts: { build: 'tsc', clean: 'rm -rf dist' },
                devDependencies: { typescript: '^5.8.0' },
              },
              null,
              2,
            ) + '\n',
          overwrite: true,
        },
        {
          path: 'tsconfig.json',
          content:
            JSON.stringify(
              {
                compilerOptions: {
                  target: 'ES2022',
                  module: 'ES2022',
                  moduleResolution: 'bundler',
                  lib: ['ES2022', 'DOM', 'DOM.Iterable'],
                  strict: true,
                  esModuleInterop: true,
                  skipLibCheck: true,
                  declaration: true,
                  outDir: './dist',
                  rootDir: './src',
                },
                include: ['src/**/*.ts'],
                exclude: ['node_modules', 'dist'],
              },
              null,
              2,
            ) + '\n',
          overwrite: true,
        },
      ],
    },
    python: {
      language: 'python',
      fileExtension: '.py',
      typeMap: {
        string: 'str',
        integer: 'int',
        number: 'float',
        boolean: 'bool',
        array: (i) => `list[${i}]`,
        object: 'dict[str, Any]',
        map: (v) => `dict[str, ${v}]`,
        any: 'Any',
        void: 'None',
        datetime: 'str',
        nullable: (t) => `Optional[${t}]`,
      },
      naming: {
        className: toPascalCase,
        methodName: toSnakeCase,
        fileName: toSnakeCase,
        propertyName: toSnakeCase,
        enumValue: toUpperSnakeCase,
        parameterName: toSnakeCase,
      },
      packageFiles: (data) => [
        {
          path: 'setup.py',
          content: `from setuptools import setup\n\nsetup(\n    name="${data.packageName}",\n    version="${data.version}",\n    install_requires=["websockets>=13.0"],\n)\n`,
          overwrite: true,
        },
      ],
    },
    go: {
      language: 'go',
      fileExtension: '.go',
      typeMap: {
        string: 'string',
        integer: 'int',
        number: 'float64',
        boolean: 'bool',
        array: (i) => `[]${i}`,
        object: 'map[string]interface{}',
        map: (v) => `map[string]${v}`,
        any: 'interface{}',
        void: '',
        datetime: 'string',
        nullable: (t) => `*${t}`,
      },
      naming: {
        className: toPascalCase,
        methodName: toPascalCase,
        fileName: toSnakeCase,
        propertyName: toPascalCase,
        enumValue: toUpperSnakeCase,
        parameterName: toCamelCase,
      },
      packageFiles: (data) => [
        {
          path: 'go.mod',
          content: `module ${data.packageName}\n\ngo 1.21\n\nrequire github.com/gorilla/websocket v1.5.0\n`,
          overwrite: true,
        },
      ],
    },
    java: {
      language: 'java',
      fileExtension: '.java',
      typeMap: {
        string: 'String',
        integer: 'Integer',
        number: 'Double',
        boolean: 'Boolean',
        array: (i) => `List<${i}>`,
        object: 'Map<String, Object>',
        map: (v) => `Map<String, ${v}>`,
        any: 'Object',
        void: 'void',
        datetime: 'String',
        nullable: (t) => t,
      },
      naming: {
        className: toPascalCase,
        methodName: toCamelCase,
        fileName: toPascalCase,
        propertyName: toCamelCase,
        enumValue: toUpperSnakeCase,
        parameterName: toCamelCase,
      },
      packageFiles: (data) => [
        {
          path: 'pom.xml',
          content: `<?xml version="1.0" encoding="UTF-8"?>\n<project xmlns="http://maven.apache.org/POM/4.0.0"\n         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">\n    <modelVersion>4.0.0</modelVersion>\n    <groupId>${data.packageName}</groupId>\n    <artifactId>${data.packageName}-ws</artifactId>\n    <version>${data.version}</version>\n    <properties>\n        <maven.compiler.source>17</maven.compiler.source>\n        <maven.compiler.target>17</maven.compiler.target>\n    </properties>\n    <dependencies>\n        <dependency>\n            <groupId>com.google.code.gson</groupId>\n            <artifactId>gson</artifactId>\n            <version>2.11.0</version>\n        </dependency>\n    </dependencies>\n</project>\n`,
          overwrite: true,
        },
      ],
    },
    kotlin: {
      language: 'kotlin',
      fileExtension: '.kt',
      typeMap: {
        string: 'String',
        integer: 'Int',
        number: 'Double',
        boolean: 'Boolean',
        array: (i) => `List<${i}>`,
        object: 'Map<String, Any>',
        map: (v) => `Map<String, ${v}>`,
        any: 'Any',
        void: 'Unit',
        datetime: 'String',
        nullable: (t) => `${t}?`,
      },
      naming: {
        className: toPascalCase,
        methodName: toCamelCase,
        fileName: toPascalCase,
        propertyName: toCamelCase,
        enumValue: toUpperSnakeCase,
        parameterName: toCamelCase,
      },
      packageFiles: (data) => [
        {
          path: 'build.gradle.kts',
          content: `plugins {\n    kotlin("jvm") version "2.1.0"\n    kotlin("plugin.serialization") version "2.1.0"\n}\n\nversion = "${data.version}"\n\nrepositories { mavenCentral() }\n\ndependencies {\n    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.8.0")\n}\n`,
          overwrite: true,
        },
      ],
    },
    ruby: {
      language: 'ruby',
      fileExtension: '.rb',
      typeMap: {
        string: 'String',
        integer: 'Integer',
        number: 'Float',
        boolean: 'Boolean',
        array: (i) => `Array<${i}>`,
        object: 'Hash',
        map: (v) => `Hash<String, ${v}>`,
        any: 'Object',
        void: 'nil',
        datetime: 'String',
        nullable: (t) => t,
      },
      naming: {
        className: toPascalCase,
        methodName: toSnakeCase,
        fileName: toSnakeCase,
        propertyName: toSnakeCase,
        enumValue: toUpperSnakeCase,
        parameterName: toSnakeCase,
      },
      packageFiles: () => [
        {
          path: 'Gemfile',
          content: `source "https://rubygems.org"\n\ngem "faye-websocket"\ngem "eventmachine"\n`,
          overwrite: true,
        },
      ],
    },
    php: {
      language: 'php',
      fileExtension: '.php',
      typeMap: {
        string: 'string',
        integer: 'int',
        number: 'float',
        boolean: 'bool',
        array: () => `array`,
        object: 'array',
        map: () => `array`,
        any: 'mixed',
        void: 'void',
        datetime: 'string',
        nullable: (t) => `?${t}`,
      },
      naming: {
        className: toPascalCase,
        methodName: toCamelCase,
        fileName: toPascalCase,
        propertyName: toCamelCase,
        enumValue: toUpperSnakeCase,
        parameterName: toCamelCase,
      },
      packageFiles: (data) => [
        {
          path: 'composer.json',
          content:
            JSON.stringify(
              {
                name: data.packageName,
                description: `WebSocket SDK for ${data.spec.title}`,
                type: 'library',
                require: { php: '>=8.1', 'ratchet/pawl': '^0.4' },
              },
              null,
              4,
            ) + '\n',
          overwrite: true,
        },
      ],
    },
    csharp: {
      language: 'csharp',
      fileExtension: '.cs',
      typeMap: {
        string: 'string',
        integer: 'int',
        number: 'double',
        boolean: 'bool',
        array: (i) => `List<${i}>`,
        object: 'Dictionary<string, object>',
        map: (v) => `Dictionary<string, ${v}>`,
        any: 'object',
        void: 'void',
        datetime: 'DateTimeOffset',
        nullable: (t) => `${t}?`,
      },
      naming: {
        className: toPascalCase,
        methodName: toPascalCase,
        fileName: toPascalCase,
        propertyName: toPascalCase,
        enumValue: toUpperSnakeCase,
        parameterName: toPascalCase,
      },
      packageFiles: (data) => [
        {
          path: `${toPascalCase(data.packageName)}.csproj`,
          content: `<Project Sdk="Microsoft.NET.Sdk">\n  <PropertyGroup>\n    <TargetFramework>net8.0</TargetFramework>\n    <ImplicitUsings>enable</ImplicitUsings>\n    <Nullable>enable</Nullable>\n    <Version>${data.version}</Version>\n  </PropertyGroup>\n  <ItemGroup>\n    <PackageReference Include="System.Text.Json" Version="9.0.0" />\n  </ItemGroup>\n</Project>\n`,
          overwrite: true,
        },
      ],
    },
    rust: {
      language: 'rust',
      fileExtension: '.rs',
      typeMap: {
        string: 'String',
        integer: 'i64',
        number: 'f64',
        boolean: 'bool',
        array: (i) => `Vec<${i}>`,
        object: 'serde_json::Value',
        map: (v) => `std::collections::HashMap<String, ${v}>`,
        any: 'serde_json::Value',
        void: '()',
        datetime: 'String',
        nullable: (t) => `Option<${t}>`,
      },
      naming: {
        className: toPascalCase,
        methodName: toSnakeCase,
        fileName: toSnakeCase,
        propertyName: toSnakeCase,
        enumValue: toPascalCase,
        parameterName: toSnakeCase,
      },
      packageFiles: (data) => [
        {
          path: 'Cargo.toml',
          content: `[package]\nname = "${data.packageName}"\nversion = "${data.version}"\nedition = "2021"\n\n[dependencies]\ntokio-tungstenite = "0.24"\ntokio = { version = "1", features = ["full"] }\nserde = { version = "1", features = ["derive"] }\nserde_json = "1"\nfutures-util = "0.3"\n`,
          overwrite: true,
        },
      ],
    },
    cpp: {
      language: 'cpp',
      fileExtension: '.hpp',
      typeMap: {
        string: 'std::string',
        integer: 'int64_t',
        number: 'double',
        boolean: 'bool',
        array: (i: string) => `std::vector<${i}>`,
        object: 'nlohmann::json',
        map: (v: string) => `std::map<std::string, ${v}>`,
        any: 'nlohmann::json',
        void: 'void',
        datetime: 'std::string',
        nullable: (t: string) => `std::optional<${t}>`,
      },
      naming: {
        className: toPascalCase,
        methodName: toSnakeCase,
        fileName: toSnakeCase,
        propertyName: toSnakeCase,
        enumValue: toUpperSnakeCase,
        parameterName: toSnakeCase,
      },
      packageFiles: () => [],
    },
    c: {
      language: 'c',
      fileExtension: '.h',
      typeMap: {
        string: 'char*',
        integer: 'int64_t',
        number: 'double',
        boolean: 'int',
        array: () => 'cJSON*',
        object: 'cJSON*',
        map: () => 'cJSON*',
        any: 'cJSON*',
        void: 'void',
        datetime: 'char*',
        nullable: (t: string) => (t.endsWith('*') ? t : `${t}`),
      },
      naming: {
        className: toPascalCase,
        methodName: toSnakeCase,
        fileName: toSnakeCase,
        propertyName: toSnakeCase,
        enumValue: toUpperSnakeCase,
        parameterName: toSnakeCase,
      },
      packageFiles: () => [],
    },
  };
  return configs[language] ?? null;
}
