import type { OpenRpcSpec, OpenRpcMethod } from '@cortex/core';
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

export interface OpenRpcTemplateData {
  spec: OpenRpcSpec;
  methods: OpenRpcMethod[];
  schemas: Map<string, any>;
  typeMap: LanguageTypeMap;
  naming: NamingConventions;
  packageName: string;
  version: string;
  clientClass: string;
  serverUrl: string;
  mapJsonSchemaType: (schema: any) => string;
}

export interface OpenRpcLanguageConfig {
  language: string;
  fileExtension: string;
  typeMap: LanguageTypeMap;
  naming: NamingConventions;
  jsonTypeMap: Record<string, string>;
  packageFiles: (data: OpenRpcTemplateData) => GeneratedFile[];
}

export class OpenRpcTemplateEngine {
  async generate(
    spec: OpenRpcSpec,
    packageName: string,
    version: string,
    langConfig: OpenRpcLanguageConfig,
    sourceTitle?: string,
    options?: TemplateRenderOptions,
  ): Promise<GeneratedFile[]> {
    const files: GeneratedFile[] = [];
    const renderer = createLanguageTemplateRenderer(langConfig.language, options);

    const mapJsonSchemaType = (schema: any): string => {
      if (!schema) return langConfig.typeMap.any;
      if (schema.ref) {
        const refName = schema.ref.split('/').pop() ?? '';
        return langConfig.naming.className(refName);
      }
      if (schema.enum) return langConfig.typeMap.string;
      const mapped = langConfig.jsonTypeMap[schema.type ?? 'object'] ?? langConfig.typeMap.any;
      if (schema.type === 'array' && schema.items) {
        return langConfig.typeMap.array(mapJsonSchemaType(schema.items));
      }
      return mapped;
    };

    const data: OpenRpcTemplateData = {
      spec,
      methods: spec.methods,
      schemas: spec.schemas,
      typeMap: langConfig.typeMap,
      naming: langConfig.naming,
      packageName,
      version,
      clientClass: titleToPascalCase(sourceTitle ?? 'JsonRpc'),
      serverUrl: spec.servers[0]?.url ?? 'http://localhost:3000/rpc',
      mapJsonSchemaType,
    };

    for (const tpl of ['openrpc-client', 'openrpc-types']) {
      const folderName = tpl.replace('openrpc-', 'openrpc/');
      const content = renderer.render(folderName, data) ?? renderer.render(tpl, data);
      if (content !== null) {
        files.push({
          path: `src/${tpl}${langConfig.fileExtension}`,
          content,
          overwrite: true,
        });
      }
    }

    files.push(...langConfig.packageFiles(data));
    return applyFileTemplateOverrides(files, renderer, data, 'openrpc');
  }
}

function buildJsonTypeMap(typeMap: LanguageTypeMap): Record<string, string> {
  return {
    string: typeMap.string,
    integer: typeMap.integer,
    number: typeMap.number,
    boolean: typeMap.boolean,
    array: typeMap.any,
    object: typeMap.object,
  };
}

