'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { DocsHeader } from '@/components/docs/docs-header';
import { useProjectWatch } from '@/lib/use-project-watch';

export interface DocsDocument {
  title: string;
  slug: string;
  content: string;
  markdown: string;
}

export interface DocsSection {
  section: string;
  documents: DocsDocument[];
}

export interface DocsResponse {
  sections: DocsSection[];
}

interface DocsContextValue {
  data: DocsResponse | null;
  allDocs: DocsDocument[];
}

const DocsContext = createContext<DocsContextValue | null>(null);

export function useDocs(): DocsContextValue {
  const context = useContext(DocsContext);
  if (!context) throw new Error('useDocs must be used within DocsShell.');
  return context;
}

export function DocsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [data, setData] = useState<DocsResponse | null>(null);

  const fetchDocs = useCallback(() => {
    fetch('/api/docs')
      .then((response) => response.json())
      .then((response: DocsResponse) => setData(response));
  }, []);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);
  useProjectWatch(fetchDocs);

  const allDocs = useMemo(
    () => data?.sections.flatMap((section) => section.documents) ?? [],
    [data],
  );
  const activeSlug = pathname?.startsWith('/docs/')
    ? pathname.slice('/docs/'.length).split('/')[0]
    : undefined;

  return (
    <DocsContext.Provider value={{ data, allDocs }}>
      <div className="min-h-screen bg-background">
        <DocsHeader />
        <div className="flex">
          <aside className="w-64 shrink-0 border-r border-border p-4 sticky top-0 h-[calc(100vh-88px)] overflow-y-auto">
            {data?.sections.map((section, index) => (
              <div key={`${section.section}-${index}`} className="mb-6">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2 px-2">
                  {section.section}
                </h3>
                <ul className="space-y-0.5">
                  {section.documents.map((document) => (
                    <li key={document.slug}>
                      <Link
                        href={`/docs/${document.slug}`}
                        className={`block w-full text-left text-sm px-2.5 py-1.5 rounded-lg transition-all ${
                          activeSlug === document.slug
                            ? 'bg-accent text-accent-foreground font-medium'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                        }`}
                      >
                        {document.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {data && data.sections.length === 0 && (
              <p className="text-sm text-muted-foreground px-2">
                No documentation sections configured.
              </p>
            )}
          </aside>
          {children}
        </div>
      </div>
    </DocsContext.Provider>
  );
}
