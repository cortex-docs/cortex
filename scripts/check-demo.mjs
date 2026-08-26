#!/usr/bin/env node

const baseUrl = (process.argv[2] || 'https://demo.cortexdocs.dev').replace(/\/$/, '');
const paths = [
  '/',
  '/docs/quickstart',
  '/api-reference',
  '/mcp',
  '/api/config',
  '/api/mcp',
  '/api/sdk-snippets',
];
const rounds = 5;

async function check(path, round) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { 'user-agent': 'cortex-demo-health-check/1.0' },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const body = (await response.text()).slice(0, 200);
    throw new Error(`Round ${round}: ${path} returned ${response.status}: ${body}`);
  }

  if (response.headers.get('x-cortex-hosting') !== 'cloudflare-static-assets') {
    throw new Error(`Round ${round}: ${path} was not served by Cloudflare Static Assets.`);
  }

  await response.arrayBuffer();
}

for (let round = 1; round <= rounds; round += 1) {
  await Promise.all(paths.map((path) => check(path, round)));
}

const logoResponse = await fetch(
  `https://static.cortexdocs.dev/images/built-with-cortex.svg?check=${Date.now()}`,
  { signal: AbortSignal.timeout(30_000) },
);
if (!logoResponse.ok || !logoResponse.headers.get('cache-control')?.includes('max-age=86400')) {
  throw new Error(`The static Built with Cortex logo returned ${logoResponse.status}.`);
}

console.log(`Demo health check passed: ${paths.length * rounds} concurrent requests.`);
