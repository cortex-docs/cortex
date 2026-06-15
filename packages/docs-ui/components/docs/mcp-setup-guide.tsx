'use client';

import { useEffect, useState } from 'react';

export function McpSetupGuide() {
  const [html, setHtml] = useState<string>('');

  useEffect(() => {
    fetch('/api/mcp')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.setupHtml) setHtml(data.setupHtml);
      })
      .catch(() => {});
  }, []);

  if (!html) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="docs-content" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
