'use client';

import { use } from 'react';
import { McpReference } from '@/components/docs/mcp-reference';

export default function McpToolPage({ params }: { params: Promise<{ tool: string }> }) {
  const { tool } = use(params);
  return <McpReference scrollTarget={tool} />;
}
