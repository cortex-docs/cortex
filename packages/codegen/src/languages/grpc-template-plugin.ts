import * as path from 'node:path';
import * as fs from 'node:fs';
import { Eta } from 'eta';
import type { GrpcSpec, GrpcService, GrpcMethod, GrpcMessage, GrpcField, GrpcEnum } from '@cortex/core';
import { toPascalCase, titleToPascalCase, toCamelCase, toSnakeCase, toKebabCase, toUpperSnakeCase } from '@cortex/core';
import type { GeneratedFile, NamingConventions } from '../plugin';
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
  private eta = new Eta({ autoEscape: false, autoTrim: false });

  async generate(
    spec: GrpcSpec,
    packageName: string,
    version: string,
    langConfig: GrpcLanguageConfig,
    sourceTitle?: string,
  ): Promise<GeneratedFile[]> {
    const files: GeneratedFile[] = [];
    const templateDir = this.getTemplateDir(langConfig.language);

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

    for (const tpl of ['grpc-client', 'grpc-types']) {
      const folderName = tpl.replace('grpc-', 'grpc/');
      const template = this.loadTemplate(templateDir, folderName) ?? this.loadTemplate(templateDir, tpl);
      if (template) {
        files.push({
          path: `src/${tpl}${langConfig.fileExtension}`,
          content: this.eta.renderString(template, data),
          overwrite: true,
        });
      }
    }

    if (spec.sourceContent) {
      files.push({
        path: 'src/service.proto',
        content: spec.sourceContent,
        overwrite: true,
      });
    }

    files.push(...langConfig.packageFiles(data));
    return files;
  }

  private getTemplateDir(language: string): string {
    const fromDist = path.resolve(__dirname, language, 'templates');
    if (fs.existsSync(fromDist)) return fromDist;
    const fromSrc = path.resolve(__dirname, '../../src/languages', language, 'templates');
    if (fs.existsSync(fromSrc)) return fromSrc;
    return fromDist;
  }

  private loadTemplate(dir: string, name: string): string | null {
    const candidate = path.join(dir, `${name}.ejs`);
    if (fs.existsSync(candidate)) return fs.readFileSync(candidate, 'utf-8');
    return null;
  }
}

type ScalarTypeKey = 'string' | 'integer' | 'number' | 'boolean';

const protoScalars: Record<string, ScalarTypeKey> = {
  string: 'string', bytes: 'string', bool: 'boolean',
  int32: 'integer', int64: 'integer', uint32: 'integer', uint64: 'integer',
  sint32: 'integer', sint64: 'integer', fixed32: 'integer', fixed64: 'integer',
  sfixed32: 'integer', sfixed64: 'integer',
  float: 'number', double: 'number',
};

function buildProtoTypeMap(typeMap: LanguageTypeMap): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [proto, abstract_] of Object.entries(protoScalars)) {
    result[proto] = typeMap[abstract_] ?? typeMap.any;
  }
  return result;
}

