'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProjectWatch } from '@/lib/use-project-watch';
import hljs from 'highlight.js/lib/languages/json';
import hljsCore from 'highlight.js/lib/core';
import { cn } from '@/lib/utils';
import { McpSetupGuide } from '@/components/docs/mcp-setup-guide';
import { DocsBreadcrumb } from '@/components/docs/docs-breadcrumb';

hljsCore.registerLanguage('json', hljs);

function HighlightedSnippet({ code }: { code: string }) {
  const html = useMemo(() => {
    const jsonPart = code.replace(/^\/\/.*\n?/gm, '').trim();
    if (jsonPart.startsWith('{')) {
      try {
        const highlighted = hljsCore.highlight(jsonPart, { language: 'json' }).value;
        const comments = code.match(/^\/\/.*$/gm) || [];
        const commentHtml = comments.map((c) => `<span class="hljs-comment">${c}</span>`).join('\n');
        return commentHtml + (commentHtml ? '\n' : '') + highlighted;
      } catch {}
    }
    return code.replace(/^(\/\/.*)$/gm, '<span class="hljs-comment">$1</span>');
  }, [code]);

  return (
    <pre className="p-4 font-mono text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
      <code dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  );
}

interface McpToolParam {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

interface McpTool {
  name: string;
  source: 'rest' | 'websocket' | 'graphql' | 'grpc' | 'docs';
  description: string;
  method?: string;
  path?: string;
  channel?: string;
  operationType?: string;
  serviceName?: string;
  parameters: McpToolParam[];
}

interface McpData {
  serverName: string;
  packageName: string;
  instructions: string;
  instructionsHtml: string;
  tools: McpTool[];
  readme: string;
  setupMarkdown: string;
  setupHtml: string;
}

function cardId(name: string) {
  return `mcp-${name}`;
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
      className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-zinc-800 hover:text-foreground transition-colors"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

export function McpReference({ scrollTarget }: { scrollTarget?: string }) {
  const [data, setData] = useState<McpData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string>('mcp-client-setup');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const isScrollingRef = useRef(false);

  const fetchData = useCallback(() => {
    fetch('/api/mcp')
      .then(async (res) => {
        if (!res.ok) { setError('Failed to load MCP data.'); return; }
        setData(await res.json());
      })
      .catch(() => setError('Failed to load MCP data'));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useProjectWatch(fetchData);

  useEffect(() => {
    if (!data) return;
    observerRef.current?.disconnect();
    const visibleIds = new Set<string>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visibleIds.add(entry.target.id);
          else visibleIds.delete(entry.target.id);
        }
        if (isScrollingRef.current) return;
        if (visibleIds.has('mcp-client-setup')) { setActiveId('mcp-client-setup'); return; }
        const cards = document.querySelectorAll('[data-mcp-card]');
        for (const card of cards) {
          if (visibleIds.has(card.id)) { setActiveId(card.id); return; }
        }
      },
      { rootMargin: '-60px 0px -40% 0px', threshold: 0.1 },
    );
    observerRef.current = observer;
    requestAnimationFrame(() => {
      const setupEl = document.getElementById('mcp-client-setup');
      if (setupEl) observer.observe(setupEl);
      document.querySelectorAll('[data-mcp-card]').forEach((el) => observer.observe(el));
    });
    return () => observer.disconnect();
  }, [data]);

  useEffect(() => {
    if (!data || !scrollTarget) return;
    const id = cardId(scrollTarget);
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActiveId(id);
      }
    });
  }, [data, scrollTarget]);

  useEffect(() => {
    if (!activeId || activeId === 'mcp-client-setup') return;
    const toolName = activeId.replace('mcp-', '');
    const newPath = `/mcp/${toolName}`;
    if (window.location.pathname !== newPath) {
      window.history.replaceState(null, '', newPath);
    }
  }, [activeId]);

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

  function getSnippet(): string {
    if (!data || activeId === 'mcp-client-setup') return '';
    const tool = data.tools.find((t) => cardId(t.name) === activeId);
    if (!tool) return '';
    if (tool.source === 'docs') {
      return [
        `// Call this tool to get full content`,
        `// The agent receives the complete markdown`,
        `// document to use as context.`,
        ``,
        `{`,
        `  "name": "${tool.name}",`,
        `  "arguments": {}`,
        `}`,
        ``,
        `// Returns: full document content (markdown)`,
      ].join('\n');
    }
    const args: Record<string, string> = {};
    for (const p of tool.parameters) args[p.name] = `<${p.type}>`;
    return `// MCP tool call\n{\n  "name": "${tool.name}",\n  "arguments": ${JSON.stringify(args, null, 4).split('\n').map((l, i) => i === 0 ? l : '  ' + l).join('\n')}\n}`;
  }

  const activeSection = activeId === 'mcp-client-setup' ? 'setup' : 'tools';

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
  const activeLabel = activeId === 'mcp-client-setup' ? 'Client Setup'
    : data.tools.find((t) => cardId(t.name) === activeId)?.name ?? 'MCP';

  return (
    <div className="relative flex h-[calc(100vh-5.5rem)]">
      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed bottom-4 left-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg lg:hidden"
        aria-label="Toggle navigation"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {sidebarOpen ? <path d="M18 6 6 18M6 6l12 12" /> : <><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></>}
        </svg>
      </button>

      {/* ---- Left sidebar ---- */}
      <aside
        className={cn(
          'fixed inset-y-22 left-0 z-40 w-56 shrink-0 overflow-y-auto border-r bg-background px-3 py-4 transition-transform lg:relative lg:inset-y-auto lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >


        <NavSection
          title="Setup"
          expanded={activeSection === 'setup'}
          onClickHeader={() => scrollTo('mcp-client-setup')}
        >
          <NavGroup label="Guides">
            <NavItem active={activeId === 'mcp-client-setup'} onClick={() => scrollTo('mcp-client-setup')}>
              Client Setup
            </NavItem>
          </NavGroup>
        </NavSection>

        <NavSection
          title="Tools"
          expanded={activeSection === 'tools'}
          onClickHeader={() => {
            if (data.tools.length > 0) scrollTo(cardId(data.tools[0].name));
          }}
        >
          <NavGroup label={`${data.tools.length} tools`}>
            {data.tools.map((tool) => {
              const id = cardId(tool.name);
              const badgeStyle = tool.source === 'rest' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                : tool.source === 'websocket' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                : tool.source === 'graphql' ? 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400'
                : tool.source === 'docs' ? 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400'
                : 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
              const badgeLabel = tool.source === 'rest' ? 'REST' : tool.source === 'websocket' ? 'WS' : tool.source === 'graphql' ? 'GQL' : tool.source === 'docs' ? 'DOCS' : 'gRPC';
              return (
                <NavItem key={id} active={activeId === id} onClick={() => scrollTo(id)}>
                  <span className={cn('mr-1.5 inline-block rounded px-1 py-0.5 text-center text-[10px] font-bold uppercase leading-none', badgeStyle)}>
                    {badgeLabel}
                  </span>
                  <span className="truncate">{tool.name}</span>
                </NavItem>
              );
            })}
          </NavGroup>
        </NavSection>
      </aside>

      {/* ---- Center panel ---- */}
      <main className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/30">
          <DocsBreadcrumb segments={[
            { label: 'MCP', href: '/mcp' },
            ...(activeId !== 'mcp-client-setup' && data
              ? [{ label: data.tools.find((t) => cardId(t.name) === activeId)?.name ?? 'Tools' }]
              : [{ label: 'Setup' }]),
          ]} />
        </div>
        <div className="px-6 py-6 lg:px-8">
        {/* Client Setup */}
        <div id="mcp-client-setup" data-mcp-card className="mb-8">
          <McpSetupGuide />
        </div>

        {/* Agent Instructions */}
        {data.instructionsHtml && (
          <div className="mb-8">
            <h2 className="mb-3 text-xl font-semibold">Agent Instructions</h2>
            <div className="rounded-lg border border-border bg-muted/40 p-6">
              <div className="docs-content" dangerouslySetInnerHTML={{ __html: data.instructionsHtml }} />
            </div>
          </div>
        )}

        {/* Tools */}
        <h2 className="mb-3 text-xl font-semibold">Tools</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {data.tools.length} tools available for AI agents via <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs">{data.serverName}</code>
        </p>
        <div className="space-y-3">
          {data.tools.map((tool) => {
            const badgeStyle = tool.source === 'rest' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
              : tool.source === 'websocket' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
              : tool.source === 'graphql' ? 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400'
              : tool.source === 'docs' ? 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400'
              : 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
            const badgeLabel = tool.source === 'rest' ? 'REST' : tool.source === 'websocket' ? 'WS' : tool.source === 'graphql' ? 'GQL' : tool.source === 'docs' ? 'DOCS' : 'gRPC';
            return (
              <div key={tool.name} id={cardId(tool.name)} data-mcp-card className="rounded-lg border">
                <div className="flex items-center gap-3 border-b px-4 py-3">
                  <code className="font-mono text-sm font-semibold">{tool.name}</code>
                  <span className={cn('rounded px-2 py-0.5 text-xs font-bold', badgeStyle)}>{badgeLabel}</span>
                  {tool.method && (
                    <span className={cn(
                      'text-xs font-bold',
                      tool.method === 'GET' ? 'text-blue-600 dark:text-blue-400' :
                      tool.method === 'POST' ? 'text-green-600 dark:text-green-400' :
                      tool.method === 'PUT' ? 'text-orange-600 dark:text-orange-400' :
                      tool.method === 'DELETE' ? 'text-red-600 dark:text-red-400' :
                      'text-muted-foreground',
                    )}>{tool.method}</span>
                  )}
                  {tool.path && <code className="text-xs text-muted-foreground font-mono">{tool.path}</code>}
                  {tool.channel && <code className="text-xs text-muted-foreground font-mono">{tool.channel}</code>}
                  {tool.operationType && <span className="text-xs text-muted-foreground">{tool.operationType}</span>}
                  {tool.serviceName && <span className="text-xs text-muted-foreground font-mono">{tool.serviceName}</span>}
                </div>
                <div className="px-4 py-3 space-y-3">
                  <p className="text-sm text-muted-foreground">{tool.description}</p>
                  {tool.parameters.length > 0 && (
                    <table className="mt-2 w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs text-muted-foreground">
                          <th className="pb-1.5 pr-4 font-medium">Name</th>
                          <th className="pb-1.5 pr-4 font-medium">Type</th>
                          <th className="pb-1.5 font-medium">Required</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tool.parameters.map((p) => (
                          <tr key={p.name} className="border-b last:border-0">
                            <td className="py-1.5 pr-4 font-mono text-xs">{p.name}</td>
                            <td className="py-1.5 pr-4 text-xs text-muted-foreground">{p.type}</td>
                            <td className="py-1.5 text-xs">
                              {p.required
                                ? <span className="text-red-500 dark:text-red-400">required</span>
                                : <span className="text-muted-foreground">optional</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        </div>
      </main>

      {/* ---- Right sidebar (snippet) ---- */}
      <aside className="hidden w-[420px] shrink-0 border-l xl:block">
        <div className="sticky top-22 flex h-[calc(100vh-5.5rem)] flex-col">
          {snippet ? (
            <div className="flex-1 overflow-y-auto bg-muted/40 p-0">
              <div className="flex items-center justify-between border-b border-border px-4 py-2">
                <span className="truncate font-mono text-xs text-muted-foreground">{activeLabel}</span>
                <CopyButton text={snippet} />
              </div>
              <HighlightedSnippet code={snippet} />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Select a tool to see its MCP call
            </div>
          )}
        </div>
      </aside>
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
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn('transition-transform', expanded ? 'rotate-90' : '')}>
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

function NavItem({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (active && ref.current) ref.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [active]);
  return (
    <button
      ref={ref}
      onClick={onClick}
      className={cn(
        'flex w-full cursor-pointer items-center rounded px-2 py-1 text-left text-xs transition-colors',
        active ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}
