import * as fs from 'node:fs';
import * as path from 'node:path';
import { NextResponse } from 'next/server';
import { Eta } from 'eta';
import * as yaml from 'js-yaml';
import type { ParsedSpec, Parameter, ResponseInfo, SchemaObject } from '@cortex/core';
import type { NamingConventions } from '@cortex/codegen';

interface ReadmeResourceOperation {
  name: string;
  method: string;
  path: string;
  summary?: string;
  pathParams: Array<{ originalName: string; name: string; type: string; required: boolean }>;
  queryParams: Array<{ originalName: string; name: string; type: string; required: boolean }>;
  hasBody: boolean;
  bodyType: string;
  responseType: string;
}

interface ReadmeResource {
  name: string;
  className: string;
  fileName: string;
  operations: ReadmeResourceOperation[];
}

interface ReadmeSchema {
  className: string;
  isEnum: boolean;
  properties: Array<{ name: string; type: string; required: boolean }>;
  enumValues: never[];
}

const LANGUAGES = [
  'typescript',
  'python',
  'go',
  'java',
  'kotlin',
  'ruby',
  'php',
  'csharp',
  'rust',
  'cpp',
  'c',
] as const;

const DISPLAY_NAMES: Record<string, string> = {
  typescript: 'TypeScript',
  python: 'Python',
  go: 'Go',
  java: 'Java',
  kotlin: 'Kotlin',
  ruby: 'Ruby',
  php: 'PHP',
  csharp: 'C#',
  rust: 'Rust',
  cpp: 'C++',
  c: 'C',
};

