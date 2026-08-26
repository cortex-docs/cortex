import * as fs from 'node:fs';
import * as path from 'node:path';

interface NamedSource {
  title: string;
}

interface RestSource extends NamedSource {
  resources: Array<{ operations: Array<{ operationId: string }> }>;
}

interface WebSocketSource extends NamedSource {
  channels: Array<{ name: string }>;
}

interface GraphQlSource extends NamedSource {
  queries: Array<{ name: string }>;
  mutations: Array<{ name: string }>;
  subscriptions: Array<{ name: string }>;
}

interface GrpcSource extends NamedSource {
  services: Array<{ name: string; methods: Array<{ name: string }> }>;
}

interface OpenRpcSource extends NamedSource {
  methods: Array<{ name: string }>;
}

interface ReferenceData {
  restSources?: RestSource[];
  websocketSources?: WebSocketSource[];
  graphqlSources?: GraphQlSource[];
  grpcSources?: GrpcSource[];
  openrpcSources?: OpenRpcSource[];
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function referenceParam(source: NamedSource, operation: string): { slug: string[] } {
  return {
    slug: [slugify(source.title), ...operation.split('/').filter(Boolean)],
  };
}

export async function apiReferenceStaticParams(): Promise<Array<{ slug: string[] }>> {
  const { GET } = await import('@/app/api/sdk-snippets/route');
  const response = await GET();
  if (!response.ok) return [];

  const data = (await response.json()) as ReferenceData;
  return [
    ...(data.restSources ?? []).flatMap((source) =>
      source.resources.flatMap((resource) =>
        resource.operations.map((operation) => referenceParam(source, operation.operationId)),
      ),
    ),
    ...(data.websocketSources ?? []).flatMap((source) =>
      source.channels.map((channel) => referenceParam(source, channel.name)),
    ),
    ...(data.graphqlSources ?? []).flatMap((source) =>
      [...source.queries, ...source.mutations, ...source.subscriptions].map((operation) =>
        referenceParam(source, operation.name),
      ),
    ),
    ...(data.grpcSources ?? []).flatMap((source) =>
      source.services.flatMap((service) =>
        service.methods.map((method) => referenceParam(source, `${service.name}.${method.name}`)),
      ),
    ),
    ...(data.openrpcSources ?? []).flatMap((source) =>
      source.methods.map((method) => referenceParam(source, method.name)),
    ),
  ];
}

export async function mcpStaticParams(): Promise<Array<{ tool: string }>> {
  const { GET } = await import('@/app/api/mcp/route');
  const response = await GET();
  if (!response.ok) return [];

  const data = (await response.json()) as { tools?: Array<{ name: string }> };
  return (data.tools ?? []).map((tool) => ({ tool: tool.name }));
}

export function projectAssetStaticParams(): Array<{ path: string[] }> {
  const configPath = process.env.CORTEX_CONFIG_PATH;
  if (!configPath) return [];

  const assetsRoot = path.join(path.dirname(configPath), 'assets');
  if (!fs.existsSync(assetsRoot)) return [];

  const params: Array<{ path: string[] }> = [];
  const visit = (directory: string, segments: string[]) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entrySegments = [...segments, entry.name];
      if (entry.isDirectory()) visit(path.join(directory, entry.name), entrySegments);
      else if (entry.isFile()) params.push({ path: entrySegments });
    }
  };
  visit(assetsRoot, []);
  return params;
}
