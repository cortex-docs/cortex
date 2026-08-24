'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import hljs from 'highlight.js/lib/core';
import hljsJson from 'highlight.js/lib/languages/json';
import hljsGraphql from 'highlight.js/lib/languages/graphql';
import { cn } from '@/lib/utils';

hljs.registerLanguage('json', hljsJson);
hljs.registerLanguage('graphql', hljsGraphql);

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface SecuritySchemeInput {
  name: string;
  type: string;
  scheme?: string;
  bearerFormat?: string;
  in?: string;
  paramName?: string;
}

interface LogEntry {
  id: number;
  direction: 'sent' | 'received' | 'system';
  content: string;
  time: number;
}

interface RequestFieldInput {
  name: string;
  type: string;
  required: boolean;
  enumValues?: Array<string | number>;
  children?: RequestFieldInput[];
}

type GqlFieldInput = RequestFieldInput;

export type TryNowConfig =
  | {
      kind: 'rest';
      method: string;
      path: string;
      baseUrl: string;
      summary?: string;
      pathParams: Array<{ name: string; type: string }>;
      queryParams: Array<{ name: string; type: string; required: boolean }>;
      headerParams: Array<{ name: string; type: string; required: boolean }>;
      securitySchemes?: SecuritySchemeInput[];
      hasBody: boolean;
      contentType?: string;
      isRawBinary: boolean;
      bodyProperties: Array<{ name: string; type: string; required: boolean }>;
    }
  | {
      kind: 'ws';
      url: string;
      channelName: string;
      hasPublish: boolean;
      publishProperties?: RequestFieldInput[];
    }
  | {
      kind: 'gql';
      endpoint: string;
      wsEndpoint: string;
      operationName: string;
      operationKind: 'query' | 'mutation' | 'subscription';
      args: GqlFieldInput[];
      returnType: string;
      returnFields?: GqlFieldInput[];
    }
  | {
      kind: 'grpc';
      endpoint: string;
      serviceName: string;
      methodName: string;
      inputType: string;
      outputType: string;
      inputFields: RequestFieldInput[];
      serverStreaming: boolean;
      clientStreaming: boolean;
    }
  | {
      kind: 'openrpc';
      endpoint: string;
      methodName: string;
      params: Array<RequestFieldInput & { description?: string }>;
    };

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  POST: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  PUT: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  DELETE: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  PATCH: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
};