function findCodegenTemplatesDir(): string {
  const candidates = [
    path.resolve(process.cwd(), '..', 'codegen', 'src', 'languages'),
    path.resolve(process.cwd(), '..', 'codegen', 'dist', 'languages'),
    path.resolve(process.cwd(), 'node_modules', '@cortex', 'codegen', 'dist', 'languages'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return candidates[0];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lang = searchParams.get('lang');

  if (lang && !LANGUAGES.includes(lang as (typeof LANGUAGES)[number])) {
    return NextResponse.json({ error: 'Unknown language' }, { status: 400 });
  }

  const specPath =
    process.env.CORTEX_SPEC_PATH ||
    path.join(process.cwd(), '..', 'core', '__fixtures__', 'petstore.yaml');

  if (!fs.existsSync(specPath)) {
    return NextResponse.json({ error: 'Spec file not found' }, { status: 404 });
  }

  try {
    const {
      OpenAPIParser,
      toPascalCase,
      titleToPascalCase,
      toCamelCase,
      toSnakeCase,
      toKebabCase,
      toUpperSnakeCase,
      singularize,
    } = await import('@cortex/core');
    const { getLanguageNaming } = await import('@cortex/codegen');

    const parser = new OpenAPIParser();
    const spec = await parser.parse(specPath);
    const fallbackPkg = spec.info.title.toLowerCase().replace(/\s+/g, '-');
    const hasWs = !!(
      process.env.CORTEX_ASYNCAPI_PATH ||
      fs.existsSync(path.join(process.cwd(), '..', 'core', '__fixtures__', 'chat-asyncapi.yaml'))
    );
    const hasGql = !!(
      process.env.CORTEX_GRAPHQL_PATH ||
      fs.existsSync(path.join(process.cwd(), '..', 'core', '__fixtures__', 'petstore.graphql'))
    );
    const hasGrpc = !!(
      process.env.CORTEX_GRPC_PATH ||
      fs.existsSync(path.join(process.cwd(), '..', 'core', '__fixtures__', 'petstore.proto'))
    );

    const configPkgNames: Record<string, string> = {};
    const configSources: Array<Record<string, unknown>> = [];
    try {
      const configDir = path.dirname(specPath);
      for (const cfgName of ['cortex.config.yml', 'cortex.config.yaml', 'cortex.yml']) {
        const cfgPath = path.join(configDir, cfgName);
        if (fs.existsSync(cfgPath)) {
          const rawCfg = yaml.load(fs.readFileSync(cfgPath, 'utf-8')) as Record<string, unknown>;
          const sources = Array.isArray(rawCfg?.sources)
            ? (rawCfg.sources as Array<Record<string, unknown>>)
            : [];
          for (const src of sources) {
            const languages = Array.isArray(src.languages)
              ? (src.languages as Array<Record<string, unknown>>)
              : [];
            for (const langCfg of languages) {
              if (langCfg.package_name)
                configPkgNames[langCfg.language as string] = langCfg.package_name as string;
            }
          }
          configSources.push(...sources);
          break;
        }
      }
    } catch {}

    const templatesBase = findCodegenTemplatesDir();

    const langsToGenerate = lang ? [lang] : [...LANGUAGES];
    const results: Record<string, string> = {};

    for (const l of langsToGenerate) {
      const readmePath = path.join(templatesBase, l, 'templates', 'readme.ejs');
      if (!fs.existsSync(readmePath)) {
        results[l] = `# ${DISPLAY_NAMES[l]} SDK\n\nREADME template not found.`;
        continue;
      }

      try {
        const naming = getLanguageNaming(l);
        const template = fs.readFileSync(readmePath, 'utf-8');
        const langPkgName = configPkgNames[l] ?? `${fallbackPkg}-${l === 'csharp' ? 'dotnet' : l}`;

        const resources = buildResources(spec, naming, singularize);
        const schemas = buildSchemas(spec);

        const sources =
          configSources.length > 0
            ? configSources
            : [
                { title: 'REST API V1', type: 'openapi-spec', spec: specPath, languages: [] },
                ...(hasWs
                  ? [
                      {
                        title: 'WebSocket',
                        type: 'asyncapi-spec',
                        spec: 'asyncapi.yaml',
                        languages: [],
                      },
                    ]
                  : []),
                ...(hasGql
                  ? [
                      {
                        title: 'GraphQL',
                        type: 'graphql-spec',
                        spec: 'schema.graphql',
                        languages: [],
                      },
                    ]
                  : []),
                ...(hasGrpc
                  ? [{ title: 'gRPC', type: 'grpc-spec', spec: 'service.proto', languages: [] }]
                  : []),
              ];

        const openapiTitle =
          (sources.find((s: Record<string, unknown>) => s.type === 'openapi-spec')
            ?.title as string) ?? 'Api';
        const asyncapiTitle = sources.find(
          (s: Record<string, unknown>) => s.type === 'asyncapi-spec',
        )?.title as string | undefined;
        const graphqlTitle = sources.find((s: Record<string, unknown>) => s.type === 'graphql-spec')
          ?.title as string | undefined;
        const grpcTitle = sources.find((s: Record<string, unknown>) => s.type === 'grpc-spec')
          ?.title as string | undefined;

        const templateDir = path.join(templatesBase, l, 'templates');
        const eta = new Eta({
          autoEscape: false,
          autoTrim: false,
          views: templateDir,
          defaultExtension: '.ejs',
        });

        const templateData = {
          spec,
          config: {
            config: {
              organization: fallbackPkg,
              sources,
            },
            languageConfig: {
              language: l,
              package_name: langPkgName,
              output_dir: `./generated/${l}`,
            },
            naming,
          },
          resources,
          schemas,
          naming,
          clientClass: titleToPascalCase(openapiTitle),
          gqlClientClass: graphqlTitle ? titleToPascalCase(graphqlTitle) : undefined,
          wsClientClass: asyncapiTitle ? titleToPascalCase(asyncapiTitle) : undefined,
          grpcClientClass: grpcTitle ? titleToPascalCase(grpcTitle) : undefined,
          utils: {
            singularize,
            toPascalCase,
            toCamelCase,
            toSnakeCase,
            toKebabCase,
            toUpperSnakeCase,
          },
        };

        results[l] = eta.renderString(template, templateData);
      } catch (e) {
        results[l] =
          `# ${DISPLAY_NAMES[l]} SDK\n\nError rendering README: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    const { renderMarkdown } = await import('@/lib/markdown');
    const htmlResults: Record<string, string> = {};
    for (const [l, md] of Object.entries(results)) {
      htmlResults[l] = await renderMarkdown(md);
    }

    return NextResponse.json({
      languages: LANGUAGES.map((l) => ({ id: l, name: DISPLAY_NAMES[l] })),
      readmes: htmlResults,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate SDK READMEs' },
      { status: 500 },
    );
  }
}

function buildResources(spec: ParsedSpec, naming: NamingConventions, singularize: (s: string) => string): ReadmeResource[] {
  const resourceMap = new Map<string, ReadmeResourceOperation[]>();
  for (const op of spec.operations) {
    const resName = (op.extensions['resource'] as string) ?? op.resourceName;
    const ops = resourceMap.get(resName) ?? [];
    ops.push({
      name: naming.methodName((op.extensions['method-name'] as string) ?? op.operationId),
      method: op.method.toUpperCase(),
      path: op.path,
      summary: op.summary,
      pathParams: op.parameters
        .filter((p: Parameter) => p.in === 'path')
        .map((p: Parameter) => ({
          originalName: p.name,
          name: naming.parameterName(p.name),
          type: p.schema.type ?? 'string',
          required: p.required,
        })),
      queryParams: op.parameters
        .filter((p: Parameter) => p.in === 'query')
        .map((p: Parameter) => ({
          originalName: p.name,
          name: naming.parameterName(p.name),
          type: p.schema.type ?? 'string',
          required: p.required,
        })),
      hasBody: !!op.requestBody,
      bodyType: op.requestBody?.schema?.name ?? 'object',
      responseType:
        op.responses.find((r: ResponseInfo) => r.statusCode.startsWith('2'))?.schema?.name ??
        'void',
    });
    resourceMap.set(resName, ops);
  }
  return Array.from(resourceMap.entries()).map(([name, operations]) => ({
    name: naming.propertyName(name),
    className: naming.className(singularize(name)) + 'Resource',
    fileName: naming.fileName(name),
    operations,
  }));
}

function buildSchemas(spec: ParsedSpec): ReadmeSchema[] {
  const schemas: ReadmeSchema[] = [];
  for (const op of spec.operations) {
    if (op.requestBody?.schema?.properties) {
      const s = op.requestBody.schema;
      schemas.push({
        className: s.name ?? 'RequestBody',
        isEnum: false,
        properties: Object.entries(s.properties!).map(([name, prop]: [string, SchemaObject]) => ({
          name,
          type: prop.type ?? 'string',
          required: s.required?.includes(name) ?? false,
        })),
        enumValues: [],
      });
    }
    for (const resp of op.responses) {
      if (resp.schema?.properties) {
        schemas.push({
          className: resp.schema.name ?? 'Response',
          isEnum: false,
          properties: Object.entries(resp.schema.properties).map(
            ([name, prop]: [string, SchemaObject]) => ({
              name,
              type: prop.type ?? 'string',
              required: resp.schema!.required?.includes(name) ?? false,
            }),
          ),
          enumValues: [],
        });
      }
    }
  }
  const seen = new Set<string>();
  return schemas.filter((s) => {
    if (seen.has(s.className)) return false;
    seen.add(s.className);
    return true;
  });
}
