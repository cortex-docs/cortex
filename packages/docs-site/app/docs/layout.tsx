import { SiteLayout } from '@/components/site/site-layout';
import { getAllPages } from '@/lib/content';

export default async function DocsLayout({ children }: { children: React.ReactNode }) {
  const pages = await getAllPages();
  const nav = pages.map((p) => ({ slug: p.slug, title: p.title }));

  return <SiteLayout nav={nav}>{children}</SiteLayout>;
}
