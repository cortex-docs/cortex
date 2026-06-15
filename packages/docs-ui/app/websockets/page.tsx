import { DocsHeader } from '@/components/docs/docs-header';
import { AsyncApiViewer } from '@/components/docs/asyncapi-viewer';

export default function WebSocketsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <DocsHeader />
      <main className="flex-1">
        <AsyncApiViewer specUrl="/api/asyncapi" />
      </main>
    </div>
  );
}
