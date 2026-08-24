import type { GrpcSpec, GrpcService, GrpcMessage, GrpcEnum } from '@cortex-docs/core';
import {
  toPascalCase,
  titleToPascalCase,
  toCamelCase,
  toSnakeCase,
  toKebabCase,
  toUpperSnakeCase,
} from '@cortex-docs/core';
import type { GeneratedFile, NamingConventions } from '../plugin';
import {
  applyFileTemplateOverrides,
  createLanguageTemplateRenderer,
  type TemplateRenderOptions,
} from '../template-renderer';
import type { LanguageTypeMap } from './template-plugin';

export interface GrpcTemplateData {
  spec: GrpcSpec;
  services: GrpcService[];
  messages: GrpcMessage[];
  enums: GrpcEnum[];
  typeMap: LanguageTypeMap;
  naming: NamingConventions;
  packageName: string;
  version: string;
  protoPackage: string;
  clientClass: string;
  mapProtoType: (protoType: string, repeated: boolean, optional: boolean) => string;
}

export interface GrpcLanguageConfig {
  language: string;
  fileExtension: string;
  typeMap: LanguageTypeMap;
  naming: NamingConventions;
  protoTypeMap: Record<string, string>;
  packageFiles: (data: GrpcTemplateData) => GeneratedFile[];
}

export class GrpcTemplateEngine {
  async generate(
    spec: GrpcSpec,
    packageName: string,
    version: string,
    langConfig: GrpcLanguageConfig,
    sourceTitle?: string,
    options?: TemplateRenderOptions,
  ): Promise<GeneratedFile[]> {
    const files: GeneratedFile[] = [];
    const renderer = createLanguageTemplateRenderer(langConfig.language, options);
    const sourceDir = langConfig.language === 'go' ? 'src/grpc' : 'src';

    const mapProtoType = (protoType: string, repeated: boolean, optional: boolean): string => {
      const mapped = langConfig.protoTypeMap[protoType] ?? langConfig.naming.className(protoType);
      const withList = repeated ? langConfig.typeMap.array(mapped) : mapped;
      return optional ? langConfig.typeMap.nullable(withList) : withList;
    };

    const data: GrpcTemplateData = {
      spec,
      services: spec.services,
      messages: spec.messages,
      enums: spec.enums,
      typeMap: langConfig.typeMap,
      naming: langConfig.naming,
      packageName,
      version,
      protoPackage: spec.package,
      clientClass: titleToPascalCase(sourceTitle ?? 'Grpc'),
      mapProtoType,
    };

    for (const templateName of ['grpc-client', 'grpc-types']) {
      const nestedName = templateName.replace('grpc-', 'grpc/');
      const content = renderer.render(nestedName, data) ?? renderer.render(templateName, data);
      if (content !== null) {
        files.push({
          path: `${sourceDir}/${templateName}${langConfig.fileExtension}`,
          content,
          overwrite: true,
        });
      }
    }

    if (spec.sourceContent) {
      files.push({
        path: `${sourceDir}/service.proto`,
        content: spec.sourceContent,
        overwrite: true,
      });
    }

    files.push(...langConfig.packageFiles(data));
    return applyFileTemplateOverrides(files, renderer, data, 'grpc');
  }
}

type ScalarTypeKey = 'string' | 'integer' | 'number' | 'boolean';

const protoScalars: Record<string, ScalarTypeKey> = {
  string: 'string',
  bytes: 'string',
  bool: 'boolean',
  int32: 'integer',
  int64: 'integer',
  uint32: 'integer',
  uint64: 'integer',
  sint32: 'integer',
  sint64: 'integer',
  fixed32: 'integer',
  fixed64: 'integer',
  sfixed32: 'integer',
  sfixed64: 'integer',
  float: 'number',
  double: 'number',
};

function buildProtoTypeMap(typeMap: LanguageTypeMap): Record<string, string> {
  return Object.fromEntries(
    Object.entries(protoScalars).map(([protoType, abstractType]) => [
      protoType,
      typeMap[abstractType],
    ]),
  );
}

function config(
  language: string,
  fileExtension: string,
  typeMap: LanguageTypeMap,
  naming: NamingConventions,
  packageFiles: (data: GrpcTemplateData) => GeneratedFile[] = () => [],
): GrpcLanguageConfig {
  return {
    language,
    fileExtension,
    typeMap,
    naming,
    protoTypeMap: buildProtoTypeMap(typeMap),
    packageFiles,
  };
}

