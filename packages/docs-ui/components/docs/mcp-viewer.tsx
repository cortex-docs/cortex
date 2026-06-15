'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface McpParam {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

interface McpTool {
  name: string;
  source: 'rest' | 'websocket';
  description: string;
  method?: string;
  path?: string;
  channel?: string;
  parameters: McpParam[];
}

interface McpInfo {
  serverName: string;
  transport: string;
  tools: McpTool[];
}

export function McpViewer() {
  const [data, setData] = useState<McpInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'rest' | 'websocket'>('all');

  useEffect(() => {
    fetch('/api/mcp')
      .then(async (res) => {
        if (!res.ok) {
          setError('Failed to load MCP tools. Make sure a spec is configured.');
          return;
        }
        setData(await res.json());
      })
      .catch(() => setError('Failed to load MCP tools'));
  }, []);

  if (error) {
    return (
      <div className="flex h-[50vh] items-center justify-center text-muted-foreground">
        <p>{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  const filteredTools = filter === 'all' ? data.tools : data.tools.filter((t) => t.source === filter);
  const restCount = data.tools.filter((t) => t.source === 'rest').length;
  const wsCount = data.tools.filter((t) => t.source === 'websocket').length;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 text-sm text-muted-foreground mb-2">
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800 dark:bg-violet-900 dark:text-violet-200">
            MCP
          </span>
          <span>{data.transport} transport</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{data.serverName}</h1>
        <p className="mt-2 text-muted-foreground">
          {data.tools.length} tools available for AI agents — {restCount} REST, {wsCount} WebSocket
        </p>
      </div>

      <div className="mb-6 rounded-lg border p-4">
        <h2 className="text-sm font-semibold uppercase text-muted-foreground mb-3">Usage</h2>
        <pre className="overflow-x-auto rounded bg-muted p-3 text-sm font-mono">
{`// Claude Code, Cursor, or any MCP client
{
  "mcpServers": {
    "${data.serverName}": {
      "command": "node",
      "args": ["./generated/mcp-server/dist/main.js"]
    }
  }
}`}
        </pre>
      </div>

      <div className="mb-6 flex items-center gap-2">
        <span className="text-sm text-muted-foreground mr-2">Filter:</span>
        {(['all', 'rest', 'websocket'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              filter === f
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent',
            )}
          >
            {f === 'all' ? `All (${data.tools.length})` : f === 'rest' ? `REST (${restCount})` : `WebSocket (${wsCount})`}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filteredTools.map((tool) => (
          <div key={tool.name} className="rounded-lg border">
            <div className="flex items-center gap-3 px-4 py-3 border-b">
              <code className="font-mono font-semibold text-sm">{tool.name}</code>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-medium',
                  tool.source === 'rest'
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
                )}
              >
                {tool.source === 'rest' ? 'REST' : 'WS'}
              </span>
              {tool.method && (
                <span className={cn(
                  'rounded px-1.5 py-0.5 text-xs font-bold',
                  tool.method === 'GET' ? 'text-blue-600 dark:text-blue-400' :
                  tool.method === 'POST' ? 'text-green-600 dark:text-green-400' :
                  tool.method === 'PUT' ? 'text-orange-600 dark:text-orange-400' :
                  tool.method === 'DELETE' ? 'text-red-600 dark:text-red-400' :
                  'text-muted-foreground',
                )}>
                  {tool.method}
                </span>
              )}
              {tool.path && <code className="text-xs text-muted-foreground font-mono">{tool.path}</code>}
              {tool.channel && <code className="text-xs text-muted-foreground font-mono">{tool.channel}</code>}
            </div>
            <div className="px-4 py-3">
              <p className="text-sm text-muted-foreground">{tool.description}</p>
              {tool.parameters.length > 0 && (
                <div className="mt-3">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">Parameters</span>
                  <div className="mt-1.5 space-y-1">
                    {tool.parameters.map((param) => (
                      <div key={param.name} className="flex items-baseline gap-2 text-sm">
                        <code className="font-mono text-xs">{param.name}</code>
                        <span className="text-xs text-muted-foreground">{param.type}</span>
                        {param.required && (
                          <span className="text-xs text-red-500 dark:text-red-400">required</span>
                        )}
                        {param.description && (
                          <span className="text-xs text-muted-foreground">— {param.description}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
