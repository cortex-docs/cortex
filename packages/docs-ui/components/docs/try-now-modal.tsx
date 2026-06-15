'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import hljs from 'highlight.js/lib/core';
import hljsJson from 'highlight.js/lib/languages/json';
import { cn } from '@/lib/utils';

hljs.registerLanguage('json', hljsJson);

interface SecuritySchemeInput {
  name: string;
  type: string;
  scheme?: string;
  bearerFormat?: string;
  in?: string;
  paramName?: string;
}

interface TryNowModalProps {
  open: boolean;
  onClose: () => void;
  method: string;
  path: string;
  baseUrl: string;
  summary?: string;
  pathParams: Array<{ name: string; type: string }>;
  queryParams: Array<{ name: string; type: string; required: boolean }>;
  headerParams: Array<{ name: string; type: string; required: boolean }>;
  securitySchemes?: SecuritySchemeInput[];
  hasBody: boolean;
  bodyProperties: Array<{ name: string; type: string; required: boolean }>;
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  POST: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  PUT: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  DELETE: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  PATCH: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
};

function formatJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function highlightJson(text: string): string {
  try {
    return hljs.highlight(text, { language: 'json' }).value;
  } catch {
    return text;
  }
}

function defaultValue(type: string): string {
  if (type === 'integer' || type === 'number') return '';
  if (type === 'boolean') return 'false';
  return '';
}

