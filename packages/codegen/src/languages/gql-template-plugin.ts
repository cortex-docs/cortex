import type {
  GraphQLSpec,
  GraphQLOperation,
  GraphQLType,
  GraphQLField,
  GraphQLEnum,
  GraphQLInput,
} from '@cortex-docs/core';
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

export interface OperationMeta {
  name: string;
  typeName: string;
  kind: 'Query' | 'Mutation' | 'Subscription';
  resultTypeName: string;
  variablesTypeName: string;
  documentName: string;
  documentConstName: string;
  document: string;
  documentEscaped: string;
  allArgsOptional: boolean;
  hasArgs: boolean;
  returnTypeName: string;
  returnTypeStr: string;
  returnRequired: boolean;
  args: GraphQLField[];
}

export interface GqlTemplateData {
  spec: GraphQLSpec;
  queries: GraphQLOperation[];
  mutations: GraphQLOperation[];
  subscriptions: GraphQLOperation[];
  types: GraphQLType[];
  enums: GraphQLEnum[];
  inputs: GraphQLInput[];
  typeMap: LanguageTypeMap;
  naming: NamingConventions;
  packageName: string;
  version: string;
  endpoint: string;
  clientClass: string;
  mapGqlType: (gqlType: string, required: boolean, isList: boolean) => string;
  operations: OperationMeta[];
  enumNames: Set<string>;
  inputNames: Set<string>;
  typesByName: Map<string, GraphQLType>;
  mapSchemaField: (field: GraphQLField) => string;
  mapInputField: (field: GraphQLField) => string;
  resolveType: (gqlType: string) => string;
  isScalarType: (typeName: string) => boolean;
  scalarEntries: Array<[string, string]>;
}

export interface GqlLanguageConfig {
  language: string;
  fileExtension: string;
  typeMap: LanguageTypeMap;
  naming: NamingConventions;
  gqlTypeMap: Record<string, string>;
  packageFiles: (data: GqlTemplateData) => GeneratedFile[];
  nullableWrapper?: (type: string) => string;
  inputNullableWrapper?: (type: string) => string;
  listWrapper?: (type: string) => string;
}

const GQL_SCALARS = new Set(['ID', 'String', 'Int', 'Float', 'Boolean']);
const SCALAR_ORDER = ['ID', 'String', 'Boolean', 'Int', 'Float'];

export class GqlTemplateEngine {
  async generate(
    spec: GraphQLSpec,
    packageName: string,
    version: string,
    langConfig: GqlLanguageConfig,
    sourceTitle?: string,
    options?: TemplateRenderOptions,
  ): Promise<GeneratedFile[]> {
    const files: GeneratedFile[] = [];
    const renderer = createLanguageTemplateRenderer(langConfig.language, options);

    const enumNames = new Set(spec.enums.map((e) => e.name));
    const inputNames = new Set(spec.inputs.map((i) => i.name));
    const typesByName = new Map(spec.types.map((t) => [t.name, t]));
    const customScalars = new Set(spec.scalars ?? []);

    const isScalarType = (name: string): boolean =>
      GQL_SCALARS.has(name) || customScalars.has(name);

    const resolveType = (gqlType: string): string =>
      customScalars.has(gqlType)
        ? langConfig.typeMap.any
        : (langConfig.gqlTypeMap[gqlType] ?? gqlType);

    const nullable = langConfig.nullableWrapper ?? langConfig.typeMap.nullable;
    const inputNullable = langConfig.inputNullableWrapper ?? nullable;
    const list = langConfig.listWrapper ?? langConfig.typeMap.array;

    const mapGqlType = (gqlType: string, required: boolean, isList: boolean): string => {
      const mapped = resolveType(gqlType);
      const withList = isList ? langConfig.typeMap.array(mapped) : mapped;
      return required ? withList : langConfig.typeMap.nullable(withList);
    };

    const mapSchemaField = (field: GraphQLField): string => {
      const base = resolveType(field.type);
      if (field.isList) {
        const innerReq = /\w+!\]/.test(field.typeRaw);
        const inner = innerReq ? base : nullable(base);
        const arr = list(inner);
        return field.required ? arr : nullable(arr);
      }
      return field.required ? base : nullable(base);
    };

