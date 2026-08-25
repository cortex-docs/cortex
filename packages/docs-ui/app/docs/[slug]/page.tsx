'use client';

import { use, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

import { BuiltWithCortexCard } from '@/components/docs/built-with-cortex-card';
import { DocsBreadcrumb, type BreadcrumbSegment } from '@/components/docs/docs-breadcrumb';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useDocs } from '../docs-shell';

interface TocItem {
  id: string;
  text: string;
  level: number;
}

function extractToc(html: string): TocItem[] {
  const items: TocItem[] = [];
  const re = /<h([1-3])\s+id="([^"]+)"[^>]*>(.*?)<\/h[1-3]>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const text = m[3].replace(/<[^>]+>/g, '').trim();
    if (text) items.push({ id: m[2], level: parseInt(m[1], 10), text });
  }
  return items;
}

function TableOfContents({
  items,
  activeId,
  scrollContainer,
}: {
  items: TocItem[];
  activeId: string;
  scrollContainer: HTMLElement | null;
}) {
  if (items.length === 0) return null;

  return (
    <nav className="space-y-1">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3">
        On this page
      </h4>
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => {
            const el = scrollContainer?.querySelector(`#${CSS.escape(item.id)}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          className={cn(
            'block w-full text-left text-[13px] py-1 transition-colors cursor-pointer',
            item.level === 1 && 'font-medium',
            item.level === 2 && 'pl-3',
            item.level === 3 && 'pl-6',
            activeId === item.id
              ? 'text-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {item.text}
        </button>
      ))}
    </nav>
  );
}

function CopyPageButton({ markdown }: { markdown: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(markdown).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors cursor-pointer"
    >
      {copied ? (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
      {copied ? 'Copied!' : 'Copy page'}
    </button>
  );
}

export default function DocSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { data, allDocs } = useDocs();
  const mainRef = useRef<HTMLElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const [activeTocId, setActiveTocId] = useState('');
  const [tocSpacer, setTocSpacer] = useState(0);

  const currentIndex = allDocs.findIndex((d) => d.slug === slug);
  const nextDoc = currentIndex >= 0 ? allDocs[currentIndex + 1] : undefined;
  const prevDoc = currentIndex > 0 ? allDocs[currentIndex - 1] : undefined;

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    el.scrollTop = 0;
  }, [slug]);

  const activeDoc = allDocs[currentIndex];

  const tocItems = useMemo(() => (activeDoc ? extractToc(activeDoc.content) : []), [activeDoc]);

  useEffect(() => {
    const container = mainRef.current;
    if (!container || tocItems.length === 0) return;

    const handleScroll = () => {
      const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 50;

      if (nearBottom) {
        setActiveTocId(tocItems[tocItems.length - 1].id);
        return;
      }

      const headings = tocItems
        .map((item) => container.querySelector(`#${CSS.escape(item.id)}`))
        .filter(Boolean) as HTMLElement[];

      let current = '';
      for (const heading of headings) {
        const rect = heading.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        if (rect.top - containerRect.top <= 100) {
          current = heading.id;
        }
      }
      setActiveTocId(current);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => container.removeEventListener('scroll', handleScroll);
  }, [tocItems, data]);

  useEffect(() => {
    const container = mainRef.current;
    const article = articleRef.current;
    if (!container || !article || tocItems.length === 0) {
      setTocSpacer(0);
      return;
    }

    const lastId = tocItems[tocItems.length - 1].id;
    const lastHeading = article.querySelector(`#${CSS.escape(lastId)}`);
    if (!lastHeading) {
      setTocSpacer(0);
      return;
    }

    const containerHeight = container.clientHeight;
    const headingBottom =
      lastHeading.getBoundingClientRect().bottom - article.getBoundingClientRect().top;
    const articleHeight = article.scrollHeight;
    const contentAfterLastHeading = articleHeight - headingBottom;
    const needed = Math.round(containerHeight * 0.5 - contentAfterLastHeading);
    setTocSpacer(Math.max(0, Math.min(needed, containerHeight * 0.6)));
  }, [tocItems, activeDoc]);

  const activeSectionData = data?.sections.find((s) => s.documents.some((d) => d.slug === slug));

  const breadcrumbs: BreadcrumbSegment[] = [
    { label: 'Docs', href: '/docs' },
    ...(activeSectionData ? [{ label: activeSectionData.section }] : []),
    ...(activeDoc ? [{ label: activeDoc.title }] : []),
  ];

  return (
    <>
      <main ref={mainRef} className="flex-1 min-w-0 overflow-y-auto h-[calc(100vh-88px)]">
        <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/30">
          <DocsBreadcrumb segments={breadcrumbs} />
        </div>
        <div className="p-8 flex justify-center">
          <div className="w-full max-w-3xl">
            {activeDoc ? (
              <>
                <div className="flex justify-end mb-2">
                  <CopyPageButton markdown={activeDoc.markdown} />
                </div>
                <article ref={articleRef} className="docs-content">
                  <div dangerouslySetInnerHTML={{ __html: activeDoc.content }} />
                </article>
                {(prevDoc || nextDoc) && (
                  <nav className="mt-12 grid grid-cols-2 gap-4">
                    {prevDoc ? (
                      <Link href={`/docs/${prevDoc.slug}`} className="group">
                        <Card className="h-full transition-colors hover:bg-accent/50">
                          <CardHeader>
                            <CardDescription className="text-xs uppercase tracking-wider">
                              Previous
                            </CardDescription>
                            <CardTitle className="text-sm group-hover:text-(--primary-text) transition-colors">
                              ← {prevDoc.title}
                            </CardTitle>
                          </CardHeader>
                        </Card>
                      </Link>
                    ) : (
                      <span />
                    )}
                    {nextDoc && (
                      <Link href={`/docs/${nextDoc.slug}`} className="group col-start-2">
                        <Card className="h-full text-right transition-colors hover:bg-accent/50">
                          <CardHeader className="items-end">
                            <CardDescription className="text-xs uppercase tracking-wider">
                              Next
                            </CardDescription>
                            <CardTitle className="text-sm group-hover:text-(--primary-text) transition-colors">
                              {nextDoc.title} →
                            </CardTitle>
                          </CardHeader>
                        </Card>
                      </Link>
                    )}
                  </nav>
                )}
                <footer className="mt-12 flex justify-center pb-2">
                  <BuiltWithCortexCard />
                </footer>
                {tocSpacer > 0 && <div style={{ height: tocSpacer }} aria-hidden="true" />}
              </>
            ) : !data ? (
              <div className="flex items-center justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
              </div>
            ) : (
              <p className="text-muted-foreground py-20 text-center">Document not found.</p>
            )}
          </div>
        </div>
      </main>

      {tocItems.length > 0 && (
        <aside className="hidden xl:block w-56 shrink-0 border-l border-border p-4 sticky top-0 h-[calc(100vh-88px)] overflow-y-auto">
          <TableOfContents
            items={tocItems}
            activeId={activeTocId}
            scrollContainer={mainRef.current}
          />
        </aside>
      )}
    </>
  );
}
