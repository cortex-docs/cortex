'use client';

import { useTheme } from 'next-themes';
import { useCallback, useEffect, useState } from 'react';
import { useProjectWatch } from '@/lib/use-project-watch';
import { cn } from '@/lib/utils';

interface AsyncApiViewerProps {
  specUrl: string;
}

interface Channel {
  name: string;
  description?: string;
  subscribe?: { summary?: string; message?: { payload?: Record<string, unknown> } };
  publish?: { summary?: string; message?: { payload?: Record<string, unknown> } };
}

interface AsyncApiData {
  info?: { title?: string; version?: string; description?: string };
  servers?: Record<string, { url?: string; protocol?: string; description?: string }>;
  channels?: Record<string, Channel>;
}

export function AsyncApiViewer({ specUrl }: AsyncApiViewerProps) {
  const { resolvedTheme } = useTheme();
  const [data, setData] = useState<AsyncApiData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const fetchData = useCallback(() => {
    fetch(specUrl)
      .then(async (res) => {
        if (!res.ok) {
          setError('No AsyncAPI spec configured. Pass --asyncapi to cortex docs serve.');
          return;
        }
        const text = await res.text();
        const contentType = res.headers.get('content-type') ?? '';
        if (contentType.includes('yaml') || contentType.includes('text')) {
          const { load } = await import('js-yaml');
          setData(load(text) as AsyncApiData);
        } else {
          setData(JSON.parse(text));
        }
      })
      .catch(() => setError('Failed to load AsyncAPI spec'));
  }, [specUrl]);

  useEffect(() => {
    setMounted(true);
    fetchData();
  }, [fetchData]);
  useProjectWatch(fetchData);

  if (!mounted) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

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

  const channels = data.channels ? Object.entries(data.channels) : [];
  const servers = data.servers ? Object.entries(data.servers) : [];

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 text-sm text-muted-foreground mb-2">
          <span>v{data.info?.version}</span>
          <span>AsyncAPI</span>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
            WebSocket
          </span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{data.info?.title}</h1>
        {data.info?.description && (
          <p className="mt-2 text-muted-foreground">{data.info.description}</p>
        )}
      </div>

      {servers.length > 0 && (
        <div className="mb-8 rounded-lg border p-4">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground mb-3">Servers</h2>
          {servers.map(([name, server]) => (
            <div key={name} className="flex items-center gap-3">
              <code className="rounded bg-muted px-2 py-1 text-sm font-mono">{server.url}</code>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                {server.protocol}
              </span>
              {server.description && (
                <span className="text-sm text-muted-foreground">{server.description}</span>
              )}
            </div>
          ))}
        </div>
      )}

      <h2 className="text-xl font-semibold mb-4">Channels</h2>
      <div className="space-y-4">
        {channels.map(([name, channel]) => (
          <div key={name} className="rounded-lg border">
            <div className="flex items-center gap-3 border-b px-4 py-3">
              <code className="font-mono font-semibold">{name}</code>
              <div className="flex gap-1.5">
                {channel.subscribe && (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
                    SUB
                  </span>
                )}
                {channel.publish && (
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                    PUB
                  </span>
                )}
              </div>
            </div>
            <div className="px-4 py-3 space-y-2">
              {channel.description && (
                <p className="text-sm text-muted-foreground">{channel.description}</p>
              )}
              {channel.subscribe && (
                <div>
                  <span className="text-xs font-semibold uppercase text-green-600 dark:text-green-400">Subscribe</span>
                  <p className="text-sm">{channel.subscribe.summary}</p>
                  {channel.subscribe.message?.payload && (
                    <pre className="mt-2 overflow-x-auto rounded bg-muted p-3 text-xs font-mono">
                      {JSON.stringify(channel.subscribe.message.payload, null, 2)}
                    </pre>
                  )}
                </div>
              )}
              {channel.publish && (
                <div>
                  <span className="text-xs font-semibold uppercase text-orange-600 dark:text-orange-400">Publish</span>
                  <p className="text-sm">{channel.publish.summary}</p>
                  {channel.publish.message?.payload && (
                    <pre className="mt-2 overflow-x-auto rounded bg-muted p-3 text-xs font-mono">
                      {JSON.stringify(channel.publish.message.payload, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
