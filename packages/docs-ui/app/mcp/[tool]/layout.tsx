import { mcpStaticParams } from '@/lib/static-route-params';

export const dynamicParams = false;

export function generateStaticParams(): Promise<Array<{ tool: string }>> {
  return mcpStaticParams();
}

export default function McpToolLayout({ children }: { children: React.ReactNode }) {
  return children;
}
