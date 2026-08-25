import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';

interface DocsSource {
  title: string;
}

interface DocsSection {
  sources?: DocsSource[];
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function generateStaticParams(): Array<{ slug: string }> {
  const configPath = process.env.CORTEX_CONFIG_PATH;
  if (!configPath || !fs.existsSync(configPath)) return [];

  try {
    const config = yaml.load(fs.readFileSync(path.resolve(configPath), 'utf8')) as {
      docs?: DocsSection[];
    };

    return (config.docs ?? []).flatMap((section) =>
      (section.sources ?? []).map((source) => ({ slug: slugify(source.title) })),
    );
  } catch {
    return [];
  }
}

export default function DocsSlugLayout({ children }: { children: React.ReactNode }) {
  return children;
}