export function TryNowModal({
  open,
  onClose,
  method,
  path,
  baseUrl,
  summary,
  pathParams,
  queryParams,
  headerParams,
  securitySchemes,
  hasBody,
  bodyProperties,
}: TryNowModalProps) {
  const [pathValues, setPathValues] = useState<Record<string, string>>({});
  const [queryValues, setQueryValues] = useState<Record<string, string>>({});
  const [headerValues, setHeaderValues] = useState<Record<string, string>>({});
  const [authValues, setAuthValues] = useState<Record<string, string>>({});
  const [bodyText, setBodyText] = useState(() => {
    if (!hasBody || bodyProperties.length === 0) return '';
    const obj: Record<string, unknown> = {};
    for (const p of bodyProperties) {
      if (p.type === 'integer' || p.type === 'number') obj[p.name] = 0;
      else if (p.type === 'boolean') obj[p.name] = false;
      else obj[p.name] = '';
    }
    return JSON.stringify(obj, null, 2);
  });
  const [response, setResponse] = useState<{
    status: number;
    statusText: string;
    body: string;
    time: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setResponse(null);
      setError(null);
      setLoading(false);
      setPathValues({});
      setQueryValues({});
      setHeaderValues({});
      setAuthValues({});
      if (hasBody && bodyProperties.length > 0) {
        const obj: Record<string, unknown> = {};
        for (const p of bodyProperties) {
          if (p.type === 'integer' || p.type === 'number') obj[p.name] = 0;
          else if (p.type === 'boolean') obj[p.name] = false;
          else obj[p.name] = '';
        }
        setBodyText(JSON.stringify(obj, null, 2));
      } else {
        setBodyText('');
      }
    }
  }, [open, path, method]);

  const resolvedUrl = useMemo(() => {
    let url = path;
    for (const p of pathParams) {
      url = url.replace(`{${p.name}}`, pathValues[p.name] || `{${p.name}}`);
    }
    const qp = new URLSearchParams();
    for (const q of queryParams) {
      const v = queryValues[q.name];
      if (v) qp.set(q.name, v);
    }
    for (const s of securitySchemes ?? []) {
      if (s.type === 'apiKey' && s.in === 'query' && s.paramName) {
        const v = authValues[s.name];
        if (v) qp.set(s.paramName, v);
      }
    }
    const qs = qp.toString();
    return `${baseUrl}${url}${qs ? `?${qs}` : ''}`;
  }, [
    path,
    baseUrl,
    pathParams,
    pathValues,
    queryParams,
    queryValues,
    securitySchemes,
    authValues,
  ]);

  const send = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResponse(null);
    const start = performance.now();
    try {
      const hdrs: Record<string, string> = { 'Content-Type': 'application/json' };
      for (const h of headerParams) {
        const v = headerValues[h.name];
        if (v) hdrs[h.name] = v;
      }
      for (const s of securitySchemes ?? []) {
        const v = authValues[s.name];
        if (!v) continue;
        if (s.type === 'http' && s.scheme === 'bearer') {
          hdrs['Authorization'] = `Bearer ${v}`;
        } else if (s.type === 'apiKey' && s.in === 'header' && s.paramName) {
          hdrs[s.paramName] = v;
        }
      }
      const opts: RequestInit = {
        method,
        headers: hdrs,
      };
      if (hasBody && bodyText.trim()) {
        opts.body = bodyText;
      }
      const res = await fetch(resolvedUrl, opts);
      const text = await res.text();
      const time = Math.round(performance.now() - start);
      let body = text;
      try {
        body = JSON.stringify(JSON.parse(text), null, 2);
      } catch {}
      setResponse({ status: res.status, statusText: res.statusText, body, time });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }, [method, resolvedUrl, hasBody, bodyText]);

  const formatBody = useCallback(() => {
    setBodyText(formatJson(bodyText));
  }, [bodyText]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
    >
      <div className="fixed inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'rounded px-2 py-0.5 text-xs font-bold',
                METHOD_COLORS[method] ?? 'bg-muted text-muted-foreground',
              )}
            >
              {method}
            </span>
            <span className="font-mono text-sm text-foreground">{path}</span>
          </div>
          <button
            onClick={onClose}
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

        {summary && <p className="px-5 pt-3 text-sm text-muted-foreground">{summary}</p>}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
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
          {securitySchemes && securitySchemes.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Authentication
              </label>
              <div className="mt-1 space-y-2">
                {securitySchemes.map((s) => (
                  <div key={s.name} className="flex items-center gap-2">
                    <label className="w-28 shrink-0 text-sm font-mono text-foreground">
                      {s.type === 'http' && s.scheme === 'bearer'
                        ? 'Bearer Token'
                        : s.type === 'apiKey'
                          ? (s.paramName ?? s.name)
                          : s.name}
                    </label>
                    <input
                      type="password"
                      value={authValues[s.name] ?? ''}
                      onChange={(e) => setAuthValues((v) => ({ ...v, [s.name]: e.target.value }))}
                      placeholder={
                        s.type === 'http' && s.scheme === 'bearer'
                          ? 'JWT token'
                          : s.type === 'apiKey'
                            ? 'API key'
                            : 'Token'
                      }
                      className="flex-1 rounded-lg border bg-background px-3 py-1.5 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Path params */}
          {pathParams.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Path Parameters
              </label>
              <div className="mt-1 space-y-2">
                {pathParams.map((p) => (
                  <div key={p.name} className="flex items-center gap-2">
                    <label className="w-28 shrink-0 text-sm font-mono text-foreground">
                      {p.name}
                    </label>
                    <input
                      type="text"
                      value={pathValues[p.name] ?? ''}
                      onChange={(e) => setPathValues((v) => ({ ...v, [p.name]: e.target.value }))}
                      placeholder={p.type}
                      className="flex-1 rounded-lg border bg-background px-3 py-1.5 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Query params */}
          {queryParams.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Query Parameters
              </label>
              <div className="mt-1 space-y-2">
                {queryParams.map((q) => (
                  <div key={q.name} className="flex items-center gap-2">
                    <label className="w-28 shrink-0 text-sm font-mono text-foreground">
                      {q.name}
                      {q.required && <span className="text-red-500 ml-0.5">*</span>}
                    </label>
                    <input
                      type="text"
                      value={queryValues[q.name] ?? ''}
                      onChange={(e) => setQueryValues((v) => ({ ...v, [q.name]: e.target.value }))}
                      placeholder={q.type}
                      className="flex-1 rounded-lg border bg-background px-3 py-1.5 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Header params */}
          {headerParams.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Headers
              </label>
              <div className="mt-1 space-y-2">
                {headerParams.map((h) => (
                  <div key={h.name} className="flex items-center gap-2">
                    <label className="w-28 shrink-0 text-sm font-mono text-foreground">
                      {h.name}
                      {h.required && <span className="text-red-500 ml-0.5">*</span>}
                    </label>
                    <input
                      type="text"
                      value={headerValues[h.name] ?? ''}
                      onChange={(e) => setHeaderValues((v) => ({ ...v, [h.name]: e.target.value }))}
                      placeholder={h.type}
                      className="flex-1 rounded-lg border bg-background px-3 py-1.5 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Body */}
          {hasBody && (
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Request Body
                </label>
                <button
                  onClick={formatBody}
                  className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Format JSON
                </button>
              </div>
              <textarea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                rows={8}
                spellCheck={false}
                className="mt-1 w-full rounded-lg border bg-muted/40 px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-y"
              />
            </div>
          )}

          {/* Response */}
          {(response || error) && (
            <div>
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
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg border px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            Close
          </button>
          <button
            onClick={send}
            disabled={loading}
            className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Sending...' : 'Send Request'}
          </button>
        </div>
      </div>
    </div>
  );
}
