import { DocsHeader } from '@/components/docs/docs-header';

export default function McpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <DocsHeader />
      <main className="flex-1">{children}</main>
    </div>
  );
}
