import * as fs from 'node:fs';
import * as path from 'node:path';

function findProjectDir(): string | null {
  const configPath = process.env.CORTEX_CONFIG_PATH;
  if (configPath) return path.dirname(configPath);

  const specPath = process.env.CORTEX_SPEC_PATH;
  if (specPath) return path.dirname(specPath);

  return null;
}

const IGNORE = /[\\/](generated|node_modules|\.next)[\\/]/;

export const dynamic = 'force-dynamic';

export async function GET() {
  if (process.env.CORTEX_CLOUDFLARE === '1') {
    return new Response(null, { status: 204 });
  }

  const projectDir = findProjectDir();

  const watchers: fs.FSWatcher[] = [];
  let keepAlive: ReturnType<typeof setInterval> | null = null;
  let debounce: ReturnType<typeof setTimeout> | null = null;

  const cleanup = () => {
    for (const watcher of watchers.splice(0)) watcher.close();
    if (keepAlive) {
      clearInterval(keepAlive);
      keepAlive = null;
    }
    if (debounce) {
      clearTimeout(debounce);
      debounce = null;
    }
  };

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;

      const send = (data: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          closed = true;
          cleanup();
        }
      };

      send(JSON.stringify({ type: 'connected' }));

      const watch = (root: string) => {
        watchers.push(
          fs.watch(root, { recursive: true }, (_event, filename) => {
            if (!filename || IGNORE.test(filename)) return;
            if (debounce) clearTimeout(debounce);
            debounce = setTimeout(
              () => send(JSON.stringify({ type: 'change', file: filename })),
              150,
            );
          }),
        );
      };
      if (projectDir) watch(projectDir);
      const templateRoot = process.env.CORTEX_TEMPLATE_ROOT;
      if (
        templateRoot &&
        templateRoot !== projectDir &&
        !templateRoot.startsWith(`${projectDir}${path.sep}`)
      ) {
        watch(templateRoot);
      }
      try {
        const sourceTemplateDirs = JSON.parse(
          process.env.CORTEX_LANGUAGE_TEMPLATE_DIRS ?? '[]',
        ) as unknown;
        if (Array.isArray(sourceTemplateDirs)) {
          for (const directory of sourceTemplateDirs) {
            if (
              typeof directory === 'string' &&
              directory !== projectDir &&
              !directory.startsWith(`${projectDir}${path.sep}`)
            ) {
              watch(directory);
            }
          }
        }
      } catch {}

      keepAlive = setInterval(() => send(JSON.stringify({ type: 'ping' })), 30000);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