    const mapInputField = (field: GraphQLField): string => {
      const base = resolveType(field.type);
      if (field.isList) {
        const innerReq = /\w+!\]/.test(field.typeRaw);
        const inner = innerReq ? base : inputNullable(base);
        const arr = list(inner);
        return field.required ? arr : inputNullable(arr);
      }
      return field.required ? base : inputNullable(base);
    };

    const mapReturnType = (op: GraphQLOperation): string => {
      const base = resolveType(op.returnType);
      const raw = op.returnTypeRaw.trim();
      const required = raw.endsWith('!');
      if (raw.replace(/!$/, '').startsWith('[')) {
        const innerReq = /\w+!\]/.test(raw);
        const inner = innerReq ? base : nullable(base);
        const arr = list(inner);
        return required ? arr : nullable(arr);
      }
      return required ? base : nullable(base);
    };

    const buildFieldSelection = (
      typeName: string,
      indent: number,
      visited: Set<string> = new Set(),
      depth = 0,
    ): string => {
      const type = typesByName.get(typeName);
      if (!type || visited.has(typeName)) return `${'  '.repeat(indent)}__typename`;
      visited.add(typeName);
      const pad = '  '.repeat(indent);
      const lines: string[] = [];
      // Default documents are runnable examples, not exhaustive schema dumps.
      // Bound breadth and depth so cyclic graphs cannot expand exponentially.
      for (const field of type.fields.slice(0, 12)) {
        if (isScalarType(field.type) || enumNames.has(field.type)) {
          lines.push(`${pad}${field.name}`);
        } else if (typesByName.has(field.type)) {
          const sub =
            depth >= 1 || visited.has(field.type)
              ? `${'  '.repeat(indent + 1)}__typename`
              : buildFieldSelection(field.type, indent + 1, new Set(visited), depth + 1);
          if (sub) {
            lines.push(`${pad}${field.name} {`);
            lines.push(sub);
            lines.push(`${pad}}`);
          }
        }
      }
      return lines.length > 0 ? lines.join('\n') : `${pad}__typename`;
    };

    const buildDocument = (op: GraphQLOperation, kind: string): string => {
      const name = toPascalCase(op.name);
      const vars = op.args.map((a) => `$${a.name}: ${a.typeRaw}`).join(', ');
      const passArgs = op.args.map((a) => `${a.name}: $${a.name}`).join(', ');
      const varsPart = vars ? `(${vars})` : '';
      const argsPart = passArgs ? `(${passArgs})` : '';
      const returnType = op.returnType;
      let selectionPart: string;
      if (isScalarType(returnType) || enumNames.has(returnType)) {
        selectionPart = '';
      } else if (typesByName.has(returnType)) {
        const fields = buildFieldSelection(returnType, 3);
        selectionPart = fields ? ` {\n${fields}\n    }` : '';
      } else {
        selectionPart = '';
      }
      return `${kind.toLowerCase()} ${name}${varsPart} {\n    ${op.name}${argsPart}${selectionPart}\n  }`;
    };

    const buildOperations = (): OperationMeta[] => {
      const ops: OperationMeta[] = [];
      const process = (
        operations: GraphQLOperation[],
        kind: 'Query' | 'Mutation' | 'Subscription',
      ) => {
        for (const op of operations) {
          const typeName = toPascalCase(op.name);
          const returnRequired = op.returnTypeRaw.trim().endsWith('!');
          const docName = `${typeName}Document`;
          const doc = buildDocument(op, kind);
          ops.push({
            name: op.name,
            typeName,
            kind,
            resultTypeName: `${typeName}${kind}`,
            variablesTypeName: `${typeName}${kind}Variables`,
            documentName: docName,
            documentConstName: docName.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase(),
            document: doc,
            documentEscaped: doc.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n'),
            allArgsOptional: op.args.length === 0 || op.args.every((a) => !a.required),
            hasArgs: op.args.length > 0,
            returnTypeName: op.returnType,
            returnTypeStr: mapReturnType(op),
            returnRequired,
            args: op.args,
          });
        }
      };
      process(spec.queries, 'Query');
      process(spec.mutations, 'Mutation');
      process(spec.subscriptions, 'Subscription');
      return ops;
    };

    const scalarEntries = [
      ...SCALAR_ORDER.filter((s) => s in langConfig.gqlTypeMap).map(
        (s) => [s, langConfig.gqlTypeMap[s]] as [string, string],
      ),
      ...Array.from(customScalars).map(
        (scalar) => [scalar, langConfig.typeMap.any] as [string, string],
      ),
    ];

    const data: GqlTemplateData = {
      spec,
      queries: spec.queries,
      mutations: spec.mutations,
      subscriptions: spec.subscriptions,
      types: spec.types,
      enums: spec.enums,
      inputs: spec.inputs,
      typeMap: langConfig.typeMap,
      naming: langConfig.naming,
      packageName,
      version,
      endpoint: spec.endpoint,
      clientClass: titleToPascalCase(sourceTitle ?? 'Gql'),
      mapGqlType,
      operations: buildOperations(),
      enumNames,
      inputNames,
      typesByName,
      mapSchemaField,
      mapInputField,
      resolveType,
      isScalarType,
      scalarEntries,
    };
    const sourceDir = langConfig.language === 'go' ? 'src/graphql' : 'src';

    const clientContent =
      renderer.render('graphql/client', data) ?? renderer.render('gql-client', data);
    if (clientContent !== null) {
      files.push({
        path: `${sourceDir}/gql-client${langConfig.fileExtension}`,
        content: clientContent,
        overwrite: true,
      });
    }

    const typesContent =
      renderer.render('graphql/types', data) ?? renderer.render('gql-types', data);
    if (typesContent !== null) {
      files.push({
        path: `${sourceDir}/gql-types${langConfig.fileExtension}`,
        content: typesContent,
        overwrite: true,
      });
    }

    const queryBuilderContent =
      renderer.render('graphql/query-builder', data) ?? renderer.render('gql-query-builder', data);
    if (queryBuilderContent !== null) {
      files.push({
        path: `${sourceDir}/gql-query-builder${langConfig.fileExtension}`,
        content: queryBuilderContent,
        overwrite: true,
      });
    }

    files.push(...langConfig.packageFiles(data));
    return applyFileTemplateOverrides(files, renderer, data, 'graphql');
  }
}