export function createGrpcPluginForLanguage(language: string): GrpcLanguageConfig | null {
  const configs: Record<string, () => GrpcLanguageConfig> = {
    typescript: () => {
      const types: LanguageTypeMap = {
        string: 'string',
        integer: 'number',
        number: 'number',
        boolean: 'boolean',
        array: (item) => `${item}[]`,
        object: 'Record<string, unknown>',
        map: (value) => `Record<string, ${value}>`,
        any: 'unknown',
        void: 'void',
        datetime: 'string',
        nullable: (type) => `${type} | undefined`,
      };
      return config(
        'typescript',
        '.ts',
        types,
        {
          className: toPascalCase,
          methodName: toCamelCase,
          fileName: toKebabCase,
          propertyName: toCamelCase,
          enumValue: toPascalCase,
          parameterName: toCamelCase,
        },
        (data) => [
          {
            path: 'package.json',
            content:
              JSON.stringify(
                {
                  name: data.packageName,
                  version: data.version,
                  type: 'module',
                  dependencies: { '@grpc/grpc-js': '^1.12.0', '@grpc/proto-loader': '^0.7.0' },
                  devDependencies: { typescript: '^5.8.0' },
                },
                null,
                2,
              ) + '\n',
            overwrite: true,
          },
        ],
      );
    },
    python: () => {
      const types: LanguageTypeMap = {
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
      };
      return config(
        'python',
        '.py',
        types,
        {
          className: toPascalCase,
          methodName: toSnakeCase,
          fileName: toSnakeCase,
          propertyName: toSnakeCase,
          enumValue: toUpperSnakeCase,
          parameterName: toSnakeCase,
        },
        (data) => [
          {
            path: 'setup.py',
            content: `from setuptools import setup\nsetup(name="${data.packageName}", version="${data.version}", install_requires=["grpcio>=1.68.0", "protobuf>=5.0"])\n`,
            overwrite: true,
          },
        ],
      );
    },
    go: () => {
      const types: LanguageTypeMap = {
        string: 'string',
        integer: 'int64',
        number: 'float64',
        boolean: 'bool',
        array: (item) => `[]${item}`,
        object: 'map[string]interface{}',
        map: (value) => `map[string]${value}`,
        any: 'interface{}',
        void: '',
        datetime: 'string',
        nullable: (type) => `*${type}`,
      };
      return config(
        'go',
        '.go',
        types,
        {
          className: toPascalCase,
          methodName: toPascalCase,
          fileName: toSnakeCase,
          propertyName: toPascalCase,
          enumValue: toUpperSnakeCase,
          parameterName: toCamelCase,
        },
        (data) => [
          {
            path: 'go.mod',
            content: `module ${data.packageName}\n\ngo 1.21\n\nrequire google.golang.org/grpc v1.68.0\n`,
            overwrite: true,
          },
        ],
      );
    },
    java: () => {
      const types: LanguageTypeMap = {
        string: 'String',
        integer: 'long',
        number: 'double',
        boolean: 'boolean',
        array: (item) => `List<${item}>`,
        object: 'Map<String, Object>',
        map: (value) => `Map<String, ${value}>`,
        any: 'Object',
        void: 'void',
        datetime: 'String',
        nullable: (type) => type,
      };
      return config(
        'java',
        '.java',
        types,
        {
          className: toPascalCase,
          methodName: toCamelCase,
          fileName: toPascalCase,
          propertyName: toCamelCase,
          enumValue: toUpperSnakeCase,
          parameterName: toCamelCase,
        },
        (data) => [
          {
            path: 'pom.xml',
            content: `<project><modelVersion>4.0.0</modelVersion><groupId>${data.packageName}</groupId><artifactId>${data.packageName}-grpc</artifactId><version>${data.version}</version><dependencies><dependency><groupId>com.google.code.gson</groupId><artifactId>gson</artifactId><version>2.11.0</version></dependency></dependencies></project>\n`,
            overwrite: true,
          },
        ],
      );
    },
    kotlin: () => {
      const types: LanguageTypeMap = {
        string: 'String',
        integer: 'Long',
        number: 'Double',
        boolean: 'Boolean',
        array: (item) => `List<${item}>`,
        object: 'Map<String, kotlinx.serialization.json.JsonElement>',
        map: (value) => `Map<String, ${value}>`,
        any: 'kotlinx.serialization.json.JsonElement',
        void: 'Unit',
        datetime: 'String',
        nullable: (type) => `${type}?`,
      };
      return config(
        'kotlin',
        '.kt',
        types,
        {
          className: toPascalCase,
          methodName: toCamelCase,
          fileName: toPascalCase,
          propertyName: toCamelCase,
          enumValue: toUpperSnakeCase,
          parameterName: toCamelCase,
        },
        (data) => [
          {
            path: 'build.gradle.kts',
            content: `plugins { kotlin("jvm") version "2.1.0" }\nversion = "${data.version}"\nrepositories { mavenCentral() }\ndependencies { implementation("io.grpc:grpc-kotlin-stub:1.4.0") }\n`,
            overwrite: true,
          },
        ],
      );
    },
    ruby: () => {
      const types: LanguageTypeMap = {
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
        nullable: (type) => type,
      };
      return config(
        'ruby',
        '.rb',
        types,
        {
          className: toPascalCase,
          methodName: toSnakeCase,
          fileName: toSnakeCase,
          propertyName: toSnakeCase,
          enumValue: toUpperSnakeCase,
          parameterName: toSnakeCase,
        },
        () => [
          {
            path: 'Gemfile',
            content: 'source "https://rubygems.org"\ngem "grpc"\n',
            overwrite: true,
          },
        ],
      );
    },
    php: () => {
      const types: LanguageTypeMap = {
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
        nullable: (type) => `?${type}`,
      };
      return config(
        'php',
        '.php',
        types,
        {
          className: toPascalCase,
          methodName: toCamelCase,
          fileName: toPascalCase,
          propertyName: toCamelCase,
          enumValue: toUpperSnakeCase,
          parameterName: toCamelCase,
        },
        (data) => [
          {
            path: 'composer.json',
            content:
              JSON.stringify(
                { name: data.packageName, require: { php: '>=8.1', 'grpc/grpc': '^1.60' } },
                null,
                4,
              ) + '\n',
            overwrite: true,
          },
        ],
      );
    },
    csharp: () => {
      const types: LanguageTypeMap = {
        string: 'string',
        integer: 'long',
        number: 'double',
        boolean: 'bool',
        array: (item) => `List<${item}>`,
        object: 'Dictionary<string, object>',
        map: (value) => `Dictionary<string, ${value}>`,
        any: 'object',
        void: 'void',
        datetime: 'DateTimeOffset',
        nullable: (type) => `${type}?`,
      };
      return config(
        'csharp',
        '.cs',
        types,
        {
          className: toPascalCase,
          methodName: toPascalCase,
          fileName: toPascalCase,
          propertyName: toPascalCase,
          enumValue: toUpperSnakeCase,
          parameterName: toPascalCase,
        },
        (data) => [
          {
            path: `${toPascalCase(data.packageName)}.csproj`,
            content: `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework><Version>${data.version}</Version></PropertyGroup><ItemGroup><PackageReference Include="Grpc.Net.Client" Version="2.67.0" /><PackageReference Include="Google.Protobuf" Version="3.28.0" /></ItemGroup></Project>\n`,
            overwrite: true,
          },
        ],
      );
    },
    rust: () => {
      const types: LanguageTypeMap = {
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
      };
      return config(
        'rust',
        '.rs',
        types,
        {
          className: toPascalCase,
          methodName: toSnakeCase,
          fileName: toSnakeCase,
          propertyName: toSnakeCase,
          enumValue: toPascalCase,
          parameterName: toSnakeCase,
        },
        (data) => [
          {
            path: 'Cargo.toml',
            content: `[package]\nname = "${data.packageName}"\nversion = "${data.version}"\nedition = "2021"\n\n[dependencies]\ntonic = "0.12"\nprost = "0.13"\ntokio = { version = "1", features = ["full"] }\n`,
            overwrite: true,
          },
        ],
      );
    },
    cpp: () => {
      const types: LanguageTypeMap = {
        string: 'std::string',
        integer: 'int64_t',
        number: 'double',
        boolean: 'bool',
        array: (item) => `std::vector<${item}>`,
        object: 'nlohmann::json',
        map: (value) => `std::map<std::string, ${value}>`,
        any: 'nlohmann::json',
        void: 'void',
        datetime: 'std::string',
        nullable: (type) => `std::optional<${type}>`,
      };
      return config('cpp', '.hpp', types, {
        className: toPascalCase,
        methodName: toSnakeCase,
        fileName: toSnakeCase,
        propertyName: toSnakeCase,
        enumValue: toUpperSnakeCase,
        parameterName: toSnakeCase,
      });
    },
    c: () => {
      const types: LanguageTypeMap = {
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
        nullable: (type) => type,
      };
      return config('c', '.h', types, {
        className: toPascalCase,
        methodName: toSnakeCase,
        fileName: toSnakeCase,
        propertyName: toSnakeCase,
        enumValue: toUpperSnakeCase,
        parameterName: toSnakeCase,
      });
    },
  };

  return configs[language]?.() ?? null;
}
