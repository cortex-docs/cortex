import { DocsHeader } from '@/components/docs/docs-header';

export default function ApiReferenceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <DocsHeader />
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}