export function createGrpcPluginForLanguage(language: string): GrpcLanguageConfig | null {
  const configs: Record<string, () => GrpcLanguageConfig> = {
    typescript: () => {
      const tm: LanguageTypeMap = { string: 'string', integer: 'number', number: 'number', boolean: 'boolean', array: (i) => `${i}[]`, object: 'Record<string, unknown>', map: (v) => `Record<string, ${v}>`, any: 'unknown', void: 'void', datetime: 'string', nullable: (t) => `${t} | undefined` };
      return { language: 'typescript', fileExtension: '.ts', typeMap: tm, naming: { className: toPascalCase, methodName: toCamelCase, fileName: toKebabCase, propertyName: toCamelCase, enumValue: toPascalCase, parameterName: toCamelCase }, protoTypeMap: buildProtoTypeMap(tm),
        packageFiles: (d) => [{ path: 'package.json', content: JSON.stringify({ name: d.packageName, version: d.version, type: 'module', dependencies: { '@grpc/grpc-js': '^1.12.0', '@grpc/proto-loader': '^0.7.0' }, devDependencies: { typescript: '^5.8.0' } }, null, 2) + '\n', overwrite: true }] };
    },
    python: () => {
      const tm: LanguageTypeMap = { string: 'str', integer: 'int', number: 'float', boolean: 'bool', array: (i) => `list[${i}]`, object: 'dict[str, Any]', map: (v) => `dict[str, ${v}]`, any: 'Any', void: 'None', datetime: 'str', nullable: (t) => `Optional[${t}]` };
      return { language: 'python', fileExtension: '.py', typeMap: tm, naming: { className: toPascalCase, methodName: toSnakeCase, fileName: toSnakeCase, propertyName: toSnakeCase, enumValue: toUpperSnakeCase, parameterName: toSnakeCase }, protoTypeMap: buildProtoTypeMap(tm),
        packageFiles: (d) => [{ path: 'setup.py', content: `from setuptools import setup\nsetup(name="${d.packageName}", version="${d.version}", install_requires=["grpcio>=1.68.0", "protobuf>=5.0"])\n`, overwrite: true }] };
    },
    go: () => {
      const tm: LanguageTypeMap = { string: 'string', integer: 'int64', number: 'float64', boolean: 'bool', array: (i) => `[]${i}`, object: 'map[string]interface{}', map: (v) => `map[string]${v}`, any: 'interface{}', void: '', datetime: 'string', nullable: (t) => `*${t}` };
      return { language: 'go', fileExtension: '.go', typeMap: tm, naming: { className: toPascalCase, methodName: toPascalCase, fileName: toSnakeCase, propertyName: toPascalCase, enumValue: toUpperSnakeCase, parameterName: toCamelCase }, protoTypeMap: buildProtoTypeMap(tm),
        packageFiles: (d) => [{ path: 'go.mod', content: `module ${d.packageName}\n\ngo 1.21\n\nrequire google.golang.org/grpc v1.68.0\n`, overwrite: true }] };
    },
    java: () => {
      const tm: LanguageTypeMap = { string: 'String', integer: 'long', number: 'double', boolean: 'boolean', array: (i) => `List<${i}>`, object: 'Map<String, Object>', map: (v) => `Map<String, ${v}>`, any: 'Object', void: 'void', datetime: 'String', nullable: (t) => t };
      return { language: 'java', fileExtension: '.java', typeMap: tm, naming: { className: toPascalCase, methodName: toCamelCase, fileName: toPascalCase, propertyName: toCamelCase, enumValue: toUpperSnakeCase, parameterName: toCamelCase }, protoTypeMap: buildProtoTypeMap(tm),
        packageFiles: (d) => [{ path: 'pom.xml', content: `<project><modelVersion>4.0.0</modelVersion><groupId>${d.packageName}</groupId><artifactId>${d.packageName}-grpc</artifactId><version>${d.version}</version><dependencies><dependency><groupId>com.google.code.gson</groupId><artifactId>gson</artifactId><version>2.11.0</version></dependency></dependencies></project>\n`, overwrite: true }] };
    },
    kotlin: () => {
      const tm: LanguageTypeMap = { string: 'String', integer: 'Long', number: 'Double', boolean: 'Boolean', array: (i) => `List<${i}>`, object: 'Map<String, kotlinx.serialization.json.JsonElement>', map: (v) => `Map<String, ${v}>`, any: 'kotlinx.serialization.json.JsonElement', void: 'Unit', datetime: 'String', nullable: (t) => `${t}?` };
      return { language: 'kotlin', fileExtension: '.kt', typeMap: tm, naming: { className: toPascalCase, methodName: toCamelCase, fileName: toPascalCase, propertyName: toCamelCase, enumValue: toUpperSnakeCase, parameterName: toCamelCase }, protoTypeMap: buildProtoTypeMap(tm),
        packageFiles: (d) => [{ path: 'build.gradle.kts', content: `plugins { kotlin("jvm") version "2.1.0" }\nversion = "${d.version}"\nrepositories { mavenCentral() }\ndependencies { implementation("io.grpc:grpc-kotlin-stub:1.4.0") }\n`, overwrite: true }] };
    },
    ruby: () => {
      const tm: LanguageTypeMap = { string: 'String', integer: 'Integer', number: 'Float', boolean: 'Boolean', array: () => 'Array', object: 'Hash', map: () => 'Hash', any: 'Object', void: 'nil', datetime: 'String', nullable: (t) => t };
      return { language: 'ruby', fileExtension: '.rb', typeMap: tm, naming: { className: toPascalCase, methodName: toSnakeCase, fileName: toSnakeCase, propertyName: toSnakeCase, enumValue: toUpperSnakeCase, parameterName: toSnakeCase }, protoTypeMap: buildProtoTypeMap(tm),
        packageFiles: (d) => [{ path: 'Gemfile', content: `source "https://rubygems.org"\ngem "grpc"\n`, overwrite: true }] };
    },
    php: () => {
      const tm: LanguageTypeMap = { string: 'string', integer: 'int', number: 'float', boolean: 'bool', array: () => 'array', object: 'array', map: () => 'array', any: 'mixed', void: 'void', datetime: 'string', nullable: (t) => `?${t}` };
      return { language: 'php', fileExtension: '.php', typeMap: tm, naming: { className: toPascalCase, methodName: toCamelCase, fileName: toPascalCase, propertyName: toCamelCase, enumValue: toUpperSnakeCase, parameterName: toCamelCase }, protoTypeMap: buildProtoTypeMap(tm),
        packageFiles: (d) => [{ path: 'composer.json', content: JSON.stringify({ name: d.packageName, require: { php: '>=8.1', 'grpc/grpc': '^1.60' } }, null, 4) + '\n', overwrite: true }] };
    },
    csharp: () => {
      const tm: LanguageTypeMap = { string: 'string', integer: 'long', number: 'double', boolean: 'bool', array: (i) => `List<${i}>`, object: 'Dictionary<string, object>', map: (v) => `Dictionary<string, ${v}>`, any: 'object', void: 'void', datetime: 'DateTimeOffset', nullable: (t) => `${t}?` };
      return { language: 'csharp', fileExtension: '.cs', typeMap: tm, naming: { className: toPascalCase, methodName: toPascalCase, fileName: toPascalCase, propertyName: toPascalCase, enumValue: toUpperSnakeCase, parameterName: toPascalCase }, protoTypeMap: buildProtoTypeMap(tm),
        packageFiles: (d) => [{ path: `${toPascalCase(d.packageName)}.csproj`, content: `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework><Version>${d.version}</Version></PropertyGroup><ItemGroup><PackageReference Include="Grpc.Net.Client" Version="2.67.0" /><PackageReference Include="Google.Protobuf" Version="3.28.0" /></ItemGroup></Project>\n`, overwrite: true }] };
    },
    rust: () => {
      const tm: LanguageTypeMap = { string: 'String', integer: 'i64', number: 'f64', boolean: 'bool', array: (i) => `Vec<${i}>`, object: 'serde_json::Value', map: (v) => `std::collections::HashMap<String, ${v}>`, any: 'serde_json::Value', void: '()', datetime: 'String', nullable: (t) => `Option<${t}>` };
      return { language: 'rust', fileExtension: '.rs', typeMap: tm, naming: { className: toPascalCase, methodName: toSnakeCase, fileName: toSnakeCase, propertyName: toSnakeCase, enumValue: toPascalCase, parameterName: toSnakeCase }, protoTypeMap: buildProtoTypeMap(tm),
        packageFiles: (d) => [{ path: 'Cargo.toml', content: `[package]\nname = "${d.packageName}"\nversion = "${d.version}"\nedition = "2021"\n\n[dependencies]\ntonic = "0.12"\nprost = "0.13"\ntokio = { version = "1", features = ["full"] }\n`, overwrite: true }] };
    },
    cpp: () => {
      const tm: LanguageTypeMap = { string: 'std::string', integer: 'int64_t', number: 'double', boolean: 'bool', array: (i) => `std::vector<${i}>`, object: 'nlohmann::json', map: (v) => `std::map<std::string, ${v}>`, any: 'nlohmann::json', void: 'void', datetime: 'std::string', nullable: (t) => `std::optional<${t}>` };
      return { language: 'cpp', fileExtension: '.hpp', typeMap: tm, naming: { className: toPascalCase, methodName: toSnakeCase, fileName: toSnakeCase, propertyName: toSnakeCase, enumValue: toUpperSnakeCase, parameterName: toSnakeCase }, protoTypeMap: buildProtoTypeMap(tm),
        packageFiles: () => [] };
    },
    c: () => {
      const tm: LanguageTypeMap = { string: 'char*', integer: 'int64_t', number: 'double', boolean: 'int', array: () => 'cJSON*', object: 'cJSON*', map: () => 'cJSON*', any: 'cJSON*', void: 'void', datetime: 'char*', nullable: (t) => t.endsWith('*') ? t : `${t}` };
      return { language: 'c', fileExtension: '.h', typeMap: tm, naming: { className: toPascalCase, methodName: toSnakeCase, fileName: toSnakeCase, propertyName: toSnakeCase, enumValue: toUpperSnakeCase, parameterName: toSnakeCase }, protoTypeMap: buildProtoTypeMap(tm),
        packageFiles: () => [] };
    },
  };

  const factory = configs[language];
  return factory ? factory() : null;
}
