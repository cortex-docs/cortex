#!/usr/bin/env node

const baseUrl = process.argv[2]?.replace(/\/$/, '');
const paths = process.argv.slice(3);
if (!baseUrl || paths.length === 0) {
  console.error('Usage: node scripts/check-static-site.mjs <base-url> <path...>');
  process.exit(1);
}

for (const path of paths) {
  const separator = path.includes('?') ? '&' : '?';
  const response = await fetch(`${baseUrl}${path}${separator}check=${Date.now()}`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  if (response.headers.get('x-cortex-hosting') !== 'cloudflare-static-assets') {
    throw new Error(`${path} was not served by Cloudflare Static Assets.`);
  }
  await response.arrayBuffer();
}

console.log(`Static site health check passed for ${baseUrl}: ${paths.length} assets.`);
