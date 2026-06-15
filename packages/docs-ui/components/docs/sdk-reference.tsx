'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProjectWatch } from '@/lib/use-project-watch';
import hljs from 'highlight.js/lib/core';
import hljsTypescript from 'highlight.js/lib/languages/typescript';
import hljsPython from 'highlight.js/lib/languages/python';
import hljsGo from 'highlight.js/lib/languages/go';
import hljsJava from 'highlight.js/lib/languages/java';
import hljsKotlin from 'highlight.js/lib/languages/kotlin';
import hljsRuby from 'highlight.js/lib/languages/ruby';
import hljsPhp from 'highlight.js/lib/languages/php';
import hljsCsharp from 'highlight.js/lib/languages/csharp';
import hljsRust from 'highlight.js/lib/languages/rust';
import hljsCpp from 'highlight.js/lib/languages/cpp';
import hljsC from 'highlight.js/lib/languages/c';
import hljsJson from 'highlight.js/lib/languages/json';
import { cn } from '@/lib/utils';
import { TryNowModal } from './try-now-modal';
import { DocsBreadcrumb } from './docs-breadcrumb';

hljs.registerLanguage('typescript', hljsTypescript);
hljs.registerLanguage('python', hljsPython);
hljs.registerLanguage('go', hljsGo);
hljs.registerLanguage('java', hljsJava);
hljs.registerLanguage('kotlin', hljsKotlin);
hljs.registerLanguage('ruby', hljsRuby);
hljs.registerLanguage('php', hljsPhp);
hljs.registerLanguage('csharp', hljsCsharp);
hljs.registerLanguage('rust', hljsRust);
hljs.registerLanguage('cpp', hljsCpp);
hljs.registerLanguage('c', hljsC);
hljs.registerLanguage('json', hljsJson);

const HLJS_LANG_MAP: Record<string, string> = {
  typescript: 'typescript', python: 'python', go: 'go', java: 'java',
  kotlin: 'kotlin', ruby: 'ruby', php: 'php', csharp: 'csharp',
  rust: 'rust', cpp: 'cpp', c: 'c', json: 'json',
};