const KIND_BADGES: Record<string, { label: string; className: string }> = {
  ws: {
    label: 'WS',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
  query: {
    label: 'QUERY',
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  },
  mutation: {
    label: 'MUTATION',
    className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  },
  subscription: {
    label: 'SUB',
    className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  },
  grpc: {
    label: 'gRPC',
    className: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400',
  },
  openrpc: {
    label: 'OpenRPC',
    className: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  },
};

function isFileField(type: string): boolean {
  return type === 'file' || type === 'array of file';
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function highlightCode(text: string, language: string): string {
  try {
    return hljs.highlight(text, { language }).value;
  } catch {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

function highlightJson(text: string): string {
  return highlightCode(text, 'json');
}

function CodeEditor({
  value,
  onChange,
  language,
  rows = 6,
}: {
  value: string;
  onChange: (v: string) => void;
  language: string;
  rows?: number;
}) {
  const highlighted = useMemo(() => highlightCode(value, language), [value, language]);
  return (
    <div className="relative mt-1 rounded-lg border bg-muted/40 overflow-hidden">
      <pre
        className="p-3 font-mono text-sm leading-relaxed whitespace-pre-wrap wrap-break-word pointer-events-none"
        aria-hidden
        dangerouslySetInnerHTML={{ __html: highlighted + '\n' }}
      />
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        spellCheck={false}
        className="absolute inset-0 w-full h-full p-3 font-mono text-sm leading-relaxed text-transparent caret-foreground bg-transparent resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 rounded-lg"
      />
    </div>
  );
}

function buildSelectionSet(fields?: GqlFieldInput[], indent = '    '): string {
  if (!fields?.length) return `${indent}__typename`;
  return fields
    .map((f) => {
      if (!f.children?.length) return `${indent}${f.name}`;
      const inner = buildSelectionSet(f.children, indent + '  ');
      return `${indent}${f.name} {\n${inner}\n${indent}}`;
    })
    .join('\n');
}

function buildGqlQuery(
  name: string,
  kind: 'query' | 'mutation' | 'subscription',
  args: GqlFieldInput[],
  returnFields?: GqlFieldInput[],
  returnType?: string,
): string {
  const varDefs = args
    .map((a) => `$${a.name}: ${a.type}${a.required && !a.type.endsWith('!') ? '!' : ''}`)
    .join(', ');
  const fieldArgs = args.map((a) => `${a.name}: $${a.name}`).join(', ');
  const opName = name.charAt(0).toUpperCase() + name.slice(1);
  const header = varDefs ? `${kind} ${opName}(${varDefs})` : `${kind} ${opName}`;
  const field = fieldArgs ? `${name}(${fieldArgs})` : name;
  const bare = (returnType ?? '').replace(/[!\[\]]/g, '');
  const isScalar = /^(String|Int|Float|Boolean|ID)$/.test(bare);
  if (isScalar && !returnFields?.length) return `${header} {\n  ${field}\n}`;
  const selection = buildSelectionSet(returnFields);
  return `${header} {\n  ${field} {\n${selection}\n  }\n}`;
}

function gqlDefaultValue(field: GqlFieldInput, operationName: string): unknown {
  const type = field.type.replace(/[!\[\]]/g, '').replace(/\[\]$/, '');
  const context = `${operationName} ${field.name}`.toLowerCase();

  let value: unknown;
  if (field.children?.length) {
    const input: Record<string, unknown> = {};
    for (const child of field.children) {
      if (child.required) input[child.name] = gqlDefaultValue(child, operationName);
    }
    value = input;
  } else if (field.enumValues?.length) {
    value =
      field.enumValues.find((candidate) => !String(candidate).includes('UNSPECIFIED')) ??
      field.enumValues[0];
  } else if (
    /^(Int|Float|int32|int64|uint32|uint64|sint32|sint64|fixed32|fixed64|sfixed32|sfixed64|float|double)$/.test(
      type,
    )
  ) {
    value = 1;
  } else if (type === 'Boolean' || type === 'bool' || type === 'boolean') {
    value = true;
  } else if (type === 'ID' || context.includes('id')) {
    value = context.includes('owner')
      ? 'owner-1'
      : context.includes('pet')
        ? 'pet-1'
        : 'example-id';
  } else if ((type === 'String' || type === 'string') && context.includes('email')) {
    value = 'user@example.com';
  } else if ((type === 'String' || type === 'string') && context.includes('name')) {
    value = 'Example';
  } else {
    value = 'example';
  }

  return field.type.includes('[') || field.type.endsWith('[]') ? [value] : value;
}

function buildDefaultVars(args: GqlFieldInput[], operationName: string): string {
  const obj: Record<string, unknown> = {};
  for (const a of args) {
    if (a.required) obj[a.name] = gqlDefaultValue(a, operationName);
  }
  return JSON.stringify(obj, null, 2);
}

function buildDefaultRequest(fields: RequestFieldInput[], context: string): string {
  const request: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.required) request[field.name] = gqlDefaultValue(field, context);
  }
  return JSON.stringify(request, null, 2);
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function tryFormatJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/* ------------------------------------------------------------------ */
/* MessageLog sub-component                                            */
/* ------------------------------------------------------------------ */

function MessageLog({ messages }: { messages: LogEntry[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="mt-1 rounded-lg border px-3 py-4 text-center text-sm text-muted-foreground">
        No messages yet
      </div>
    );
  }

  return (
    <div className="mt-1 rounded-lg border overflow-hidden max-h-72 overflow-y-auto">
      <div className="divide-y divide-border/30">
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              'px-3 py-1.5 text-xs font-mono',
              m.direction === 'system' && 'bg-muted/30 text-muted-foreground italic',
              m.direction === 'sent' && 'bg-blue-50/50 dark:bg-blue-950/20',
              m.direction === 'received' && 'bg-emerald-50/50 dark:bg-emerald-950/20',
            )}
          >
            <div className="flex items-center gap-2 text-muted-foreground/60 select-none">
              <span>{m.direction === 'sent' ? '→' : m.direction === 'received' ? '←' : '●'}</span>
              <span>{formatTime(m.time)}</span>
            </div>
            <pre
              className={cn(
                'mt-1 whitespace-pre-wrap break-all leading-relaxed',
                m.direction === 'system' ? 'text-muted-foreground' : 'text-foreground',
              )}
            >
              {m.direction === 'system' ? m.content : tryFormatJson(m.content)}
            </pre>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* StatusDot                                                           */
/* ------------------------------------------------------------------ */

function StatusDot({ connected }: { connected: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span
        className={cn(
          'inline-block h-2 w-2 rounded-full',
          connected ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/40',
        )}
      />
      <span
        className={connected ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}
      >
        {connected ? 'Connected' : 'Disconnected'}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* InputField                                                          */
/* ------------------------------------------------------------------ */

function InputField({
  label,
  value,
  onChange,
  placeholder,
  required,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="w-28 shrink-0 text-sm font-mono text-foreground">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 rounded-lg border bg-background px-3 py-1.5 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* StopButton                                                          */
/* ------------------------------------------------------------------ */

function StopButton({ onClick, label = 'Stop' }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="cursor-pointer rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors inline-flex items-center gap-1.5"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
        <rect x="4" y="4" width="16" height="16" rx="2" />
      </svg>
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* TryNowModal                                                         */
/* ------------------------------------------------------------------ */

export function TryNowModal({
  open,
  onClose,
  config,
}: {
  open: boolean;
  onClose: () => void;
  config: TryNowConfig | null;
}) {
  /* -- Shared state ------------------------------------------------- */
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [response, setResponse] = useState<{
    status: number;
    statusText: string;
    body: string;
    time: number;
  } | null>(null);

  /* -- REST state --------------------------------------------------- */
  const [pathValues, setPathValues] = useState<Record<string, string>>({});
  const [queryValues, setQueryValues] = useState<Record<string, string>>({});
  const [headerValues, setHeaderValues] = useState<Record<string, string>>({});
  const [authValues, setAuthValues] = useState<Record<string, string>>({});
  const [bodyText, setBodyText] = useState('');
  const [bodyFiles, setBodyFiles] = useState<Record<string, File[]>>({});

  /* -- WS state ----------------------------------------------------- */
  const [wsMessageText, setWsMessageText] = useState('');

  /* -- GQL state ---------------------------------------------------- */
  const [gqlQuery, setGqlQuery] = useState('');
  const [gqlVariables, setGqlVariables] = useState('');

  /* -- gRPC state --------------------------------------------------- */
  const [grpcRequest, setGrpcRequest] = useState('');

  /* -- OpenRPC state ------------------------------------------------ */
  const [rpcParams, setRpcParams] = useState('');

  /* -- Refs --------------------------------------------------------- */
  const wsRef = useRef<WebSocket | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const resultSectionRef = useRef<HTMLDivElement | null>(null);
  const logIdRef = useRef(0);

  const addLog = useCallback((direction: LogEntry['direction'], content: string) => {
    setMessages((prev) => [
      ...prev,
      { id: logIdRef.current++, direction, content, time: Date.now() },
    ]);
  }, []);

  /* -- Config key for reset ----------------------------------------- */
  const configKey = config
    ? `${config.kind}-${
        config.kind === 'rest'
          ? `${config.method}-${config.path}`
          : config.kind === 'ws'
            ? config.channelName
            : config.kind === 'gql'
              ? config.operationName
              : config.kind === 'grpc'
                ? `${config.serviceName}.${config.methodName}`
                : config.kind === 'openrpc'
                  ? config.methodName
                  : ''
      }`
    : '';

  /* -- Reset on open/config change ---------------------------------- */
  useEffect(() => {
    if (!open || !config) return;

    wsRef.current?.close();
    wsRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;

    setLoading(false);
    setError(null);
    setMessages([]);
    setResponse(null);
    setConnected(false);
    logIdRef.current = 0;

    if (config.kind === 'rest') {
      setPathValues({});
      setQueryValues({});
      setHeaderValues({});
      setAuthValues({});
      setBodyFiles({});
      if (config.hasBody && config.bodyProperties.length > 0) {
        const obj: Record<string, unknown> = {};
        for (const p of config.bodyProperties) {
          if (isFileField(p.type)) continue;
          if (p.type === 'integer' || p.type === 'number') obj[p.name] = 0;
          else if (p.type === 'boolean') obj[p.name] = false;
          else obj[p.name] = '';
        }
        setBodyText(JSON.stringify(obj, null, 2));
      } else {
        setBodyText('');
      }
    } else if (config.kind === 'ws') {
      setWsMessageText(buildDefaultRequest(config.publishProperties ?? [], config.channelName));
    } else if (config.kind === 'gql') {
      setGqlQuery(
        buildGqlQuery(
          config.operationName,
          config.operationKind,
          config.args,
          config.returnFields,
          config.returnType,
        ),
      );
      setGqlVariables(buildDefaultVars(config.args, config.operationName));
    } else if (config.kind === 'grpc') {
      setGrpcRequest(
        buildDefaultRequest(config.inputFields, `${config.serviceName} ${config.methodName}`),
      );
    } else if (config.kind === 'openrpc') {
      setRpcParams(buildDefaultRequest(config.params, config.methodName));
    }
  }, [open, configKey]);

  /* -- Cleanup on unmount ------------------------------------------- */
  useEffect(() => {
    return () => {
      wsRef.current?.close();
      abortRef.current?.abort();
    };
  }, []);

  const lastMessageDirection = messages.at(-1)?.direction;
  useEffect(() => {
    if (!response && !error && lastMessageDirection !== 'received') return;

    const frame = requestAnimationFrame(() => {
      resultSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [response, error, messages.length, lastMessageDirection]);

  /* -- Resolved REST URL -------------------------------------------- */
  const resolvedUrl = useMemo(() => {
    if (!config || config.kind !== 'rest') return '';
    let url = config.path;
    for (const p of config.pathParams) {
      url = url.replace(`{${p.name}}`, pathValues[p.name] || `{${p.name}}`);
    }
    const qp = new URLSearchParams();
    for (const q of config.queryParams) {
      const v = queryValues[q.name];
      if (v) qp.set(q.name, v);
    }
    for (const s of config.securitySchemes ?? []) {
      if (s.type === 'apiKey' && s.in === 'query' && s.paramName) {
        const v = authValues[s.name];
        if (v) qp.set(s.paramName, v);
      }
    }
    const qs = qp.toString();
    const baseUrl = config.baseUrl.replace(/\/+$/, '');
    const requestPath = url.startsWith('/') ? url : `/${url}`;
    return `${baseUrl}${requestPath}${qs ? `?${qs}` : ''}`;
  }, [config, pathValues, queryValues, authValues]);

  /* ================================================================ */
  /* Action functions                                                  */
  /* ================================================================ */

  /* -- REST send ---------------------------------------------------- */
  const sendRest = useCallback(async () => {
    if (!config || config.kind !== 'rest') return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setResponse(null);
    setMessages([]);
    logIdRef.current = 0;

    const start = performance.now();
    try {
      const hdrs: Record<string, string> = {};
      const isMultipart = config.contentType?.toLowerCase() === 'multipart/form-data';
      if (config.hasBody && !isMultipart && !config.isRawBinary) {
        hdrs['Content-Type'] = config.contentType || 'application/json';
      }
      for (const h of config.headerParams) {
        const v = headerValues[h.name];
        if (v) hdrs[h.name] = v;
      }
      for (const s of config.securitySchemes ?? []) {
        const v = authValues[s.name];
        if (!v) continue;
        if (s.type === 'http' && s.scheme === 'bearer') hdrs['Authorization'] = `Bearer ${v}`;
        else if (s.type === 'apiKey' && s.in === 'header' && s.paramName) hdrs[s.paramName] = v;
      }

      const opts: RequestInit = {
        method: config.method,
        headers: hdrs,
        signal: controller.signal,
      };
      if (config.hasBody && isMultipart) {
        let values: Record<string, unknown> = {};
        if (bodyText.trim()) {
          const parsed = JSON.parse(bodyText) as unknown;
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Multipart fields must be a JSON object');
          }
          values = parsed as Record<string, unknown>;
        }

        const form = new FormData();
        const fileFields = new Set(
          config.bodyProperties.filter((p) => isFileField(p.type)).map((p) => p.name),
        );
        for (const [name, value] of Object.entries(values)) {
          if (fileFields.has(name) || value === undefined || value === null) continue;
          form.append(name, typeof value === 'object' ? JSON.stringify(value) : String(value));
        }
        for (const field of config.bodyProperties.filter((p) => isFileField(p.type))) {
          const files = bodyFiles[field.name] ?? [];
          if (field.required && files.length === 0) throw new Error(`${field.name} is required`);
          for (const file of files) form.append(field.name, file, file.name);
        }
        opts.body = form;
      } else if (config.hasBody && config.isRawBinary) {
        const file = bodyFiles.body?.[0];
        if (!file) throw new Error('body is required');
        hdrs['Content-Type'] = file.type || config.contentType || 'application/octet-stream';
        opts.body = file;
      } else if (config.hasBody && bodyText.trim()) {
        opts.body = bodyText;
      }

      const res = await fetch(resolvedUrl, opts);
      const reader = res.body?.getReader();

      if (!reader) {
        const text = await res.text();
        const time = Math.round(performance.now() - start);
        let body = text;
        try {
          body = JSON.stringify(JSON.parse(text), null, 2);
        } catch {}
        setResponse({ status: res.status, statusText: res.statusText, body, time });
      } else {
        const decoder = new TextDecoder();
        const firstResult = await reader.read();
        if (firstResult.done) {
          setResponse({
            status: res.status,
            statusText: res.statusText,
            body: '',
            time: Math.round(performance.now() - start),
          });
        } else {
          const firstText = decoder.decode(firstResult.value, { stream: true });
          const nextRead = reader.read();
          const timeout = new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), 300));
          const race = await Promise.race([nextRead, timeout]);

          if (race === 'timeout') {
            addLog('system', `${res.status} ${res.statusText}`);
            for (const line of firstText.split('\n').filter(Boolean)) addLog('received', line);
            let pending = await nextRead;
            while (!pending.done) {
              const text = decoder.decode(pending.value, { stream: true });
              for (const line of text.split('\n').filter(Boolean)) addLog('received', line);
              pending = await reader.read();
            }
            addLog('system', 'Stream ended');
          } else {
            let fullText = firstText;
            if (!race.done) {
              fullText += decoder.decode(race.value, { stream: true });
              let r = await reader.read();
              while (!r.done) {
                fullText += decoder.decode(r.value, { stream: true });
                r = await reader.read();
              }
            }
            const time = Math.round(performance.now() - start);
            let body = fullText;
            try {
              body = JSON.stringify(JSON.parse(fullText), null, 2);
            } catch {}
            setResponse({ status: res.status, statusText: res.statusText, body, time });
          }
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') {
        addLog('system', 'Request cancelled');
      } else {
        setError(e instanceof Error ? e.message : 'Request failed');
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [config, resolvedUrl, bodyText, bodyFiles, headerValues, authValues, addLog]);

  /* -- WebSocket connect -------------------------------------------- */
  const connectWs = useCallback(() => {
    if (!config || config.kind !== 'ws') return;

    setMessages([]);
    logIdRef.current = 0;
    setError(null);

    try {
      const ws = new WebSocket(config.url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        addLog('system', `Connected to ${config.url}`);
      };
      ws.onmessage = (e) => {
        addLog('received', typeof e.data === 'string' ? e.data : '[binary]');
      };
      ws.onerror = () => {
        addLog('system', 'Connection error');
      };
      ws.onclose = (e) => {
        setConnected(false);
        addLog('system', `Disconnected (code ${e.code})`);
        wsRef.current = null;
      };
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to connect');
    }
  }, [config, addLog]);

  /* -- WebSocket send ----------------------------------------------- */
  const sendWs = useCallback(() => {
    if (!wsRef.current || !connected) return;
    wsRef.current.send(wsMessageText);
    addLog('sent', wsMessageText);
  }, [connected, wsMessageText, addLog]);

  /* -- WebSocket disconnect ----------------------------------------- */
  const disconnectWs = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  /* -- GraphQL execute (query/mutation) ----------------------------- */
  const executeGql = useCallback(async () => {
    if (!config || config.kind !== 'gql' || config.operationKind === 'subscription') return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setResponse(null);

    const start = performance.now();
    try {
      let variables = {};
      try {
        variables = JSON.parse(gqlVariables);
      } catch {}
      const res = await fetch(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: gqlQuery, variables }),
        signal: controller.signal,
      });
      const text = await res.text();
      const time = Math.round(performance.now() - start);
      let body = text;
      try {
        body = JSON.stringify(JSON.parse(text), null, 2);
      } catch {}
      setResponse({ status: res.status, statusText: res.statusText, body, time });
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') {
        addLog('system', 'Request cancelled');
      } else {
        setError(e instanceof Error ? e.message : 'Request failed');
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [config, gqlQuery, gqlVariables, addLog]);

  /* -- GraphQL subscribe -------------------------------------------- */
  const subscribeGql = useCallback(() => {
    if (!config || config.kind !== 'gql' || config.operationKind !== 'subscription') return;

    setMessages([]);
    logIdRef.current = 0;
    setError(null);

    try {
      const ws = new WebSocket(config.wsEndpoint, 'graphql-transport-ws');
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'connection_init' }));
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'connection_ack') {
            let variables = {};
            try {
              variables = JSON.parse(gqlVariables);
            } catch {}
            ws.send(
              JSON.stringify({
                type: 'subscribe',
                id: '1',
                payload: { query: gqlQuery, variables },
              }),
            );
            setConnected(true);
            addLog('system', 'Subscribed');
          } else if (msg.type === 'next') {
            addLog('received', JSON.stringify(msg.payload, null, 2));
          } else if (msg.type === 'error') {
            addLog('system', `Error: ${JSON.stringify(msg.payload)}`);
          } else if (msg.type === 'complete') {
            addLog('system', 'Subscription completed');
            setConnected(false);
            wsRef.current?.close();
            wsRef.current = null;
          }
        } catch {
          addLog('received', e.data);
        }
      };

      ws.onerror = () => {
        addLog('system', 'Connection error');
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
      };
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to subscribe');
    }
  }, [config, gqlQuery, gqlVariables, addLog]);

  /* -- GraphQL unsubscribe ------------------------------------------ */
  const unsubscribeGql = useCallback(() => {
    if (wsRef.current) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'complete', id: '1' }));
      } catch {}
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
  }, []);

  /* -- gRPC execute through the browser JSON bridge ---------------- */
  const executeGrpc = useCallback(async () => {
    if (!config || config.kind !== 'grpc') return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setResponse(null);
    setMessages([]);
    logIdRef.current = 0;

    const start = performance.now();
    try {
      let request: unknown = {};
      try {
        request = JSON.parse(grpcRequest);
      } catch {
        throw new Error('Request body must be valid JSON');
      }

      const res = await fetch(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!config.serverStreaming) {
        const text = await res.text();
        let body = text;
        try {
          body = JSON.stringify(JSON.parse(text), null, 2);
        } catch {}
        setResponse({
          status: res.status,
          statusText: res.statusText,
          body,
          time: Math.round(performance.now() - start),
        });
        return;
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `${res.status} ${res.statusText}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('Streaming response is not available');

      addLog('system', `${res.status} ${res.statusText} — stream opened`);
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.trim()) addLog('received', line);
        }
      }
      buffer += decoder.decode();
      if (buffer.trim()) addLog('received', buffer);
      addLog('system', 'Stream ended');
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') {
        addLog('system', 'Stream stopped');
      } else {
        setError(e instanceof Error ? e.message : 'gRPC request failed');
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setLoading(false);
    }
  }, [config, grpcRequest, addLog]);

  /* -- OpenRPC execute ---------------------------------------------- */
  const executeRpc = useCallback(async () => {
    if (!config || config.kind !== 'openrpc') return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setResponse(null);
    setMessages([]);
    logIdRef.current = 0;

    const start = performance.now();
    try {
      let params = {};
      try {
        params = JSON.parse(rpcParams);
      } catch {}

      const reqBody = JSON.stringify({
        jsonrpc: '2.0',
        method: config.methodName,
        params,
        id: 1,
      });

      const res = await fetch(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: reqBody,
        signal: controller.signal,
      });

      const reader = res.body?.getReader();
      if (!reader) {
        const text = await res.text();
        const time = Math.round(performance.now() - start);
        let body = text;
        try {
          body = JSON.stringify(JSON.parse(text), null, 2);
        } catch {}
        setResponse({ status: res.status, statusText: res.statusText, body, time });
      } else {
        const decoder = new TextDecoder();
        const firstResult = await reader.read();
        if (firstResult.done) {
          setResponse({
            status: res.status,
            statusText: res.statusText,
            body: '',
            time: Math.round(performance.now() - start),
          });
        } else {
          const firstText = decoder.decode(firstResult.value, { stream: true });
          const nextRead = reader.read();
          const timeout = new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), 300));
          const race = await Promise.race([nextRead, timeout]);

          if (race === 'timeout') {
            addLog('system', `${res.status} ${res.statusText}`);
            for (const line of firstText.split('\n').filter(Boolean)) addLog('received', line);
            let pending = await nextRead;
            while (!pending.done) {
              const text = decoder.decode(pending.value, { stream: true });
              for (const line of text.split('\n').filter(Boolean)) addLog('received', line);
              pending = await reader.read();
            }
            addLog('system', 'Stream ended');
          } else {
            let fullText = firstText;
            if (!race.done) {
              fullText += decoder.decode(race.value, { stream: true });
              let r = await reader.read();
              while (!r.done) {
                fullText += decoder.decode(r.value, { stream: true });
                r = await reader.read();
              }
            }
            const time = Math.round(performance.now() - start);
            let body = fullText;
            try {
              body = JSON.stringify(JSON.parse(fullText), null, 2);
            } catch {}
            setResponse({ status: res.status, statusText: res.statusText, body, time });
          }
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') {
        addLog('system', 'Request cancelled');
      } else {
        setError(e instanceof Error ? e.message : 'Request failed');
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [config, rpcParams, addLog]);

  /* -- Universal stop ----------------------------------------------- */
  const stop = useCallback(() => {
    if (wsRef.current) {
      try {
        if (config?.kind === 'gql') {
          wsRef.current.send(JSON.stringify({ type: 'complete', id: '1' }));
        }
      } catch {}
      wsRef.current.close();
      wsRef.current = null;
      setConnected(false);
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setLoading(false);
  }, [config]);

  /* -- Close handler (cleanup + onClose) ---------------------------- */
  const handleClose = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
    setConnected(false);
    setLoading(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, handleClose]);

  /* ================================================================ */
  /* Render                                                            */
  /* ================================================================ */

  if (!open || !config) return null;

  const headerBadge = (() => {
    if (config.kind === 'rest') {
      return {
        label: config.method,
        className: METHOD_COLORS[config.method] ?? 'bg-muted text-muted-foreground',
      };
    }
    if (config.kind === 'gql') {
      return KIND_BADGES[config.operationKind] ?? KIND_BADGES.query;
    }
    return (
      KIND_BADGES[config.kind] ?? {
        label: config.kind.toUpperCase(),
        className: 'bg-muted text-muted-foreground',
      }
    );
  })();

  const headerName =
    config.kind === 'rest'
      ? config.path
      : config.kind === 'ws'
        ? config.channelName
        : config.kind === 'gql'
          ? config.operationName
          : config.kind === 'grpc'
            ? `${config.serviceName}.${config.methodName}`
            : config.kind === 'openrpc'
              ? config.methodName
              : '';

  return (
    <div
      className="fixed inset-0 z-200 flex items-center justify-center"
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
    >
      <div className="fixed inset-0 bg-black/60 backdrop-blur-md" onClick={handleClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={cn(
                'shrink-0 rounded px-2 py-0.5 text-xs font-bold',
                headerBadge.className,
              )}
            >
              {headerBadge.label}
            </span>
            <span className="font-mono text-sm text-foreground truncate">{headerName}</span>
          </div>
          <button
            onClick={handleClose}
            className="cursor-pointer rounded-lg p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {config.kind === 'rest' && config.summary && (
          <p className="px-5 pt-3 text-sm text-muted-foreground">{config.summary}</p>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* ---- REST content ---- */}
          {config.kind === 'rest' && (
            <>
              {/* URL preview */}
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  URL
                </label>
                <div className="mt-1 rounded-lg border bg-muted/40 px-3 py-2 font-mono text-sm text-foreground break-all">
                  {resolvedUrl}
                </div>
              </div>

              {/* Authentication */}
              {config.securitySchemes && config.securitySchemes.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Authentication
                  </label>
                  <div className="mt-1 space-y-2">
                    {config.securitySchemes.map((s) => (
                      <InputField
                        key={s.name}
                        label={
                          s.type === 'http' && s.scheme === 'bearer'
                            ? 'Bearer Token'
                            : s.type === 'apiKey'
                              ? (s.paramName ?? s.name)
                              : s.name
                        }
                        value={authValues[s.name] ?? ''}
                        onChange={(v) => setAuthValues((prev) => ({ ...prev, [s.name]: v }))}
                        placeholder={
                          s.type === 'http' && s.scheme === 'bearer'
                            ? 'JWT token'
                            : s.type === 'apiKey'
                              ? 'API key'
                              : 'Token'
                        }
                        type="password"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Path params */}
              {config.pathParams.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Path Parameters
                  </label>
                  <div className="mt-1 space-y-2">
                    {config.pathParams.map((p) => (
                      <InputField
                        key={p.name}
                        label={p.name}
                        value={pathValues[p.name] ?? ''}
                        onChange={(v) => setPathValues((prev) => ({ ...prev, [p.name]: v }))}
                        placeholder={p.type}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Query params */}
              {config.queryParams.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Query Parameters
                  </label>
                  <div className="mt-1 space-y-2">
                    {config.queryParams.map((q) => (
                      <InputField
                        key={q.name}
                        label={q.name}
                        value={queryValues[q.name] ?? ''}
                        onChange={(v) => setQueryValues((prev) => ({ ...prev, [q.name]: v }))}
                        placeholder={q.type}
                        required={q.required}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Header params */}
              {config.headerParams.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Headers
                  </label>
                  <div className="mt-1 space-y-2">
                    {config.headerParams.map((h) => (
                      <InputField
                        key={h.name}
                        label={h.name}
                        value={headerValues[h.name] ?? ''}
                        onChange={(v) => setHeaderValues((prev) => ({ ...prev, [h.name]: v }))}
                        placeholder={h.type}
                        required={h.required}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Body */}
              {config.hasBody && (
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Request Body
                    </label>
                    {!config.isRawBinary &&
                      config.bodyProperties.some((p) => !isFileField(p.type)) && (
                        <button
                          onClick={() => setBodyText(formatJson(bodyText))}
                          className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Format JSON
                        </button>
                      )}
                  </div>
                  {!config.isRawBinary &&
                    config.bodyProperties.some((p) => !isFileField(p.type)) && (
                      <textarea
                        value={bodyText}
                        onChange={(e) => setBodyText(e.target.value)}
                        rows={6}
                        spellCheck={false}
                        className="mt-1 w-full rounded-lg border bg-muted/40 px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-y"
                      />
                    )}
                  {(config.contentType?.toLowerCase() === 'multipart/form-data' ||
                    config.isRawBinary) &&
                    config.bodyProperties.some((p) => isFileField(p.type)) && (
                      <div className="mt-3 space-y-2">
                        {config.bodyProperties
                          .filter((p) => isFileField(p.type))
                          .map((field) => (
                            <div key={field.name} className="flex items-center gap-2">
                              <label className="w-28 shrink-0 text-sm font-mono text-foreground">
                                {field.name}
                                {field.required && <span className="ml-0.5 text-red-500">*</span>}
                              </label>
                              <input
                                type="file"
                                aria-label={field.name}
                                multiple={field.type === 'array of file'}
                                onChange={(event) =>
                                  setBodyFiles((previous) => ({
                                    ...previous,
                                    [field.name]: Array.from(event.target.files ?? []),
                                  }))
                                }
                                className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-1.5 text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:font-medium"
                              />
                            </div>
                          ))}
                      </div>
                    )}
                </div>
              )}
            </>
          )}

          {/* ---- WebSocket content ---- */}
          {config.kind === 'ws' && (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  URL
                </label>
                <div className="mt-1 rounded-lg border bg-muted/40 px-3 py-2 font-mono text-sm text-foreground break-all">
                  {config.url}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <StatusDot connected={connected} />
                {!connected ? (
                  <button
                    onClick={connectWs}
                    className="cursor-pointer rounded-lg bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    Connect
                  </button>
                ) : (
                  <StopButton onClick={disconnectWs} label="Disconnect" />
                )}
              </div>

              {/* Message input */}
              {connected && config.hasPublish && (
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Send Message
                    </label>
                    <button
                      onClick={() => setWsMessageText(formatJson(wsMessageText))}
                      className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Format JSON
                    </button>
                  </div>
                  <textarea
                    value={wsMessageText}
                    onChange={(e) => setWsMessageText(e.target.value)}
                    rows={4}
                    spellCheck={false}
                    className="mt-1 w-full rounded-lg border bg-muted/40 px-3 py-2 font-mono text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-y"
                  />
                  <button
                    onClick={sendWs}
                    className="mt-2 cursor-pointer rounded-lg bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    Send
                  </button>
                </div>
              )}
            </>
          )}

          {/* ---- GraphQL content ---- */}
          {config.kind === 'gql' && (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Endpoint
                </label>
                <div className="mt-1 rounded-lg border bg-muted/40 px-3 py-2 font-mono text-sm text-foreground break-all">
                  {config.operationKind === 'subscription' ? config.wsEndpoint : config.endpoint}
                </div>
              </div>

              {config.operationKind === 'subscription' && (
                <div className="flex items-center justify-between">
                  <StatusDot connected={connected} />
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Query
                </label>
                <CodeEditor value={gqlQuery} onChange={setGqlQuery} language="graphql" rows={8} />
              </div>

              {config.args.length > 0 && (
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Variables
                    </label>
                    <button
                      onClick={() => setGqlVariables(formatJson(gqlVariables))}
                      className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Format JSON
                    </button>
                  </div>
                  <textarea
                    value={gqlVariables}
                    onChange={(e) => setGqlVariables(e.target.value)}
                    rows={3}
                    spellCheck={false}
                    className="mt-1 w-full rounded-lg border bg-muted/40 px-3 py-2 font-mono text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-y"
                  />
                </div>
              )}
            </>
          )}

          {/* ---- gRPC content ---- */}
          {config.kind === 'grpc' && (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Browser bridge
                </label>
                <div className="mt-1 rounded-lg border bg-muted/40 px-3 py-2 font-mono text-sm text-foreground break-all">
                  {config.endpoint}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <code className="rounded bg-muted px-2 py-1">
                  {config.inputType} → {config.outputType}
                </code>
                {config.clientStreaming && (
                  <span className="rounded bg-cyan-100 px-2 py-1 font-bold uppercase text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400">
                    client stream
                  </span>
                )}
                {config.serverStreaming && (
                  <span className="rounded bg-violet-100 px-2 py-1 font-bold uppercase text-violet-800 dark:bg-violet-900/30 dark:text-violet-400">
                    server stream
                  </span>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Request
                  </label>
                  <button
                    onClick={() => setGrpcRequest(formatJson(grpcRequest))}
                    className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Format JSON
                  </button>
                </div>
                <CodeEditor
                  value={grpcRequest}
                  onChange={setGrpcRequest}
                  language="json"
                  rows={6}
                />
              </div>
            </>
          )}

          {/* ---- OpenRPC content ---- */}
          {config.kind === 'openrpc' && (
            <>
              {config.endpoint && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Endpoint
                  </label>
                  <div className="mt-1 rounded-lg border bg-muted/40 px-3 py-2 font-mono text-sm text-foreground break-all">
                    {config.endpoint}
                  </div>
                </div>
              )}

              {config.params.length > 0 && (
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Parameters
                    </label>
                    <button
                      onClick={() => setRpcParams(formatJson(rpcParams))}
                      className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Format JSON
                    </button>
                  </div>
                  <textarea
                    value={rpcParams}
                    onChange={(e) => setRpcParams(e.target.value)}
                    rows={6}
                    spellCheck={false}
                    className="mt-1 w-full rounded-lg border bg-muted/40 px-3 py-2 font-mono text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-y"
                  />
                </div>
              )}
            </>
          )}

          {/* ---- Response / Message Log ---- */}
          {(config.kind === 'ws' ||
            (config.kind === 'gql' && config.operationKind === 'subscription') ||
            (config.kind === 'grpc' && config.serverStreaming) ||
            ((config.kind === 'rest' || config.kind === 'openrpc') && messages.length > 0)) && (
            <div ref={resultSectionRef}>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {config.kind === 'ws'
                  ? 'Messages'
                  : config.kind === 'gql'
                    ? 'Events'
                    : config.kind === 'grpc'
                      ? 'Stream'
                      : 'Stream'}
              </label>
              <MessageLog messages={messages} />
            </div>
          )}

          {/* Single response display (REST non-streaming, GQL query/mutation, OpenRPC non-streaming) */}
          {(response || error) &&
            !(config.kind === 'ws') &&
            !(config.kind === 'gql' && config.operationKind === 'subscription') &&
            !(config.kind === 'grpc' && config.serverStreaming) && (
              <div ref={resultSectionRef}>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Response
                </label>
                {error ? (
                  <div className="mt-1 rounded-lg border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20 px-3 py-2 text-sm text-red-700 dark:text-red-400">
                    {error}
                  </div>
                ) : (
                  response && (
                    <div className="mt-1 rounded-lg border overflow-hidden">
                      <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-1.5">
                        <span
                          className={cn(
                            'text-sm font-mono font-bold',
                            response.status < 300
                              ? 'text-green-600 dark:text-green-400'
                              : response.status < 500
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-red-600 dark:text-red-400',
                          )}
                        >
                          {response.status} {response.statusText}
                        </span>
                        <span className="text-xs text-muted-foreground">{response.time}ms</span>
                      </div>
                      <pre className="p-3 text-sm font-mono leading-relaxed overflow-x-auto max-h-64 overflow-y-auto text-foreground">
                        <code dangerouslySetInnerHTML={{ __html: highlightJson(response.body) }} />
                      </pre>
                    </div>
                  )
                )}
              </div>
            )}

          {/* Error for WS/subscription modes */}
          {error &&
            (config.kind === 'ws' ||
              (config.kind === 'gql' && config.operationKind === 'subscription') ||
              (config.kind === 'grpc' && config.serverStreaming)) && (
              <div
                ref={resultSectionRef}
                className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20 px-3 py-2 text-sm text-red-700 dark:text-red-400"
              >
                {error}
              </div>
            )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <button
            onClick={handleClose}
            className="cursor-pointer rounded-lg border px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            Close
          </button>

          {/* REST buttons */}
          {config.kind === 'rest' && (
            <>
              {loading ? (
                <StopButton onClick={stop} />
              ) : (
                <button
                  onClick={sendRest}
                  className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Send Request
                </button>
              )}
            </>
          )}

          {/* WS buttons are inline in the content */}

          {/* GQL buttons */}
          {config.kind === 'gql' && config.operationKind !== 'subscription' && (
            <>
              {loading ? (
                <StopButton onClick={stop} />
              ) : (
                <button
                  onClick={executeGql}
                  className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Execute
                </button>
              )}
            </>
          )}

          {config.kind === 'gql' && config.operationKind === 'subscription' && (
            <>
              {connected ? (
                <StopButton onClick={unsubscribeGql} label="Unsubscribe" />
              ) : (
                <button
                  onClick={subscribeGql}
                  className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Subscribe
                </button>
              )}
            </>
          )}

          {/* gRPC buttons */}
          {config.kind === 'grpc' && (
            <>
              {loading ? (
                <StopButton
                  onClick={stop}
                  label={config.serverStreaming ? 'Stop stream' : 'Stop'}
                />
              ) : (
                <button
                  onClick={executeGrpc}
                  className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  {config.serverStreaming ? 'Start stream' : 'Execute'}
                </button>
              )}
            </>
          )}

          {/* OpenRPC buttons */}
          {config.kind === 'openrpc' && (
            <>
              {loading ? (
                <StopButton onClick={stop} />
              ) : (
                <button
                  onClick={executeRpc}
                  className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Execute
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
