#!/usr/bin/env node

const baseUrl = process.argv[2]?.replace(/\/$/, '');
const paths = process.argv.slice(3);
const maximumAttempts = 12;
const retryDelayMs = 5_000;
if (!baseUrl || paths.length === 0) {
  console.error('Usage: node scripts/check-static-site.mjs <base-url> <path...>');
  process.exit(1);
}

async function check(path, attempt) {
  const separator = path.includes('?') ? '&' : '?';
  try {
    const response = await fetch(`${baseUrl}${path}${separator}check=${Date.now()}-${attempt}`, {
      headers: {
        'cache-control': 'no-cache',
        'user-agent': 'cortex-static-deployment-check/1.0',
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      return `${path} returned ${response.status}: ${(await response.text()).slice(0, 200)}`;
    }
    if (response.headers.get('x-cortex-hosting') !== 'cloudflare-static-assets') {
      await response.arrayBuffer();
      return `${path} was not served by Cloudflare Static Assets`;
    }
    await response.arrayBuffer();
    return null;
  } catch (error) {
    return `${path} failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

let failures = [];
for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
  failures = (await Promise.all(paths.map((path) => check(path, attempt)))).filter(Boolean);
  if (failures.length === 0) break;
  if (attempt < maximumAttempts) {
    console.warn(
      `Static deployment has not propagated (attempt ${attempt}/${maximumAttempts}): ${failures.join('; ')}`,
    );
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }
}

if (failures.length > 0) {
  throw new Error(
    `Static deployment did not propagate after ${maximumAttempts} attempts: ${failures.join('; ')}`,
  );
}

console.log(`Static site health check passed for ${baseUrl}: ${paths.length} assets.`);