function HighlightedCode({ code, language }: { code: string; language: string }) {
  const html = useMemo(() => {
    const lang = HLJS_LANG_MAP[language];
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value;
    }
    return hljs.highlightAuto(code).value;
  }, [code, language]);

  return <code dangerouslySetInnerHTML={{ __html: html }} />;
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const lines = code.split('\n');
  const lineCount = lines.length;
  const gutterWidth = String(lineCount).length;

  const html = useMemo(() => {
    const lang = HLJS_LANG_MAP[language];
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value;
    }
    return hljs.highlightAuto(code).value;
  }, [code, language]);

  const highlightedLines = html.split('\n');

  return (
    <div>
      <div className="p-3 font-mono text-xs leading-5 text-foreground">
        <table className="border-collapse">
          <tbody>
            {highlightedLines.map((line, i) => (
              <tr key={i}>
                <td className="select-none pr-3 text-right text-muted-foreground/40 align-top" style={{ minWidth: `${gutterWidth + 1}ch` }}>
                  {i + 1}
                </td>
                <td className="whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{ __html: line || '&nbsp;' }} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import {
  SUPPORTED_LANGUAGES,
  LANGUAGE_DISPLAY_NAMES,
} from '@/lib/snippet-generator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const LANG_COLORS: Record<string, string> = {
  typescript: 'text-[#3178c6]', python: 'text-[#3776ab]', go: 'text-[#00add8]',
  java: 'text-[#f89820]', kotlin: 'text-[#7f52ff]', ruby: 'text-[#cc342d]',
  php: 'text-[#777bb4]', csharp: 'text-[#68217a]', rust: 'text-[#dea584]',
  cpp: 'text-[#00599c]', c: 'text-[#a8b9cc]',
};
const LANG_ICONS: Record<string, string> = {
  typescript: 'TS', python: 'PY', go: 'GO', java: 'JV', kotlin: 'KT',
  ruby: 'RB', php: 'PHP', csharp: 'C#', rust: 'RS', cpp: 'C++', c: 'C',
};

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface OperationNames {
  methodName: string;
  resourceAccess: string;
  bodyType: string;
  responseType: string;
}

interface BodyProperty {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  nullable?: boolean;
  children?: BodyProperty[];
}

interface PathParam {
  name: string;
  type: string;
  description?: string;
}

interface QueryParam {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

interface ResponseExample {
  statusCode: string;
  description: string;
  typeName: string;
  example: unknown;
  properties?: BodyProperty[];
}

interface Operation {
  operationId: string;
  method: string;
  path: string;
  summary?: string;
  pathParams: PathParam[];
  queryParams: QueryParam[];
  headerParams: QueryParam[];
  hasBody: boolean;
  bodyTypeName: string;
  bodyProperties: BodyProperty[];
  responseTypeName: string;
  responses?: ResponseExample[];
  names: Record<string, OperationNames>;
}

interface Resource {
  name: string;
  operations: Operation[];
}

interface WsMessage {
  name?: string;
  description?: string;
  properties?: BodyProperty[];
}

interface WsChannel {
  name: string;
  description?: string;
  hasSubscribe: boolean;
  hasPublish: boolean;
  subscribeMessageName?: string;
  publishMessageName?: string;
  subscribeMessage?: WsMessage;
  publishMessage?: WsMessage;
}

interface GqlField {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  children?: GqlField[];
}

interface GqlOperation {
  name: string;
  description?: string;
  args: GqlField[];
  returnType: string;
}

interface GrpcMethod {
  name: string;
  description?: string;
  inputType: string;
  outputType: string;
  serverStreaming: boolean;
  clientStreaming: boolean;
  inputFields?: BodyProperty[];
  outputFields?: BodyProperty[];
}

interface GrpcService {
  name: string;
  description?: string;
  methods: GrpcMethod[];
}

interface SdkSnippetsData {
  title: string;
  version: string;
  description: string;
  baseUrl: string;
  packageName: string;
  packageNames?: Record<string, string>;
  languages: string[];
  snippets?: Record<string, Record<string, string>>;
  resources: Resource[];
  sourceTitles: {
    rest: string[];
    websocket: string[];
    graphql: string[];
    grpc: string[];
  };
  websocket?: {
    url: string;
    channels: WsChannel[];
  };
  graphql?: {
    queries: GqlOperation[];
    mutations: GqlOperation[];
    subscriptions: GqlOperation[];
  };
  grpc?: {
    services: GrpcService[];
  };
  sourceIntros?: {
    rest?: string;
    websocket?: string;
    graphql?: string;
    grpc?: string;
  };
  securitySchemes?: SecurityScheme[];
  globalSecurity?: Array<Record<string, string[]>>;
}

interface SecurityScheme {
  name: string;
  type: string;
  scheme?: string;
  bearerFormat?: string;
  description?: string;
  in?: string;
  paramName?: string;
  openIdConnectUrl?: string;
  flows?: Record<string, { authorizationUrl?: string; tokenUrl?: string; scopes?: Record<string, string> }>;
}

type VisibleItem = {
  id: string;
  kind: 'rest' | 'ws' | 'gql' | 'grpc';
  label: string;
  displayName: string;
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  POST: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  PUT: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  PATCH: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  DELETE: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

function methodColor(method: string) {
  return METHOD_COLORS[method.toUpperCase()] ?? 'bg-muted text-muted-foreground';
}

function cardId(kind: string, name: string) {
  return `sdk-${kind}-${name}`;
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function ParamTable({
  params,
  locationLabel,
}: {
  params: Array<{ name: string; type: string; required?: boolean; description?: string; children?: BodyProperty[] }>;
  locationLabel?: string;
}) {
  if (params.length === 0) return null;
  return (
    <div className="mt-2 divide-y">
      {params.map((p) => (
        <ParamRow key={p.name} param={p} locationLabel={locationLabel} />
      ))}
    </div>
  );
}

function ParamRow({
  param,
  locationLabel,
  depth = 0,
}: {
  param: { name: string; type: string; required?: boolean; description?: string; children?: BodyProperty[] };
  locationLabel?: string;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = param.children && param.children.length > 0;

  return (
    <div>
      <div className="py-2.5" style={depth > 0 ? { paddingLeft: `${depth * 16}px` } : undefined}>
        <div className="flex items-center gap-2">
          <code className="font-mono text-xs font-semibold">{param.name}</code>
          <span className="text-xs text-muted-foreground">{param.type}</span>
          {'required' in param && param.required ? (
            <span className="text-xs font-medium text-red-500 dark:text-red-400">Required</span>
          ) : (
            <span className="text-xs text-muted-foreground">Optional</span>
          )}
          {locationLabel && (
            <span className="ml-auto text-xs text-muted-foreground">{locationLabel}</span>
          )}
        </div>
        {param.description && (
          <p className="mt-1 text-xs text-muted-foreground">{param.description}</p>
        )}
        {hasChildren && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-1.5 flex cursor-pointer items-center gap-1.5 rounded-lg border border-border/50 bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground transition-all hover:bg-muted/60 hover:text-foreground hover:border-border"
          >
            <span className="text-[10px]">{expanded ? '−' : '+'}</span>
            {expanded ? 'Hide' : `Show ${param.children!.length}`} {param.children!.length === 1 ? 'property' : 'properties'}
          </button>
        )}
      </div>
      {expanded && hasChildren && (
        <div className="border-l ml-3">
          {param.children!.map((child) => (
            <ParamRow key={child.name} param={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      title="Copy to clipboard"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Response panel                                                      */
/* ------------------------------------------------------------------ */

const STATUS_COLORS: Record<string, string> = {
  '2': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  '3': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  '4': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  '5': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

function statusColor(code: string) {
  return STATUS_COLORS[code[0]] ?? 'bg-muted text-muted-foreground';
}

function ResponsePanel({ responses }: { responses: ResponseExample[] }) {
  const [selected, setSelected] = useState(0);

  useEffect(() => { setSelected(0); }, [responses]);

  if (!responses || responses.length === 0) return null;

  const active = responses[selected];
  const json = active?.example != null ? JSON.stringify(active.example, null, 2) : null;

  return (
    <div className="flex flex-col glass-card rounded-xl">
      {/* Status code tabs */}
      <div className="flex shrink-0 items-center gap-1 px-3 py-2">
        {responses.map((r, i) => (
          <button
            key={r.statusCode}
            onClick={() => setSelected(i)}
            className={cn(
              'rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer',
              i === selected
                ? statusColor(r.statusCode)
                : 'text-muted-foreground hover:text-foreground hover:bg-muted',
            )}
          >
            {r.statusCode}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">{active.description}</span>
      </div>

      {/* JSON example */}
      {json && (
        <div className="border-t bg-muted/30">
          <CodeBlock code={json} language="json" />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Center-panel response properties                                    */
/* ------------------------------------------------------------------ */

function OperationResponses({ responses }: { responses: ResponseExample[] }) {
  const [selected, setSelected] = useState(0);
  const active = responses[selected];

  return (
    <div>
      <div className="flex items-center gap-2">
        <h4 className="text-xs font-semibold uppercase text-muted-foreground">Response</h4>
        {responses.map((r, i) => (
          <button
            key={r.statusCode}
            onClick={() => setSelected(i)}
            className={cn(
              'rounded-lg px-2 py-0.5 text-xs font-semibold transition-colors cursor-pointer',
              i === selected
                ? statusColor(r.statusCode)
                : 'text-muted-foreground hover:text-foreground hover:bg-muted',
            )}
          >
            {r.statusCode}
          </button>
        ))}
        {active.typeName && (
          <code className="ml-auto rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
            {active.typeName}
          </code>
        )}
      </div>
      {active.description && (
        <p className="mt-1 text-xs text-muted-foreground">{active.description}</p>
      )}
      {active.properties && active.properties.length > 0 && (
        <ParamTable params={active.properties} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Resize handle                                                       */
/* ------------------------------------------------------------------ */

function ResizeHandle({ side, onResize }: { side: 'left' | 'right'; onResize: (delta: number) => void }) {
  const dragging = useRef(false);
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    let startX = e.clientX;
    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      startX = ev.clientX;
      onResize(side === 'left' ? delta : -delta);
    };
    const onUp = () => {
      dragging.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [side, onResize]);

  return (
    <div
      onMouseDown={handleMouseDown}
      className="hidden lg:flex w-3 -mx-1 shrink-0 cursor-col-resize items-center justify-center group/handle z-10"
    >
      <div className="h-full w-px transition-colors group-hover/handle:bg-border group-active/handle:bg-primary/40" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export function SdkReference({ scrollTarget }: { scrollTarget?: string[] }) {
  const [data, setData] = useState<SdkSnippetsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string>('');
  const [language, setLanguage] = useState<string>('typescript');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tryNowOpen, setTryNowOpen] = useState(false);
  const [leftWidth, setLeftWidth] = useState(224);
  const [rightWidth, setRightWidth] = useState(420);

  const onResizeLeft = useCallback((delta: number) => {
    setLeftWidth((w) => Math.max(160, Math.min(400, w + delta)));
  }, []);
  const onResizeRight = useCallback((delta: number) => {
    setRightWidth((w) => Math.max(280, Math.min(600, w + delta)));
  }, []);

  const centerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const isScrollingRef = useRef(false);

  /* -- Fetch data -------------------------------------------------- */

  const fetchData = useCallback(() => {
    fetch('/api/sdk-snippets')
      .then(async (res) => {
        if (!res.ok) {
          setError('Failed to load SDK reference. Make sure a spec is configured.');
          return;
        }
        setData(await res.json());
      })
      .catch(() => setError('Failed to load SDK reference'));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useProjectWatch(fetchData);

  /* -- Restore language from localStorage -------------------------- */

  useEffect(() => {
    try {
      const stored = localStorage.getItem('cortex-sdk-lang');
      const validLangs = data?.languages ?? SUPPORTED_LANGUAGES;
      if (stored && (validLangs as readonly string[]).includes(stored)) {
        setLanguage(stored);
      }
    } catch {
      /* noop */
    }
  }, []);

  const selectLanguage = useCallback((lang: string) => {
    setLanguage(lang);
    try {
      localStorage.setItem('cortex-sdk-lang', lang);
    } catch {
      /* noop */
    }
  }, []);

  /* -- IntersectionObserver ----------------------------------------- */

  useEffect(() => {
    if (!data) return;

    observerRef.current?.disconnect();

    const visibleIds = new Set<string>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visibleIds.add(entry.target.id);
          } else {
            visibleIds.delete(entry.target.id);
          }
        }
        if (isScrollingRef.current) return;
        const container = centerRef.current;
        const nearBottom = container &&
          container.scrollHeight - container.scrollTop - container.clientHeight < 100;
        const cards = document.querySelectorAll('[data-sdk-card]');

        if (nearBottom && container) {
          const containerRect = container.getBoundingClientRect();
          for (let i = cards.length - 1; i >= 0; i--) {
            const rect = cards[i].getBoundingClientRect();
            if (rect.top < containerRect.bottom && rect.bottom > containerRect.top) {
              setActiveId(cards[i].id);
              return;
            }
          }
        }

        for (const card of cards) {
          if (visibleIds.has(card.id)) {
            setActiveId(card.id);
            return;
          }
        }
      },
      { rootMargin: '-60px 0px -40% 0px', threshold: 0.1 },
    );

    observerRef.current = observer;

    requestAnimationFrame(() => {
      document.querySelectorAll('[data-sdk-card]').forEach((el) => observer.observe(el));
    });

    return () => observer.disconnect();
  }, [data]);

  /* -- Scroll to target from URL ----------------------------------- */

  useEffect(() => {
    if (!data || !scrollTarget || scrollTarget.length === 0) return;

    const sourceSlug = scrollTarget[0];
    const opSlug = scrollTarget[1];

    // Determine which kind this source is
    let kind: string | null = null;
    for (const t of data.sourceTitles.rest) {
      if (slugify(t) === sourceSlug) { kind = 'rest'; break; }
    }
    if (!kind) for (const t of data.sourceTitles.graphql) {
      if (slugify(t) === sourceSlug) { kind = 'gql'; break; }
    }
    if (!kind) for (const t of data.sourceTitles.websocket) {
      if (slugify(t) === sourceSlug) { kind = 'ws'; break; }
    }
    if (!kind) for (const t of data.sourceTitles.grpc) {
      if (slugify(t) === sourceSlug) { kind = 'grpc'; break; }
    }

    if (opSlug && kind) {
      const id = cardId(kind, opSlug);
      requestAnimationFrame(() => {
        const el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          setActiveId(id);
        }
      });
    }
  }, [data, scrollTarget]);

  /* -- Sync URL with active card ----------------------------------- */

  useEffect(() => {
    if (!data || !activeId) return;

    // Build URL from activeId
    let sourceSlug = '';
    let opSlug = '';

    if (activeId.startsWith('sdk-rest-')) {
      opSlug = activeId.replace('sdk-rest-', '');
      sourceSlug = slugify(data.sourceTitles.rest[0] ?? 'rest');
    } else if (activeId.startsWith('sdk-gql-')) {
      opSlug = activeId.replace('sdk-gql-', '');
      sourceSlug = slugify(data.sourceTitles.graphql[0] ?? 'graphql');
    } else if (activeId.startsWith('sdk-ws-')) {
      opSlug = activeId.replace('sdk-ws-', '');
      sourceSlug = slugify(data.sourceTitles.websocket[0] ?? 'websocket');
    } else if (activeId.startsWith('sdk-grpc-')) {
      opSlug = activeId.replace('sdk-grpc-', '');
      sourceSlug = slugify(data.sourceTitles.grpc[0] ?? 'grpc');
    }

    if (sourceSlug && opSlug) {
      const newPath = `/api-reference/${sourceSlug}/${opSlug}`;
      if (window.location.pathname !== newPath) {
        window.history.replaceState(null, '', newPath);
      }
    }
  }, [activeId, data]);

  /* -- Build flat list of items for navigation / snippet lookup ----- */

  const allItems: VisibleItem[] = [];
  if (data) {
    for (const res of data.resources) {
      for (const op of res.operations) {
        allItems.push({ id: cardId('rest', op.operationId), kind: 'rest', label: op.operationId, displayName: op.summary ?? op.operationId });
      }
    }
    if (data.graphql) {
      for (const q of data.graphql.queries) {
        allItems.push({ id: cardId('gql', q.name), kind: 'gql', label: q.name, displayName: q.name });
      }
      for (const m of data.graphql.mutations) {
        allItems.push({ id: cardId('gql', m.name), kind: 'gql', label: m.name, displayName: m.name });
      }
      for (const s of data.graphql.subscriptions) {
        allItems.push({ id: cardId('gql', s.name), kind: 'gql', label: s.name, displayName: s.name });
      }
    }
    if (data.websocket) {
      for (const ch of data.websocket.channels) {
        allItems.push({ id: cardId('ws', ch.name), kind: 'ws', label: ch.name, displayName: ch.name });
      }
    }
    if (data.grpc) {
      for (const svc of data.grpc.services) {
        for (const m of svc.methods) {
          allItems.push({ id: cardId('grpc', `${svc.name}.${m.name}`), kind: 'grpc', label: `${svc.name}.${m.name}`, displayName: m.name });
        }
      }
    }
  }

  /* -- Resolve current snippet -------------------------------------- */

  function getSnippet(): string {
    if (!data || !activeId) return '// Select an operation to see its SDK snippet';

    const activeItem = allItems.find((i) => i.id === activeId);
    if (!activeItem) return '// Select an operation to see its SDK snippet';

    // Snippets are rendered server-side from shared EJS templates
    if (data.snippets) {
      const kindPrefix = activeItem.kind === 'gql' ? 'gql' : activeItem.kind;
      const key = `${kindPrefix}:${activeItem.label}`;
      const serverSnippet = data.snippets[key]?.[language];
      if (serverSnippet) return serverSnippet;
    }

    return `// Loading ${activeItem.displayName} snippet...`;
  }

  function getActiveOperation(): Operation | null {
    if (!data) return null;
    const activeItem = allItems.find((i) => i.id === activeId);
    if (!activeItem || activeItem.kind !== 'rest') return null;
    for (const r of data.resources) {
      const op = r.operations.find((o) => o.operationId === activeItem.label);
      if (op) return op;
    }
    return null;
  }

  /* -- Scroll to card ----------------------------------------------- */

  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (el) {
      isScrollingRef.current = true;
      setActiveId(id);
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setSidebarOpen(false);
      setTimeout(() => { isScrollingRef.current = false; }, 800);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  if (error) {
    return (
      <div className="flex h-[50vh] items-center justify-center text-muted-foreground">
        <p>{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  const snippet = getSnippet();
  const activeItem = allItems.find((i) => i.id === activeId);

  const activeSection = activeId.startsWith('sdk-rest-') ? 'rest'
    : activeId.startsWith('sdk-gql-') ? 'gql'
    : activeId.startsWith('sdk-ws-') ? 'ws'
    : activeId.startsWith('sdk-grpc-') ? 'grpc'
    : 'rest';

  return (
    <div className="relative flex h-[calc(100vh-5.5rem)]">
      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed bottom-4 left-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg lg:hidden"
        aria-label="Toggle navigation"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {sidebarOpen ? (
            <path d="M18 6 6 18M6 6l12 12" />
          ) : (
            <>
              <path d="M4 6h16" />
              <path d="M4 12h16" />
              <path d="M4 18h16" />
            </>
          )}
        </svg>
      </button>

      {/* ---- Left sidebar ---- */}
      <aside
        className={cn(
          'fixed inset-y-22 left-0 z-40 shrink-0 overflow-y-auto border-r border-border/50 bg-muted/20 px-3 py-4 transition-transform lg:relative lg:inset-y-auto lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        style={{ width: leftWidth }}
      >


        {/* REST resources */}
        <NavSection
          title={data.sourceTitles?.rest?.[0] ?? 'REST'}
          expanded={activeSection === 'rest'}
          onClickHeader={() => {
            const first = allItems.find((i) => i.kind === 'rest');
            if (first) scrollTo(first.id);
          }}
        >
          {data.resources.map((res) => (
            <NavGroup key={res.name} label={res.name}>
              {res.operations.map((op) => {
                const id = cardId('rest', op.operationId);
                return (
                  <NavItem
                    key={id}
                    active={activeId === id}
                    onClick={() => scrollTo(id)}
                  >
                    <span className={cn('mr-1.5 inline-block w-9 shrink-0 rounded px-1 py-0.5 text-center text-[10px] font-bold uppercase leading-none', methodColor(op.method))}>
                      {op.method === 'DELETE' ? 'DEL' : op.method}
                    </span>
                    <span className="truncate">{op.summary ?? op.operationId}</span>
                  </NavItem>
                );
              })}
            </NavGroup>
          ))}
        </NavSection>

        {/* GraphQL */}
        {data.graphql && (
          <NavSection
            title={data.sourceTitles?.graphql?.[0] ?? 'GraphQL'}
            expanded={activeSection === 'gql'}
            onClickHeader={() => {
              const first = allItems.find((i) => i.kind === 'gql');
              if (first) scrollTo(first.id);
            }}
          >
            {data.graphql.queries.length > 0 && (
              <NavGroup label="Queries">
                {data.graphql.queries.map((q) => {
                  const id = cardId('gql', q.name);
                  return (
                    <NavItem key={id} active={activeId === id} onClick={() => scrollTo(id)}>
                      {q.name}
                    </NavItem>
                  );
                })}
              </NavGroup>
            )}
            {data.graphql.mutations.length > 0 && (
              <NavGroup label="Mutations">
                {data.graphql.mutations.map((m) => {
                  const id = cardId('gql', m.name);
                  return (
                    <NavItem key={id} active={activeId === id} onClick={() => scrollTo(id)}>
                      {m.name}
                    </NavItem>
                  );
                })}
              </NavGroup>
            )}
            {data.graphql.subscriptions.length > 0 && (
              <NavGroup label="Subscriptions">
                {data.graphql.subscriptions.map((s) => {
                  const id = cardId('gql', s.name);
                  return (
                    <NavItem key={id} active={activeId === id} onClick={() => scrollTo(id)}>
                      {s.name}
                    </NavItem>
                  );
                })}
              </NavGroup>
            )}
          </NavSection>
        )}

        {/* WebSocket */}
        {data.websocket && (
          <NavSection
            title={data.sourceTitles?.websocket?.[0] ?? 'WebSocket'}
            expanded={activeSection === 'ws'}
            onClickHeader={() => {
              const first = allItems.find((i) => i.kind === 'ws');
              if (first) scrollTo(first.id);
            }}
          >
            <NavGroup label="Channels">
              {data.websocket.channels.map((ch) => {
                const id = cardId('ws', ch.name);
                return (
                  <NavItem key={id} active={activeId === id} onClick={() => scrollTo(id)}>
                    {ch.name}
                  </NavItem>
                );
              })}
            </NavGroup>
          </NavSection>
        )}

        {/* gRPC */}
        {data.grpc && (
          <NavSection
            title={data.sourceTitles?.grpc?.[0] ?? 'gRPC'}
            expanded={activeSection === 'grpc'}
            onClickHeader={() => {
              const first = allItems.find((i) => i.kind === 'grpc');
              if (first) scrollTo(first.id);
            }}
          >
            {data.grpc.services.map((svc) => (
              <NavGroup key={svc.name} label={svc.name}>
                {svc.methods.map((m) => {
                  const id = cardId('grpc', `${svc.name}.${m.name}`);
                  return (
                    <NavItem key={id} active={activeId === id} onClick={() => scrollTo(id)}>
                      {m.name}
                      {(m.serverStreaming || m.clientStreaming) && (
                        <span className="ml-1 text-[10px] text-muted-foreground">stream</span>
                      )}
                    </NavItem>
                  );
                })}
              </NavGroup>
            ))}
          </NavSection>
        )}

      </aside>
      <ResizeHandle side="left" onResize={onResizeLeft} />

      {/* ---- Center panel ---- */}
      <main ref={centerRef} className="flex-1 min-w-0 overflow-y-auto bg-muted/10">
        <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/30">
          <DocsBreadcrumb segments={[
            { label: 'API Reference', href: '/api-reference' },
            ...(activeSection === 'rest' ? [{ label: data.sourceTitles?.rest?.[0] ?? 'REST' }]
              : activeSection === 'gql' ? [{ label: data.sourceTitles?.graphql?.[0] ?? 'GraphQL' }]
              : activeSection === 'ws' ? [{ label: data.sourceTitles?.websocket?.[0] ?? 'WebSocket' }]
              : activeSection === 'grpc' ? [{ label: data.sourceTitles?.grpc?.[0] ?? 'gRPC' }]
              : []),
            ...(activeItem ? [{ label: activeItem.displayName }] : []),
          ]} />
        </div>
        <div className="px-6 py-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">{data.sourceTitles?.rest?.[0] ?? data.title}</h1>
        </div>

        {/* REST intro */}
        {data.sourceIntros?.rest && (
          <div className="mb-8 docs-content" dangerouslySetInnerHTML={{ __html: data.sourceIntros.rest }} />
        )}

        {/* Security Schemes */}
        {data.securitySchemes && data.securitySchemes.length > 0 && (
          <div className="mb-8">
            <h2 className="mb-4 text-xl font-semibold">Authentication</h2>
            <div className="space-y-3">
              {data.securitySchemes.map((s) => (
                <div key={s.name} className="glass-card rounded-xl px-4 py-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-sm font-semibold">{s.name}</code>
                    <span className={cn(
                      'rounded px-2 py-0.5 text-[10px] font-bold uppercase',
                      s.type === 'http' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                        : s.type === 'apiKey' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                        : s.type === 'oauth2' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                        : 'bg-muted text-muted-foreground',
                    )}>
                      {s.type === 'http' ? `${s.scheme}${s.bearerFormat ? ` (${s.bearerFormat})` : ''}` : s.type}
                    </span>
                    {s.in && s.paramName && (
                      <span className="text-xs text-muted-foreground">in {s.in}: <code className="font-mono">{s.paramName}</code></span>
                    )}
                    {data.globalSecurity?.some((g) => s.name in g) && (
                      <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Global</span>
                    )}
                  </div>
                  {s.description && <p className="text-sm text-muted-foreground">{s.description}</p>}
                  {s.type === 'http' && s.scheme === 'bearer' && (
                    <p className="text-xs text-muted-foreground">
                      Send as: <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">Authorization: Bearer {'<token>'}</code>
                    </p>
                  )}
                  {s.type === 'apiKey' && (
                    <p className="text-xs text-muted-foreground">
                      Send as: <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">{s.paramName}: {'<value>'}</code> in {s.in}
                    </p>
                  )}
                  {s.flows && Object.entries(s.flows).map(([flowName, flow]) => (
                    <div key={flowName} className="text-xs text-muted-foreground space-y-1">
                      <span className="font-medium capitalize">{flowName} flow</span>
                      {flow.authorizationUrl && <div>Authorization: <code className="font-mono">{flow.authorizationUrl}</code></div>}
                      {flow.tokenUrl && <div>Token: <code className="font-mono">{flow.tokenUrl}</code></div>}
                      {flow.scopes && Object.keys(flow.scopes).length > 0 && (
                        <div>Scopes: {Object.keys(flow.scopes).map((sc) => <code key={sc} className="font-mono mr-1">{sc}</code>)}</div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* REST Operations */}
        {data.resources.map((resource) => (
          <div key={resource.name} className="mb-8">
            <h2 className="mb-4 text-xl font-semibold">{resource.name}</h2>
            <div className="space-y-4">
              {resource.operations.map((op) => (
                <div
                  key={op.operationId}
                  id={cardId('rest', op.operationId)}
                  data-sdk-card
                  className="glass-card rounded-xl"
                >
                  {/* Header */}
                  <div className="flex items-center gap-3 border-b border-border/40 bg-muted/20 px-4 py-3">
                    <span className={cn('rounded px-2 py-0.5 text-xs font-bold uppercase', methodColor(op.method))}>
                      {op.method}
                    </span>
                    <code className="font-mono text-sm text-muted-foreground">{op.path}</code>
                  </div>

                  <div className="px-4 py-4 space-y-4">
                    {/* Summary */}
                    {op.summary && (
                      <p className="text-sm text-muted-foreground">{op.summary}</p>
                    )}

                    {/* Path Parameters */}
                    {op.pathParams.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase text-muted-foreground">Path Parameters</h4>
                        <ParamTable
                          params={op.pathParams.map((p) => ({ ...p, required: true }))}
                          locationLabel="path"
                        />
                      </div>
                    )}

                    {/* Query Parameters */}
                    {op.queryParams.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase text-muted-foreground">Query Parameters</h4>
                        <ParamTable params={op.queryParams} locationLabel="query" />
                      </div>
                    )}

                    {/* Header Parameters */}
                    {op.headerParams?.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase text-muted-foreground">Header Parameters</h4>
                        <ParamTable params={op.headerParams} locationLabel="header" />
                      </div>
                    )}

                    {/* Request Body */}
                    {op.hasBody && op.bodyProperties.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                          Request Body
                          {op.bodyTypeName && (
                            <code className="ml-2 font-normal normal-case text-foreground">{op.bodyTypeName}</code>
                          )}
                        </h4>
                        <ParamTable params={op.bodyProperties} />
                      </div>
                    )}

                    {/* Response */}
                    {op.responses && op.responses.length > 0 && (
                      <OperationResponses responses={op.responses} />
                    )}

                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* GraphQL */}
        {data.graphql && (
          <div className="mb-8">
            <h2 className="mb-4 text-xl font-semibold">{data.sourceTitles?.graphql?.[0] ?? 'GraphQL'}</h2>

            {data.sourceIntros?.graphql && (
              <div className="mb-6 docs-content" dangerouslySetInnerHTML={{ __html: data.sourceIntros.graphql }} />
            )}

            {([
              ['Queries', data.graphql.queries, 'QUERY', 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'] as const,
              ['Mutations', data.graphql.mutations, 'MUTATION', 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'] as const,
              ['Subscriptions', data.graphql.subscriptions, 'SUBSCRIPTION', 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'] as const,
            ] as const).map(([heading, ops, badge, badgeColor]) => ops.length > 0 && (
              <div key={heading} className="mb-6">
                <h3 className="mb-3 text-lg font-medium text-muted-foreground">{heading}</h3>
                <div className="space-y-4">
                  {ops.map((op) => (
                    <div
                      key={op.name}
                      id={cardId('gql', op.name)}
                      data-sdk-card
                      className="glass-card rounded-xl"
                    >
                      <div className="flex items-center gap-3 border-b border-border/40 bg-muted/20 px-4 py-3">
                        <span className={cn('rounded px-2 py-0.5 text-xs font-bold', badgeColor)}>
                          {badge}
                        </span>
                        <code className="font-mono text-sm">{op.name}</code>
                        {op.returnType && (
                          <code className="ml-auto rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                            → {op.returnType}
                          </code>
                        )}
                      </div>
                      <div className="px-4 py-4 space-y-4">
                        {op.description && (
                          <p className="text-sm text-muted-foreground">{op.description}</p>
                        )}
                        {op.args.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold uppercase text-muted-foreground">Arguments</h4>
                            <ParamTable params={op.args} />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* WebSocket Channels */}
        {data.websocket && (
          <div className="mb-8">
            <h2 className="mb-4 text-xl font-semibold">{data.sourceTitles?.websocket?.[0] ?? 'WebSocket'}</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs">{data.websocket.url}</code>
            </p>
            {data.sourceIntros?.websocket && (
              <div className="mb-6 docs-content" dangerouslySetInnerHTML={{ __html: data.sourceIntros.websocket }} />
            )}
            <div className="space-y-4">
              {data.websocket.channels.map((ch) => (
                <div
                  key={ch.name}
                  id={cardId('ws', ch.name)}
                  data-sdk-card
                  className="glass-card rounded-xl"
                >
                  <div className="flex items-center gap-3 border-b border-border/40 bg-muted/20 px-4 py-3">
                    <code className="font-mono text-sm font-semibold">{ch.name}</code>
                    {ch.hasSubscribe && (
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                        subscribe
                      </span>
                    )}
                    {ch.hasPublish && (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                        publish
                      </span>
                    )}
                  </div>
                  <div className="px-4 py-4 space-y-4">
                    {ch.description && (
                      <p className="text-sm text-muted-foreground">{ch.description}</p>
                    )}
                    {ch.subscribeMessage && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                          Receive
                          {ch.subscribeMessage.name && (
                            <code className="ml-2 font-normal normal-case text-foreground">{ch.subscribeMessage.name}</code>
                          )}
                        </h4>
                        {ch.subscribeMessage.description && (
                          <p className="mt-1 text-xs text-muted-foreground">{ch.subscribeMessage.description}</p>
                        )}
                        {ch.subscribeMessage.properties && <ParamTable params={ch.subscribeMessage.properties} />}
                      </div>
                    )}
                    {ch.publishMessage && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                          Send
                          {ch.publishMessage.name && (
                            <code className="ml-2 font-normal normal-case text-foreground">{ch.publishMessage.name}</code>
                          )}
                        </h4>
                        {ch.publishMessage.description && (
                          <p className="mt-1 text-xs text-muted-foreground">{ch.publishMessage.description}</p>
                        )}
                        {ch.publishMessage.properties && <ParamTable params={ch.publishMessage.properties} />}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* gRPC Services */}
        {data.grpc && (
          <div className="mb-8">
            <h2 className="mb-4 text-xl font-semibold">{data.sourceTitles?.grpc?.[0] ?? 'gRPC'}</h2>
            {data.sourceIntros?.grpc && (
              <div className="mb-6 docs-content" dangerouslySetInnerHTML={{ __html: data.sourceIntros.grpc }} />
            )}
            {data.grpc.services.map((svc) => (
              <div key={svc.name} className="mb-6">
                <h3 className="mb-3 text-lg font-medium">{svc.name}</h3>
                {svc.description && <p className="mb-3 text-sm text-muted-foreground">{svc.description}</p>}
                <div className="space-y-4">
                  {svc.methods.map((m) => (
                    <div
                      key={`${svc.name}.${m.name}`}
                      id={cardId('grpc', `${svc.name}.${m.name}`)}
                      data-sdk-card
                      className="glass-card rounded-xl"
                    >
                      <div className="flex items-center gap-3 border-b border-border/40 bg-muted/20 px-4 py-3">
                        <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400">
                          RPC
                        </span>
                        <code className="font-mono text-sm font-semibold">{m.name}</code>
                        {m.clientStreaming && (
                          <span className="rounded bg-cyan-100 px-2 py-0.5 text-[10px] font-bold uppercase text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400">
                            client stream
                          </span>
                        )}
                        {m.serverStreaming && (
                          <span className="rounded bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase text-violet-800 dark:bg-violet-900/30 dark:text-violet-400">
                            server stream
                          </span>
                        )}
                      </div>
                      <div className="px-4 py-4 space-y-4">
                        {m.description && (
                          <p className="text-sm text-muted-foreground">{m.description}</p>
                        )}
                        {m.inputFields && m.inputFields.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                              Input
                              <code className="ml-2 font-normal normal-case text-foreground">{m.inputType}</code>
                            </h4>
                            <ParamTable params={m.inputFields} />
                          </div>
                        )}
                        {m.outputFields && m.outputFields.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                              Output
                              <code className="ml-2 font-normal normal-case text-foreground">{m.outputType}</code>
                            </h4>
                            <ParamTable params={m.outputFields} />
                          </div>
                        )}
                        {(!m.inputFields || m.inputFields.length === 0) && (!m.outputFields || m.outputFields.length === 0) && (
                          <div className="flex gap-6 text-xs text-muted-foreground">
                            <span>Input: <code className="font-mono">{m.inputType}</code></span>
                            <span>Output: <code className="font-mono">{m.outputType}</code></span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Spacer so the last sections can scroll into the observation zone */}
        <div className="h-[40vh]" aria-hidden="true" />
        </div>
      </main>

      {/* ---- Right sidebar (code snippets) ---- */}
      <ResizeHandle side="right" onResize={onResizeRight} />
      <aside className="hidden shrink-0 border-l border-border/50 bg-muted/10 xl:block" style={{ width: rightWidth }}>
        <div className="sticky top-22 flex max-h-[calc(100vh-5.5rem)] flex-col overflow-y-auto p-3 gap-3">
          {/* Request card */}
          <div className="group/code glass-card rounded-xl">
            {/* Language selector */}
            <div className="border-b border-border/40 bg-muted/15 px-3 py-2">
              <Select value={language} onValueChange={selectLanguage}>
                <SelectTrigger className="h-8 w-full cursor-pointer">
                  <SelectValue>
                    <span className="flex items-center gap-2">
                      <span className={cn('inline-flex h-5 w-7 items-center justify-center rounded bg-muted text-[10px] font-bold', LANG_COLORS[language])}>
                        {LANG_ICONS[language] ?? language}
                      </span>
                      <span className="text-sm">{LANGUAGE_DISPLAY_NAMES[language] ?? language}</span>
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(data?.languages ?? SUPPORTED_LANGUAGES).map((lang) => (
                    <SelectItem key={lang} value={lang} className="cursor-pointer">
                      <span className="flex items-center gap-2">
                        <span className={cn('inline-flex h-5 w-7 items-center justify-center rounded bg-muted text-[10px] font-bold', LANG_COLORS[lang])}>
                          {LANG_ICONS[lang] ?? lang}
                        </span>
                        {LANGUAGE_DISPLAY_NAMES[lang] ?? lang}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Snippet header */}
            <div className="flex items-center justify-between border-b border-border/40 px-4 py-2">
              <span className="truncate text-xs text-muted-foreground">
                {activeItem?.displayName ?? 'SDK Snippet'}
              </span>
              <div className="flex items-center gap-1.5">
                <div className="opacity-0 group-hover/code:opacity-100 transition-opacity">
                  <CopyButton text={snippet} />
                </div>
                {activeItem?.kind === 'rest' && (
                  <button
                    onClick={() => setTryNowOpen(true)}
                    className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow transition-all"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                    Try now
                  </button>
                )}
              </div>
            </div>

            {/* Code */}
            <div className="bg-muted/30">
              <CodeBlock code={snippet} language={language} />
            </div>
          </div>

          {/* Response card */}
          {(() => {
            const op = getActiveOperation();
            return op?.responses && op.responses.length > 0
              ? <ResponsePanel responses={op.responses} />
              : null;
          })()}
        </div>
      </aside>

      {/* Mobile code panel (collapsible at bottom) */}
      <MobileCodePanel
        snippet={snippet}
        language={language}
        activeLabel={activeItem?.displayName}
        languages={[...(data?.languages ?? SUPPORTED_LANGUAGES)]}
        onSelectLanguage={selectLanguage}
        selectedLanguage={language}
      />

      {/* Try Now modal — rendered at root level for full-viewport blur */}
      {(() => {
        const op = getActiveOperation();
        return op ? (
          <TryNowModal
            open={tryNowOpen}
            onClose={() => setTryNowOpen(false)}
            method={op.method}
            path={op.path}
            baseUrl={data?.baseUrl ?? ''}
            summary={op.summary}
            pathParams={op.pathParams}
            queryParams={op.queryParams}
            headerParams={op.headerParams ?? []}
            securitySchemes={data?.securitySchemes}
            hasBody={op.hasBody}
            bodyProperties={op.bodyProperties}
          />
        ) : null;
      })()}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Navigation sub-components                                           */
/* ------------------------------------------------------------------ */

function NavSection({ title, expanded, onClickHeader, children }: { title: string; expanded: boolean; onClickHeader: () => void; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <button
        onClick={onClickHeader}
        className="mb-1 flex w-full cursor-pointer items-center justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>{title}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn('transition-transform', expanded ? 'rotate-90' : '')}
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>
      {expanded && children}
    </div>
  );
}

function NavGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <span className="mb-0.5 block text-xs font-semibold text-foreground">{label}</span>
      <div className="ml-1 space-y-px border-l pl-2">{children}</div>
    </div>
  );
}

function NavItem({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (active && ref.current) {
      ref.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [active]);

  return (
    <button
      ref={ref}
      onClick={onClick}
      className={cn(
        'flex w-full cursor-pointer items-center rounded-lg px-2.5 py-1.5 text-left text-xs transition-all',
        active
          ? 'bg-accent text-accent-foreground font-medium'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Mobile code panel                                                   */
/* ------------------------------------------------------------------ */

function MobileCodePanel({
  snippet,
  activeLabel,
  languages,
  onSelectLanguage,
  selectedLanguage,
}: {
  snippet: string;
  language: string;
  activeLabel?: string;
  languages: string[];
  onSelectLanguage: (lang: string) => void;
  selectedLanguage: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn('fixed inset-x-0 bottom-0 z-30 xl:hidden', expanded ? 'top-1/3' : '')}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between border-t bg-muted/40 px-4 py-2 text-muted-foreground"
      >
        <span className="font-mono text-xs">{activeLabel ?? 'SDK Snippet'}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn('transition-transform', expanded ? 'rotate-180' : '')}
        >
          <path d="m18 15-6-6-6 6" />
        </svg>
      </button>

      {expanded && (
        <div className="flex h-full flex-col bg-muted/40">
          <div className="border-b border-border px-3 py-2">
            <Select value={selectedLanguage} onValueChange={onSelectLanguage}>
              <SelectTrigger className="h-8 w-full cursor-pointer">
                <SelectValue>
                  <span className="flex items-center gap-2">
                    <span className={cn('inline-flex h-5 w-7 items-center justify-center rounded bg-muted text-[10px] font-bold', LANG_COLORS[selectedLanguage])}>
                      {LANG_ICONS[selectedLanguage] ?? selectedLanguage}
                    </span>
                    <span className="text-sm">{LANGUAGE_DISPLAY_NAMES[selectedLanguage] ?? selectedLanguage}</span>
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {languages.map((lang) => (
                  <SelectItem key={lang} value={lang} className="cursor-pointer">
                    <span className="flex items-center gap-2">
                      <span className={cn('inline-flex h-5 w-7 items-center justify-center rounded bg-muted text-[10px] font-bold', LANG_COLORS[lang])}>
                        {LANG_ICONS[lang] ?? lang}
                      </span>
                      {LANGUAGE_DISPLAY_NAMES[lang] ?? lang}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <span className="truncate font-mono text-xs text-muted-foreground">
              {activeLabel ?? 'SDK Snippet'}
            </span>
            <CopyButton text={snippet} />
          </div>
          <div className="flex-1 overflow-auto">
            <CodeBlock code={snippet} language={selectedLanguage} />
          </div>
        </div>
      )}
    </div>
  );
}
