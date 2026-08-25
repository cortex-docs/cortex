import * as fs from 'node:fs';
import * as path from 'node:path';
import { NextResponse } from 'next/server';
import * as yaml from 'js-yaml';

export const dynamic = 'force-static';

interface DocsDocument {
  title: string;
  document: string;
}

interface DocsSection {
  section: string;
  sources: DocsDocument[];
}

interface DocsResponse {
  sections: Array<{
    section: string;
    documents: Array<{
      title: string;
      slug: string;
      content: string;
      markdown: string;
    }>;
  }>;
}

function findConfigFile(): string | null {
  const configPath = process.env.CORTEX_CONFIG_PATH;
  if (configPath && fs.existsSync(configPath)) return configPath;

  const specPath = process.env.CORTEX_SPEC_PATH;
  if (specPath) {
    const dir = path.dirname(specPath);
    for (const name of ['cortex.config.yml', 'cortex.config.yaml', 'cortex.yml']) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  return null;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function GET() {
  const configFile = findConfigFile();
  if (!configFile) {
    return NextResponse.json({ sections: [] });
  }

  try {
    const raw = yaml.load(fs.readFileSync(configFile, 'utf-8')) as Record<string, unknown>;
    const sections = (raw?.docs as DocsSection[] | undefined) ?? [];
    const configDir = path.dirname(configFile);

    const { renderMarkdown } = await import('@/lib/markdown');

    const response: DocsResponse = {
      sections: await Promise.all(
        sections.map(async (section) => ({
          section: section.section,
          documents: await Promise.all(
            section.sources.map(async (doc) => {
              const docPath = path.resolve(configDir, doc.document);
              let content = '';
              let markdown = '';
              if (fs.existsSync(docPath)) {
                markdown = fs.readFileSync(docPath, 'utf-8');
                content = await renderMarkdown(markdown);
              }
              return {
                title: doc.title,
                slug: slugify(doc.title),
                content,
                markdown,
              };
            }),
          ),
        })),
      ),
    };

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'no-cache' },
    });
  } catch {
    return NextResponse.json({ sections: [] });
  }
}
