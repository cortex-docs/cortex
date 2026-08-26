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
const maximumPropagationAttempts = 12;
const retryDelayMs = 5_000;

async function check(path, round, cacheBust = false) {
  const separator = path.includes('?') ? '&' : '?';
  const suffix = cacheBust ? `${separator}check=${Date.now()}-${round}` : '';
  const response = await fetch(`${baseUrl}${path}${suffix}`, {
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

let propagationFailures = [];
for (let attempt = 1; attempt <= maximumPropagationAttempts; attempt += 1) {
  const results = await Promise.allSettled(
    paths.map((path) => check(path, `propagation attempt ${attempt}`, true)),
  );
  propagationFailures = results.filter((result) => result.status === 'rejected');
  if (propagationFailures.length === 0) break;
  if (attempt < maximumPropagationAttempts) {
    console.warn(
      `Demo deployment has not propagated (attempt ${attempt}/${maximumPropagationAttempts}).`,
    );
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }
}

if (propagationFailures.length > 0) {
  throw propagationFailures[0].reason;
}

for (let round = 1; round <= rounds; round += 1) {
  await Promise.all(paths.map((path) => check(path, round)));
}

let logoFailure;
for (let attempt = 1; attempt <= maximumPropagationAttempts; attempt += 1) {
  try {
    const logoResponse = await fetch(
      `https://static.cortexdocs.dev/images/built-with-cortex.svg?check=${Date.now()}-${attempt}`,
      { signal: AbortSignal.timeout(30_000) },
    );
    if (!logoResponse.ok || !logoResponse.headers.get('cache-control')?.includes('max-age=86400')) {
      throw new Error(`The static Built with Cortex logo returned ${logoResponse.status}.`);
    }
    await logoResponse.arrayBuffer();
    logoFailure = undefined;
    break;
  } catch (error) {
    logoFailure = error;
    if (attempt < maximumPropagationAttempts) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
}

if (logoFailure) {
  throw logoFailure;
}

console.log(`Demo health check passed: ${paths.length * rounds} concurrent requests.`);
