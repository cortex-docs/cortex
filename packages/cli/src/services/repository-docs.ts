import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  readRepositoryFile,
  repositoryPath,
  specificationReferences,
  type RepositorySnapshot,
  type RepositoryFile,
} from '@cortex-docs/core/hosting';

export async function mapConcurrent<T>(
  items: T[],
  concurrency: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const results = await Promise.allSettled(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) await work(items[next++]);
    }),
  );
  const failure = results.find((result) => result.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
}

/** Fetch data files only. Never clone executable files, run hooks, or install repo dependencies. */
export async function materializeRepository(
  snapshot: RepositorySnapshot,
  directory: string,
  files: RepositoryFile[] = snapshot.files,
): Promise<void> {
  await mapConcurrent(files, 4, async (file) => {
    const bytes =
      file.path === 'cortex.config.yml'
        ? Buffer.from(snapshot.configText)
        : await readRepositoryFile(snapshot, file);
    const destination = path.join(directory, repositoryPath(file.path));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, bytes);
  });
}

export function assertLocalSpecReferences(snapshot: RepositorySnapshot, directory: string): void {
  const root = path.resolve(directory);
  for (const file of snapshot.files.filter(
    (f) => /\.(?:json|ya?ml|proto)$/i.test(f.path) && f.path !== 'cortex.config.yml',
  )) {
    const text = fs.readFileSync(path.join(root, file.path), 'utf8');
    const references = specificationReferences(file.path, text);
    for (const reference of references) {
      const target = decodeURIComponent(reference.split('#')[0]);
      if (!target) continue;
      if (/^[a-z][a-z0-9+.-]*:|^[/\\]/i.test(target))
        throw new Error(
          `Hosted builds require local specification references: ${file.path} → ${target}`,
        );
      const resolved = path.resolve(root, path.dirname(file.path), target);
      if (!resolved.startsWith(`${root}${path.sep}`) || !fs.existsSync(resolved))
        throw new Error(
          `Specification reference is missing or outside the repository: ${file.path} → ${target}`,
        );
    }
  }
}

/** Keep Markdown links useful when the source files move to their generated docs routes. */
export function rewriteRepositoryMarkdown(snapshot: RepositorySnapshot, directory: string): void {
  const docs = snapshot.config.docs?.flatMap((section) => section.sources) ?? [];
  const slug = (title: string) =>
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  const slugs = docs.map((doc) => slug(doc.title));
  if (slugs.some((value) => !value) || new Set(slugs).size !== slugs.length)
    throw new Error(
      'Hosted documentation page titles must produce unique, non-empty URL slugs. Rename duplicate titles in cortex.config.yml.',
    );
  const links = new Map(
    docs.map((doc) => [repositoryPath(doc.document), `/docs/${slug(doc.title)}`]),
  );
  const files = new Set(snapshot.files.map((file) => file.path));
  const markdownPaths = [
    ...links.keys(),
    ...snapshot.config.sources.flatMap((source) =>
      source.intro ? [repositoryPath(source.intro)] : [],
    ),
  ];
  for (const document of new Set(markdownPaths)) {
    const location = path.join(directory, document);
    const source = fs.readFileSync(location, 'utf8');
    const rewrite = (href: string) => {
      if (/^[a-z][a-z0-9+.-]*:|^\/\/|^#/i.test(href)) return href;
      const [pathname, fragment] = href.split('#', 2);
      const resolved = path.posix.normalize(
        pathname.startsWith('/')
          ? pathname.slice(1)
          : path.posix.join(path.posix.dirname(document), pathname),
      );
      if (resolved.startsWith('../')) return href;
      const hash = fragment === undefined ? '' : `#${fragment}`;
      if (links.has(resolved)) return `${links.get(resolved)}${hash}`;
      if (files.has(resolved) && resolved.startsWith('assets/')) return `/${resolved}${hash}`;
      return `${snapshot.repository}/blob/${snapshot.commit}/${resolved.split('/').map(encodeURIComponent).join('/')}${hash}`;
    };
    // Inline links and reference definitions; fenced code examples remain unchanged.
    let fenced = false;
    const output = source
      .split('\n')
      .map((line) => {
        if (/^\s*(```|~~~)/.test(line)) {
          fenced = !fenced;
          return line;
        }
        if (fenced) return line;
        return line
          .replace(
            /(!?\[[^\]]*\]\()([^\s)]+)([^)]*\))/g,
            (_match, before: string, href: string, after: string) => {
              let result = rewrite(href);
              if (before.startsWith('!') && result.startsWith(`${snapshot.repository}/blob/`))
                result = result
                  .replace('https://github.com/', 'https://raw.githubusercontent.com/')
                  .replace('/blob/', '/');
              return `${before}${result}${after}`;
            },
          )
          .replace(
            /^(\s*\[[^\]]+\]:\s*)(\S+)/,
            (_match, before: string, href: string) => `${before}${rewrite(href)}`,
          );
      })
      .join('\n');
    fs.writeFileSync(location, output);
  }
}
