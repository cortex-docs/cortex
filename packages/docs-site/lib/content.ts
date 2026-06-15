import * as fs from 'node:fs';
import * as path from 'node:path';
import matter from 'gray-matter';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSlug from 'rehype-slug';
import rehypeHighlight from 'rehype-highlight';
import rehypeStringify from 'rehype-stringify';

const CONTENT_DIR = path.join(process.cwd(), 'content');

export interface DocPage {
  slug: string;
  title: string;
  description: string;
  order: number;
  content: string;
  html: string;
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSlug)
  .use(rehypeHighlight, { detect: true })
  .use(rehypeStringify);

export async function getDocPage(slug: string): Promise<DocPage | null> {
  const filePath = path.join(CONTENT_DIR, `${slug}.md`);

  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, 'utf-8');
  const { data, content } = matter(raw);

  const result = await processor.process(content);

  return {
    slug,
    title: data.title ?? slug,
    description: data.description ?? '',
    order: data.order ?? 99,
    content,
    html: result.toString(),
  };
}

export function getAllSlugs(): string[] {
  if (!fs.existsSync(CONTENT_DIR)) return [];

  return fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace('.md', ''));
}

export async function getAllPages(): Promise<Pick<DocPage, 'slug' | 'title' | 'order'>[]> {
  const slugs = getAllSlugs();
  const pages: Pick<DocPage, 'slug' | 'title' | 'order'>[] = [];

  for (const slug of slugs) {
    const filePath = path.join(CONTENT_DIR, `${slug}.md`);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { data } = matter(raw);
    pages.push({
      slug,
      title: data.title ?? slug,
      order: data.order ?? 99,
    });
  }

  return pages.sort((a, b) => a.order - b.order);
}