export function createGqlPluginForLanguage(language: string): GqlLanguageConfig | null {
  const configs: Record<string, () => GqlLanguageConfig> = {
    typescript: () => ({
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
      gqlTypeMap: {
        ID: 'string',
        String: 'string',
        Int: 'number',
        Float: 'number',
        Boolean: 'boolean',
      },
      nullableWrapper: (t) => `Maybe<${t}>`,
      inputNullableWrapper: (t) => `InputMaybe<${t}>`,
      listWrapper: (t) => `Array<${t}>`,
      packageFiles: (data) => [
        {
          path: 'package.json',
          content:
            JSON.stringify(
              {
                name: data.packageName,
                version: data.version,
                type: 'module',
                main: './dist/gql-client.js',
                devDependencies: { typescript: '^5.8.0' },
              },
              null,
              2,
            ) + '\n',
          overwrite: true,
        },
      ],
    }),
    python: () => ({
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
      gqlTypeMap: { ID: 'str', String: 'str', Int: 'int', Float: 'float', Boolean: 'bool' },
      packageFiles: (data) => {
        const deps = ['"httpx>=0.27.0"'];
        if (data.subscriptions.length > 0) deps.push('"websockets>=12.0"');
        return [
          {
            path: 'setup.py',
            content: `from setuptools import setup\nsetup(name="${data.packageName}", version="${data.version}", install_requires=[${deps.join(', ')}])\n`,
            overwrite: true,
          },
        ];
      },
    }),
    go: () => ({
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
      gqlTypeMap: { ID: 'string', String: 'string', Int: 'int', Float: 'float64', Boolean: 'bool' },
      packageFiles: (data) => [
        { path: 'go.mod', content: `module ${data.packageName}\n\ngo 1.21\n`, overwrite: true },
      ],
    }),
    java: () => ({
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
      gqlTypeMap: {
        ID: 'String',
        String: 'String',
        Int: 'Integer',
        Float: 'Double',
        Boolean: 'Boolean',
      },
      packageFiles: (data) => [
        {
          path: 'pom.xml',
          content: `<project><modelVersion>4.0.0</modelVersion><groupId>${data.packageName}</groupId><artifactId>${data.packageName}-gql</artifactId><version>${data.version}</version><dependencies><dependency><groupId>com.google.code.gson</groupId><artifactId>gson</artifactId><version>2.11.0</version></dependency></dependencies></project>\n`,
          overwrite: true,
        },
      ],
    }),
    kotlin: () => ({
      language: 'kotlin',
      fileExtension: '.kt',
      typeMap: {
        string: 'String',
        integer: 'Int',
        number: 'Double',
        boolean: 'Boolean',
        array: (i) => `List<${i}>`,
        object: 'Map<String, kotlinx.serialization.json.JsonElement>',
        map: (v) => `Map<String, ${v}>`,
        any: 'kotlinx.serialization.json.JsonElement',
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
      gqlTypeMap: {
        ID: 'String',
        String: 'String',
        Int: 'Int',
        Float: 'Double',
        Boolean: 'Boolean',
      },
      packageFiles: (data) => [
        {
          path: 'build.gradle.kts',
          content: `plugins { kotlin("jvm") version "2.1.0" }\nversion = "${data.version}"\nrepositories { mavenCentral() }\n`,
          overwrite: true,
        },
      ],
    }),
    ruby: () => ({
      language: 'ruby',
      fileExtension: '.rb',
      typeMap: {
        string: 'String',
        integer: 'Integer',
        number: 'Float',
        boolean: 'Boolean',
        array: () => `Array`,
        object: 'Hash',
        map: () => `Hash`,
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
      gqlTypeMap: {
        ID: 'String',
        String: 'String',
        Int: 'Integer',
        Float: 'Float',
        Boolean: 'Boolean',
      },
      packageFiles: () => [
        {
          path: 'Gemfile',
          content: `source "https://rubygems.org"\ngem "faraday"\n`,
          overwrite: true,
        },
      ],
    }),
    php: () => ({
      language: 'php',
      fileExtension: '.php',
      typeMap: {
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
      },
      naming: {
        className: toPascalCase,
        methodName: toCamelCase,
        fileName: toPascalCase,
        propertyName: toCamelCase,
        enumValue: toUpperSnakeCase,
        parameterName: toCamelCase,
      },
      gqlTypeMap: { ID: 'string', String: 'string', Int: 'int', Float: 'float', Boolean: 'bool' },
      packageFiles: (data) => [
        {
          path: 'composer.json',
          content:
            JSON.stringify(
              { name: data.packageName, require: { php: '>=8.1', 'guzzlehttp/guzzle': '^7.0' } },
              null,
              4,
            ) + '\n',
          overwrite: true,
        },
      ],
    }),
    csharp: () => ({
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
      gqlTypeMap: { ID: 'string', String: 'string', Int: 'int', Float: 'double', Boolean: 'bool' },
      packageFiles: (data) => [
        {
          path: `${toPascalCase(data.packageName)}.csproj`,
          content: `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework><Version>${data.version}</Version></PropertyGroup><ItemGroup><PackageReference Include="System.Text.Json" Version="9.0.0" /></ItemGroup></Project>\n`,
          overwrite: true,
        },
      ],
    }),
    rust: () => ({
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
      gqlTypeMap: { ID: 'String', String: 'String', Int: 'i64', Float: 'f64', Boolean: 'bool' },
      packageFiles: (data) => [
        {
          path: 'Cargo.toml',
          content: `[package]\nname = "${data.packageName}"\nversion = "${data.version}"\nedition = "2021"\n\n[dependencies]\nreqwest = { version = "0.12", features = ["json"] }\nserde = { version = "1", features = ["derive"] }\nserde_json = "1"\ntokio = { version = "1", features = ["full"] }\n`,
          overwrite: true,
        },
      ],
    }),
    cpp: () => ({
      language: 'cpp',
      fileExtension: '.hpp',
      typeMap: {
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
      },
      naming: {
        className: toPascalCase,
        methodName: toSnakeCase,
        fileName: toSnakeCase,
        propertyName: toSnakeCase,
        enumValue: toUpperSnakeCase,
        parameterName: toSnakeCase,
      },
      gqlTypeMap: {
        ID: 'std::string',
        String: 'std::string',
        Int: 'int64_t',
        Float: 'double',
        Boolean: 'bool',
      },
      packageFiles: () => [],
    }),
    c: () => ({
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
        nullable: (t) => (t.endsWith('*') ? t : `${t}`),
      },
      naming: {
        className: toPascalCase,
        methodName: toSnakeCase,
        fileName: toSnakeCase,
        propertyName: toSnakeCase,
        enumValue: toUpperSnakeCase,
        parameterName: toSnakeCase,
      },
      gqlTypeMap: { ID: 'char*', String: 'char*', Int: 'int64_t', Float: 'double', Boolean: 'int' },
      packageFiles: () => [],
    }),
  };

  const factory = configs[language];
  return factory ? factory() : null;
}
