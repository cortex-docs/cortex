import * as fs from 'node:fs';
import * as path from 'node:path';

function findProjectDir(): string | null {
  const specPath = process.env.CORTEX_SPEC_PATH;
  if (specPath) return path.dirname(specPath);

  const configPath = process.env.CORTEX_CONFIG_PATH;
  if (configPath) return path.dirname(configPath);

  return null;
}

const IGNORE = /[\\/](generated|node_modules|\.next)[\\/]/;

export const dynamic = 'force-dynamic';

export async function GET() {
  const projectDir = findProjectDir();

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

      let watcher: fs.FSWatcher | null = null;
      let keepAlive: ReturnType<typeof setInterval> | null = null;
      let debounce: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        closed = true;
        if (watcher) { watcher.close(); watcher = null; }
        if (keepAlive) { clearInterval(keepAlive); keepAlive = null; }
        if (debounce) { clearTimeout(debounce); debounce = null; }
      };

      if (projectDir) {
        watcher = fs.watch(projectDir, { recursive: true }, (_event, filename) => {
          if (!filename || IGNORE.test(filename)) return;
          if (debounce) clearTimeout(debounce);
          debounce = setTimeout(() => send(JSON.stringify({ type: 'change', file: filename })), 150);
        });
      }

      keepAlive = setInterval(() => send(JSON.stringify({ type: 'ping' })), 30000);
    },
    cancel() {},
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
