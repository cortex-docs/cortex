'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { DocsHeader } from '@/components/docs/docs-header';
import { DocsBreadcrumb, type BreadcrumbSegment } from '@/components/docs/docs-breadcrumb';
import { useProjectWatch } from '@/lib/use-project-watch';

interface DocsDocument {
  title: string;
  slug: string;
  content: string;
}

interface DocsSection {
  section: string;
  documents: DocsDocument[];
}

interface DocsResponse {
  sections: DocsSection[];
}

export default function DocSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [data, setData] = useState<DocsResponse | null>(null);
  const [activeSlug, setActiveSlug] = useState(slug);
  const mainRef = useRef<HTMLElement>(null);
  const isScrollingRef = useRef(false);

  const fetchDocs = useCallback(() => {
    fetch('/api/docs')
      .then((r) => r.json())
      .then((d: DocsResponse) => setData(d));
  }, []);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);
  useProjectWatch(fetchDocs);

  useEffect(() => {
    if (!data) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (isScrollingRef.current) return;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const docSlug = entry.target.getAttribute('data-doc-slug');
            if (docSlug) {
              setActiveSlug(docSlug);
              const newPath = `/docs/${docSlug}`;
              if (window.location.pathname !== newPath) {
                window.history.replaceState(null, '', newPath);
              }
            }
            break;
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0.1 },
    );

    document.querySelectorAll('[data-doc-slug]').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [data]);

  const initialSlugRef = useRef(slug);

  useEffect(() => {
    if (!data) return;
    if (slug === initialSlugRef.current) {
      const firstSlug = data.sections?.[0]?.documents?.[0]?.slug;
      if (slug === firstSlug) return;
    }
    initialSlugRef.current = '';
    const el = document.querySelector(`[data-doc-slug="${slug}"]`);
    if (el) {
      isScrollingRef.current = true;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveSlug(slug);
      setTimeout(() => {
        isScrollingRef.current = false;
      }, 800);
    }
  }, [slug, data]);

  const activeDoc = data?.sections
    .flatMap((s) => s.documents)
    .find((d) => d.slug === activeSlug);

  const activeSectionData = data?.sections.find((s) =>
    s.documents.some((d) => d.slug === activeSlug),
  );

  const breadcrumbs: BreadcrumbSegment[] = [
    { label: 'Docs', href: '/docs' },
    ...(activeSectionData ? [{ label: activeSectionData.section }] : []),
    ...(activeDoc ? [{ label: activeDoc.title }] : []),
  ];

  return (
    <div className="min-h-screen bg-background">
      <DocsHeader />
      <div className="flex">
        <aside className="w-64 shrink-0 border-r border-border p-4 sticky top-0 h-[calc(100vh-88px)] overflow-y-auto">
          {data?.sections.map((section, idx) => (
            <div key={`${section.section}-${idx}`} className="mb-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-2">
                {section.section}
              </h3>
              <ul className="space-y-0.5">
                {section.documents.map((doc) => (
                  <li key={doc.slug}>
                    <Link
                      href={`/docs/${doc.slug}`}
                      className={`block w-full text-left text-sm px-2.5 py-1.5 rounded-lg transition-all ${
                        activeSlug === doc.slug
                          ? 'bg-accent text-accent-foreground font-medium'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                      }`}
                    >
                      {doc.title}
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

        <main ref={mainRef} className="flex-1 overflow-y-auto h-[calc(100vh-88px)]">
          <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/30">
            <DocsBreadcrumb segments={breadcrumbs} />
          </div>
          <div className="p-8 flex justify-center">
            <div className="w-full max-w-3xl space-y-16">
              {data?.sections.flatMap((section) =>
                section.documents.map((doc) => (
                  <article
                    key={doc.slug}
                    data-doc-slug={doc.slug}
                    className="docs-content scroll-mt-16"
                  >
                    <div dangerouslySetInnerHTML={{ __html: doc.content }} />
                  </article>
                )),
              )}
              {!data && (
                <div className="fixed inset-0 flex items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
                </div>
              )}
              <div className="h-[40vh]" aria-hidden="true" />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
