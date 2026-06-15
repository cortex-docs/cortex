import { notFound } from 'next/navigation';
import { getDocPage, getAllSlugs } from '@/lib/content';

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getDocPage(slug);
  if (!page) return {};
  return { title: `${page.title} — Cortex Docs`, description: page.description };
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getDocPage(slug);

  if (!page) notFound();

  return (
    <div className="docs-content" dangerouslySetInnerHTML={{ __html: page.html }} />
  );
}