export function createOpenRpcPluginForLanguage(language: string): OpenRpcLanguageConfig | null {
  const configs: Record<string, () => OpenRpcLanguageConfig> = {
    typescript: () => {
      const tm: LanguageTypeMap = {
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
        nullable: (t) => `${t} | undefined`,
      };
      return {
        language: 'typescript',
        fileExtension: '.ts',
        typeMap: tm,
        naming: {
          className: toPascalCase,
          methodName: toCamelCase,
          fileName: toKebabCase,
          propertyName: toCamelCase,
          enumValue: toPascalCase,
          parameterName: toCamelCase,
        },
        jsonTypeMap: buildJsonTypeMap(tm),
        packageFiles: (d) => [
          {
            path: 'package.json',
            content:
              JSON.stringify(
                { name: d.packageName, version: d.version, type: 'module', dependencies: {} },
                null,
                2,
              ) + '\n',
            overwrite: true,
          },
        ],
      };
    },
    python: () => {
      const tm: LanguageTypeMap = {
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
      };
      return {
        language: 'python',
        fileExtension: '.py',
        typeMap: tm,
        naming: {
          className: toPascalCase,
          methodName: toSnakeCase,
          fileName: toSnakeCase,
          propertyName: toSnakeCase,
          enumValue: toUpperSnakeCase,
          parameterName: toSnakeCase,
        },
        jsonTypeMap: buildJsonTypeMap(tm),
        packageFiles: (d) => [
          {
            path: 'setup.py',
            content: `from setuptools import setup\nsetup(name="${d.packageName}", version="${d.version}", install_requires=["requests>=2.31.0"])\n`,
            overwrite: true,
          },
        ],
      };
    },
    go: () => {
      const tm: LanguageTypeMap = {
        string: 'string',
        integer: 'int64',
        number: 'float64',
        boolean: 'bool',
        array: (i) => `[]${i}`,
        object: 'map[string]interface{}',
        map: (v) => `map[string]${v}`,
        any: 'interface{}',
        void: '',
        datetime: 'string',
        nullable: (t) => `*${t}`,
      };
      return {
        language: 'go',
        fileExtension: '.go',
        typeMap: tm,
        naming: {
          className: toPascalCase,
          methodName: toPascalCase,
          fileName: toSnakeCase,
          propertyName: toPascalCase,
          enumValue: toUpperSnakeCase,
          parameterName: toCamelCase,
        },
        jsonTypeMap: buildJsonTypeMap(tm),
        packageFiles: (d) => [
          { path: 'go.mod', content: `module ${d.packageName}\n\ngo 1.21\n`, overwrite: true },
        ],
      };
    },
    java: () => {
      const tm: LanguageTypeMap = {
        string: 'String',
        integer: 'long',
        number: 'double',
        boolean: 'boolean',
        array: (i) => `List<${i}>`,
        object: 'Map<String, Object>',
        map: (v) => `Map<String, ${v}>`,
        any: 'Object',
        void: 'void',
        datetime: 'String',
        nullable: (t) => t,
      };
      return {
        language: 'java',
        fileExtension: '.java',
        typeMap: tm,
        naming: {
          className: toPascalCase,
          methodName: toCamelCase,
          fileName: toPascalCase,
          propertyName: toCamelCase,
          enumValue: toUpperSnakeCase,
          parameterName: toCamelCase,
        },
        jsonTypeMap: buildJsonTypeMap(tm),
        packageFiles: (d) => [
          {
            path: 'pom.xml',
            content: `<project><modelVersion>4.0.0</modelVersion><groupId>${d.packageName}</groupId><artifactId>${d.packageName}-jsonrpc</artifactId><version>${d.version}</version><dependencies><dependency><groupId>com.google.code.gson</groupId><artifactId>gson</artifactId><version>2.11.0</version></dependency></dependencies></project>\n`,
            overwrite: true,
          },
        ],
      };
    },
    kotlin: () => {
      const tm: LanguageTypeMap = {
        string: 'String',
        integer: 'Long',
        number: 'Double',
        boolean: 'Boolean',
        array: (i) => `List<${i}>`,
        object: 'Map<String, kotlinx.serialization.json.JsonElement>',
        map: (v) => `Map<String, ${v}>`,
        any: 'kotlinx.serialization.json.JsonElement',
        void: 'Unit',
        datetime: 'String',
        nullable: (t) => `${t}?`,
      };
      return {
        language: 'kotlin',
        fileExtension: '.kt',
        typeMap: tm,
        naming: {
          className: toPascalCase,
          methodName: toCamelCase,
          fileName: toPascalCase,
          propertyName: toCamelCase,
          enumValue: toUpperSnakeCase,
          parameterName: toCamelCase,
        },
        jsonTypeMap: buildJsonTypeMap(tm),
        packageFiles: (d) => [
          {
            path: 'build.gradle.kts',
            content: `plugins { kotlin("jvm") version "2.1.0" }\nversion = "${d.version}"\nrepositories { mavenCentral() }\ndependencies { implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.0") }\n`,
            overwrite: true,
          },
        ],
      };
    },
    ruby: () => {
      const tm: LanguageTypeMap = {
        string: 'String',
        integer: 'Integer',
        number: 'Float',
        boolean: 'Boolean',
        array: () => 'Array',
        object: 'Hash',
        map: () => 'Hash',
        any: 'Object',
        void: 'nil',
        datetime: 'String',
        nullable: (t) => t,
      };
      return {
        language: 'ruby',
        fileExtension: '.rb',
        typeMap: tm,
        naming: {
          className: toPascalCase,
          methodName: toSnakeCase,
          fileName: toSnakeCase,
          propertyName: toSnakeCase,
          enumValue: toUpperSnakeCase,
          parameterName: toSnakeCase,
        },
        jsonTypeMap: buildJsonTypeMap(tm),
        packageFiles: () => [
          {
            path: 'Gemfile',
            content: `source "https://rubygems.org"\ngem "net-http"\ngem "json"\n`,
            overwrite: true,
          },
        ],
      };
    },
    php: () => {
      const tm: LanguageTypeMap = {
        string: 'string',
        integer: 'int',
        number: 'float',
        boolean: 'bool',
        array: () => 'array',
        object: 'array',
        map: () => 'array',
        any: 'mixed',
        void: 'void',
        datetime: 'string',
        nullable: (t) => `?${t}`,
      };
      return {
        language: 'php',
        fileExtension: '.php',
        typeMap: tm,
        naming: {
          className: toPascalCase,
          methodName: toCamelCase,
          fileName: toPascalCase,
          propertyName: toCamelCase,
          enumValue: toUpperSnakeCase,
          parameterName: toCamelCase,
        },
        jsonTypeMap: buildJsonTypeMap(tm),
        packageFiles: (d) => [
          {
            path: 'composer.json',
            content:
              JSON.stringify(
                { name: d.packageName, require: { php: '>=8.1', 'guzzlehttp/guzzle': '^7.0' } },
                null,
                4,
              ) + '\n',
            overwrite: true,
          },
        ],
      };
    },
    csharp: () => {
      const tm: LanguageTypeMap = {
        string: 'string',
        integer: 'long',
        number: 'double',
        boolean: 'bool',
        array: (i) => `List<${i}>`,
        object: 'Dictionary<string, object>',
        map: (v) => `Dictionary<string, ${v}>`,
        any: 'object',
        void: 'void',
        datetime: 'DateTimeOffset',
        nullable: (t) => `${t}?`,
      };
      return {
        language: 'csharp',
        fileExtension: '.cs',
        typeMap: tm,
        naming: {
          className: toPascalCase,
          methodName: toPascalCase,
          fileName: toPascalCase,
          propertyName: toPascalCase,
          enumValue: toUpperSnakeCase,
          parameterName: toPascalCase,
        },
        jsonTypeMap: buildJsonTypeMap(tm),
        packageFiles: (d) => [
          {
            path: `${toPascalCase(d.packageName)}.csproj`,
            content: `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework><Version>${d.version}</Version></PropertyGroup><ItemGroup><PackageReference Include="System.Net.Http.Json" Version="9.0.0" /></ItemGroup></Project>\n`,
            overwrite: true,
          },
        ],
      };
    },
    rust: () => {
      const tm: LanguageTypeMap = {
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
      };
      return {
        language: 'rust',
        fileExtension: '.rs',
        typeMap: tm,
        naming: {
          className: toPascalCase,
          methodName: toSnakeCase,
          fileName: toSnakeCase,
          propertyName: toSnakeCase,
          enumValue: toPascalCase,
          parameterName: toSnakeCase,
        },
        jsonTypeMap: buildJsonTypeMap(tm),
        packageFiles: (d) => [
          {
            path: 'Cargo.toml',
            content: `[package]\nname = "${d.packageName}"\nversion = "${d.version}"\nedition = "2021"\n\n[dependencies]\nreqwest = { version = "0.12", features = ["json"] }\nserde = { version = "1", features = ["derive"] }\nserde_json = "1"\ntokio = { version = "1", features = ["full"] }\n`,
            overwrite: true,
          },
        ],
      };
    },
    cpp: () => {
      const tm: LanguageTypeMap = {
        string: 'std::string',
        integer: 'int64_t',
        number: 'double',
        boolean: 'bool',
        array: (i) => `std::vector<${i}>`,
        object: 'nlohmann::json',
        map: (v) => `std::map<std::string, ${v}>`,
        any: 'nlohmann::json',
        void: 'void',
        datetime: 'std::string',
        nullable: (t) => `std::optional<${t}>`,
      };
      return {
        language: 'cpp',
        fileExtension: '.hpp',
        typeMap: tm,
        naming: {
          className: toPascalCase,
          methodName: toSnakeCase,
          fileName: toSnakeCase,
          propertyName: toSnakeCase,
          enumValue: toUpperSnakeCase,
          parameterName: toSnakeCase,
        },
        jsonTypeMap: buildJsonTypeMap(tm),
        packageFiles: () => [],
      };
    },
    c: () => {
      const tm: LanguageTypeMap = {
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
        nullable: (t) => (t.endsWith('*') ? t : `${t}`),
      };
      return {
        language: 'c',
        fileExtension: '.h',
        typeMap: tm,
        naming: {
          className: toPascalCase,
          methodName: toSnakeCase,
          fileName: toSnakeCase,
          propertyName: toSnakeCase,
          enumValue: toUpperSnakeCase,
          parameterName: toSnakeCase,
        },
        jsonTypeMap: buildJsonTypeMap(tm),
        packageFiles: () => [],
      };
    },
  };

  const factory = configs[language];
  return factory ? factory() : null;
}
