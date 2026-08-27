import { describe, expect, it, vi } from 'vitest';
import staticWorker, { getReferrerHostname } from '../src/static';

function createRuntime() {
  const rows = new Set<string>();
  const statements: string[] = [];
  const pending: Promise<unknown>[] = [];
  let boundHostname = '';

  const database = {
    prepare: vi.fn((statement: string) => {
      statements.push(statement);
      return {
        bind: vi.fn((hostname: string) => {
          boundHostname = hostname;
          return {
            run: vi.fn(async () => {
              rows.add(boundHostname);
              return { success: true };
            }),
          };
        }),
      };
    }),
  } as unknown as D1Database;
  const assets = {
    fetch: vi.fn(
      async () => new Response('<svg />', { headers: { 'Content-Type': 'image/svg+xml' } }),
    ),
  } as unknown as Fetcher;
  const context = {
    waitUntil: vi.fn((promise: Promise<unknown>) => pending.push(promise)),
  } as unknown as ExecutionContext;

  return { assets, context, database, pending, rows, statements };
}

describe('static asset Worker', () => {
  it('normalizes HTTP referrer hostnames', () => {
    expect(getReferrerHostname('https://WWW.Example.com./docs/page?query=1')).toBe(
      'www.example.com',
    );
    expect(getReferrerHostname('mailto:hello@example.com')).toBeNull();
    expect(getReferrerHostname('not a URL')).toBeNull();
    expect(getReferrerHostname(null)).toBeNull();
  });

  it('stores each badge referrer only once and still serves the asset', async () => {
    const runtime = createRuntime();
    const request = new Request('https://static.cortexdocs.dev/images/built-with-cortex.svg', {
      headers: { Referer: 'https://Example.com/docs' },
    });
    const env = { ASSETS: runtime.assets, BADGE_REFERRERS: runtime.database };

    const first = await staticWorker.fetch(request, env, runtime.context);
    const second = await staticWorker.fetch(request, env, runtime.context);
    await Promise.all(runtime.pending);

    expect(first.status).toBe(200);
    expect(second.headers.get('Content-Type')).toBe('image/svg+xml');
    expect(runtime.rows).toEqual(new Set(['example.com']));
    expect(runtime.statements).toHaveLength(2);
    expect(runtime.statements[0]).toContain('INSERT OR IGNORE');
  });

  it('does not store missing referrers or HEAD requests', async () => {
    const runtime = createRuntime();
    const env = { ASSETS: runtime.assets, BADGE_REFERRERS: runtime.database };

    await staticWorker.fetch(
      new Request('https://static.cortexdocs.dev/images/built-with-cortex.svg'),
      env,
      runtime.context,
    );
    await staticWorker.fetch(
      new Request('https://static.cortexdocs.dev/images/built-with-cortex.svg', {
        method: 'HEAD',
        headers: { Referer: 'https://example.com/' },
      }),
      env,
      runtime.context,
    );

    expect(runtime.pending).toHaveLength(0);
    expect(runtime.rows.size).toBe(0);
  });
});
