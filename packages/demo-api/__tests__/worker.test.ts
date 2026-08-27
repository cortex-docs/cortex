import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import worker from '../src/index';

function request(path: string, init?: RequestInit): Promise<Response> {
  return worker.fetch(new Request(`https://api.demo.cortexdocs.dev${path}`, init));
}

describe('demo API Worker', () => {
  it('reports Worker health', async () => {
    const response = await request('/health');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok', runtime: 'cloudflare-worker' });
  });

  it('keeps the Built with Cortex logo in the static deployment', () => {
    const body = readFileSync(
      new URL('../static/images/built-with-cortex.svg', import.meta.url),
      'utf8',
    );
    const headers = readFileSync(new URL('../static/_headers', import.meta.url), 'utf8');
    const workerConfig = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
    const staticWorkerConfig = readFileSync(
      new URL('../wrangler.static.jsonc', import.meta.url),
      'utf8',
    );

    expect(body).toContain('<title id="title">Built with Cortex</title>');
    expect(body).toContain('font-size="12" font-weight="600">Cortex</text>');
    expect(body).not.toContain('<rect');
    expect(headers).toContain('Cache-Control: public,max-age=86400');
    expect(headers).toContain('Cross-Origin-Resource-Policy: cross-origin');
    expect(workerConfig).toContain('"directory": "static"');
    expect(staticWorkerConfig).toContain('"run_worker_first": ["/images/built-with-cortex.svg"]');
    expect(staticWorkerConfig).toContain('"binding": "BADGE_REFERRERS"');
  });

  it('returns the Petstore collection with CORS headers', async () => {
    const response = await request('/pets');
    const body = (await response.json()) as { data: Array<{ name: string }> };
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(body.data.map((pet) => pet.name)).toContain('Rex');
  });

  it('streams pets continuously until the client cancels', async () => {
    const response = await request('/pets/stream');
    const reader = response.body?.getReader();
    expect(response.headers.get('Content-Type')).toBe('application/x-ndjson');
    expect(reader).toBeDefined();

    const decoder = new TextDecoder();
    const chunks: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const result = await Promise.race([
        reader!.read(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('The pet stream stopped producing data.')), 1500),
        ),
      ]);
      expect(result.done).toBe(false);
      chunks.push(decoder.decode(result.value));
    }

    expect(chunks.map((chunk) => JSON.parse(chunk).id)).toEqual(['pet-1', 'pet-2', 'pet-1']);
    await reader!.cancel();
  });

  it('executes GraphQL queries', async () => {
    const response = await request('/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ pets { data { id name } } }' }),
    });
    const body = (await response.json()) as { data: { pets: { data: Array<{ id: string }> } } };
    expect(response.status).toBe(200);
    expect(body.data.pets.data[0].id).toBe('pet-1');
  });

  it('serves gRPC browser bridge calls and server streams', async () => {
    const unaryResponse = await request('/grpc/PetService/ListPets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const unaryBody = (await unaryResponse.json()) as { data: Array<{ id: string }> };
    expect(unaryResponse.status).toBe(200);
    expect(unaryBody.data[0].id).toBe('pet-1');

    const streamResponse = await request('/grpc/PetService/WatchPets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const reader = streamResponse.body?.getReader();
    expect(streamResponse.headers.get('Content-Type')).toBe('application/x-ndjson');
    const first = await reader!.read();
    expect(first.done).toBe(false);
    expect(JSON.parse(new TextDecoder().decode(first.value)).id).toBe('pet-1');
    await reader!.cancel();
  });

  it('executes JSON-RPC methods', async () => {
    const response = await request('/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'listPets', id: 7 }),
    });
    const body = (await response.json()) as { id: number; result: { data: unknown[] } };
    expect(body.id).toBe(7);
    expect(body.result.data.length).toBeGreaterThan(0);
  });

  it('supports browser preflight requests', async () => {
    const response = await request('/pets', { method: 'OPTIONS' });
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });
});
