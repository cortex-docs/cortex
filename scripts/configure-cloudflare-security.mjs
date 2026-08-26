#!/usr/bin/env node

const apiBase = 'https://api.cloudflare.com/client/v4';
const dryRun = process.argv.includes('--dry-run');
const zoneId = process.env.CLOUDFLARE_ZONE_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;

const validApiPaths = [
  'http.request.uri.path in {"/graphql" "/health" "/owners" "/pets" "/rpc" "/uploads/raw" "/ws"}',
  'starts_with(http.request.uri.path, "/grpc/")',
  'starts_with(http.request.uri.path, "/owners/")',
  'starts_with(http.request.uri.path, "/pets/")',
].join(' or ');

const customRule = {
  ref: 'cortex_demo_api_valid_paths',
  description: 'Block unknown paths before they invoke the Cortex demo API Worker',
  expression: `(http.host eq "api.demo.cortexdocs.dev" and not (${validApiPaths}))`,
  action: 'block',
  enabled: true,
};

const rateLimitRule = {
  ref: 'cortex_demo_api_per_ip',
  description: 'Rate limit Cortex demo API traffic per client IP',
  expression: `(not cf.client.bot and (${validApiPaths}))`,
  action: 'block',
  enabled: true,
  ratelimit: {
    characteristics: ['cf.colo.id', 'ip.src'],
    period: 10,
    requests_per_period: 30,
    mitigation_timeout: 10,
  },
};

if (dryRun) {
  console.log(JSON.stringify({ customRule, rateLimitRule }, null, 2));
  process.exit(0);
}

if (!zoneId || !apiToken) {
  throw new Error('CLOUDFLARE_ZONE_ID and CLOUDFLARE_API_TOKEN are required.');
}

async function cloudflare(path, init = {}, allowedStatuses = [200]) {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => null);
  if (
    !allowedStatuses.includes(response.status) ||
    (response.status < 400 && body && body.success === false)
  ) {
    const details = body ? JSON.stringify(body.errors ?? body) : await response.text();
    throw new Error(`Cloudflare API ${response.status} for ${path}: ${details}`);
  }
  return { status: response.status, result: body?.result };
}

async function ensureRule({ phase, rulesetName, desiredRule, maximumRules }) {
  const entrypointPath = `/zones/${zoneId}/rulesets/phases/${phase}/entrypoint`;
  const entrypoint = await cloudflare(entrypointPath, {}, [200, 404]);

  if (entrypoint.status === 404) {
    await cloudflare(`/zones/${zoneId}/rulesets`, {
      method: 'POST',
      body: JSON.stringify({
        name: rulesetName,
        description: 'Security rules managed by the Cortex deployment workflow',
        kind: 'zone',
        phase,
        rules: [desiredRule],
      }),
    });
    console.log(`Created ${desiredRule.ref}.`);
    return;
  }

  const ruleset = entrypoint.result;
  const existingRule = ruleset.rules?.find((rule) => rule.ref === desiredRule.ref);
  if (existingRule) {
    await cloudflare(`/zones/${zoneId}/rulesets/${ruleset.id}/rules/${existingRule.id}`, {
      method: 'PUT',
      body: JSON.stringify(desiredRule),
    });
    console.log(`Updated ${desiredRule.ref}.`);
    return;
  }

  if ((ruleset.rules?.length ?? 0) >= maximumRules) {
    throw new Error(
      `Cannot add ${desiredRule.ref}: the ${phase} ruleset already uses the Free-plan limit of ${maximumRules} rule(s).`,
    );
  }

  await cloudflare(`/zones/${zoneId}/rulesets/${ruleset.id}/rules`, {
    method: 'POST',
    body: JSON.stringify(desiredRule),
  });
  console.log(`Created ${desiredRule.ref}.`);
}

await ensureRule({
  phase: 'http_request_firewall_custom',
  rulesetName: 'Cortex custom security rules',
  desiredRule: customRule,
  maximumRules: 5,
});
await ensureRule({
  phase: 'http_ratelimit',
  rulesetName: 'Cortex rate limiting rules',
  desiredRule: rateLimitRule,
  maximumRules: 1,
});
