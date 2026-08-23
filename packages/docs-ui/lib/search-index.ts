import MiniSearch from 'minisearch';

export interface SearchDocument {
  id: string;
  title: string;
  description: string;
  keywords: string;
  group: string;
  badge?: string;
  breadcrumb: string;
  resultType: string;
  method?: string;
  source: string;
}

const STORED_FIELDS = [
  'id',
  'title',
  'description',
  'group',
  'badge',
  'breadcrumb',
  'resultType',
  'method',
  'source',
] as const;

export function createSearchIndex(documents: SearchDocument[]): MiniSearch {
  const index = new MiniSearch({
    fields: ['title', 'description', 'keywords'],
    storeFields: [...STORED_FIELDS],
    searchOptions: {
      boost: { title: 5, description: 2, keywords: 1 },
      prefix: true,
      fuzzy: 0.2,
    },
    tokenize: (text: string) =>
      text
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[_\-/.{}]/g, ' ')
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean),
  });
  index.addAll(documents);
  return index;
}

export function searchIndex(index: MiniSearch, query: string, limit = 50): SearchDocument[] {
  if (!query.trim()) return [];
  return index
    .search(query, {
      prefix: true,
      fuzzy: 0.2,
      combineWith: 'OR',
    })
    .slice(0, limit) as unknown as SearchDocument[];
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildSearchDocuments(sdkData: any, mcpData: any, docsData: any): SearchDocument[] {
  const docs: SearchDocument[] = [];

  if (sdkData) {
    for (const res of sdkData.resources ?? []) {
      for (const op of res.operations ?? []) {
        docs.push({
          id: `rest-${op.operationId}`,
          title: op.summary || `${op.method} ${op.path}`,
          description: op.summary ?? '',
          keywords: [
            op.operationId,
            op.method,
            op.path,
            res.name,
            ...(op.pathParams?.map((p: any) => p.name) ?? []),
            ...(op.queryParams?.map((p: any) => p.name) ?? []),
            op.bodyTypeName,
            op.responseTypeName,
          ]
            .filter(Boolean)
            .join(' '),
          group: 'REST',
          badge: op.method,
          breadcrumb: `API Reference › ${res.name} › ${op.method} ${op.path}`,
          resultType: 'Endpoint',
          method: op.method,
          source: 'REST',
        });
      }
    }

    if (sdkData.graphql) {
      for (const q of sdkData.graphql.queries ?? []) {
        const name = typeof q === 'string' ? q : q.name;
        const desc = typeof q === 'string' ? '' : (q.description ?? '');
        const args = typeof q === 'string' ? '' : (q.args?.map((a: any) => a.name).join(' ') ?? '');
        docs.push({
          id: `gql-q-${name}`,
          title: name,
          description: desc,
          keywords: args,
          group: 'GraphQL',
          badge: 'query',
          breadcrumb: `GraphQL › Query`,
          resultType: 'Query',
          source: 'GraphQL',
        });
      }
      for (const m of sdkData.graphql.mutations ?? []) {
        const name = typeof m === 'string' ? m : m.name;
        const desc = typeof m === 'string' ? '' : (m.description ?? '');
        const args = typeof m === 'string' ? '' : (m.args?.map((a: any) => a.name).join(' ') ?? '');
        docs.push({
          id: `gql-m-${name}`,
          title: name,
          description: desc,
          keywords: args,
          group: 'GraphQL',
          badge: 'mutation',
          breadcrumb: `GraphQL › Mutation`,
          resultType: 'Mutation',
          source: 'GraphQL',
        });
      }
      for (const s of sdkData.graphql.subscriptions ?? []) {
        const name = typeof s === 'string' ? s : s.name;
        const desc = typeof s === 'string' ? '' : (s.description ?? '');
        docs.push({
          id: `gql-s-${name}`,
          title: name,
          description: desc,
          keywords: '',
          group: 'GraphQL',
          badge: 'subscription',
          breadcrumb: `GraphQL › Subscription`,
          resultType: 'Subscription',
          source: 'GraphQL',
        });
      }
    }

    if (sdkData.websocket) {
      for (const ch of sdkData.websocket.channels ?? []) {
        docs.push({
          id: `ws-${ch.name}`,
          title: ch.name,
          description: ch.description ?? '',
          keywords: [ch.subscribeMessageName, ch.publishMessageName].filter(Boolean).join(' '),
          group: 'WebSocket',
          breadcrumb: `WebSocket`,
          resultType: 'Channel',
          source: 'WebSocket',
        });
      }
    }

    if (sdkData.openrpc) {
      for (const m of sdkData.openrpc.methods ?? []) {
        const tag = m.tags?.[0] ?? 'OpenRPC';
        docs.push({
          id: `openrpc-${m.name}`,
          title: m.name,
          description: m.summary ?? m.description ?? '',
          keywords: [...(m.params?.map((p: any) => p.name) ?? []), m.resultType, ...m.tags]
            .filter(Boolean)
            .join(' '),
          group: 'OpenRPC',
          breadcrumb: `OpenRPC › ${tag}`,
          resultType: 'Method',
          source: 'OpenRPC',
        });
      }
    }
  }

  if (docsData) {
    for (const section of docsData.sections ?? []) {
      for (const doc of section.documents ?? []) {
        docs.push({
          id: `docs-${doc.slug}`,
          title: doc.title,
          description: doc.content ? stripHtml(doc.content).slice(0, 500) : '',
          keywords: section.section,
          group: `Docs: ${section.section}`,
          breadcrumb: `Docs › ${section.section}`,
          resultType: 'Guide',
          source: 'Docs',
        });
      }
    }
  }

  return docs;
}
