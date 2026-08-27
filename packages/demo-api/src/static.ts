const badgePath = '/images/built-with-cortex.svg';
const insertReferrer = 'INSERT OR IGNORE INTO badge_referrer_hosts (hostname) VALUES (?)';

interface StaticAssetsEnv {
  ASSETS: Fetcher;
  BADGE_REFERRERS: D1Database;
}

export function getReferrerHostname(value: string | null): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.hostname.toLowerCase().replace(/\.$/, '') || null;
  } catch {
    return null;
  }
}

async function storeReferrer(database: D1Database, hostname: string): Promise<void> {
  try {
    await database.prepare(insertReferrer).bind(hostname).run();
  } catch (error) {
    console.error('Unable to store the Built with Cortex referrer hostname.', error);
  }
}

export default {
  fetch(request: Request, env: StaticAssetsEnv, context: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === badgePath) {
      const hostname = getReferrerHostname(request.headers.get('Referer'));
      if (hostname) context.waitUntil(storeReferrer(env.BADGE_REFERRERS, hostname));
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<StaticAssetsEnv>;
