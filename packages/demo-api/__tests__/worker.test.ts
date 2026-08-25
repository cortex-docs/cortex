import { describe, expect, it } from 'vitest';
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

  it('serves the transparent Built with Cortex logo as a cached Cloudflare asset', async () => {
    const response = await worker.fetch(
      new Request('https://static.cortexdocs.dev/images/built-with-cortex.svg'),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/svg+xml; charset=utf-8');
    expect(response.headers.get('Cache-Control')).toContain('max-age=86400');
    expect(response.headers.get('Cross-Origin-Resource-Policy')).toBe('cross-origin');
    expect(body).toContain('<title id="title">Built with Cortex</title>');
    expect(body).toContain('>Built with</text>');
    expect(body).toContain('<text x="85"');
    expect(body).toContain('width="128" height="20"');
    expect(body).not.toContain('<rect');
  });

  it.each(['/images/built-by-cortex.svg', '/assets/built-by-cortex.svg'])(
    'redirects the old logo URL %s to the renamed static asset',
    async (path) => {
      const response = await request(path, { redirect: 'manual' });

      expect(response.status).toBe(308);
      expect(response.headers.get('Location')).toBe(
        'https://static.cortexdocs.dev/images/built-with-cortex.svg',
      );
    },
  );

  it('does not expose demo API routes on the static image host', async () => {
    const response = await worker.fetch(new Request('https://static.cortexdocs.dev/pets'));

    expect(response.status).toBe(404);
  });

  it('returns the Petstore collection with CORS headers', async () => {
    const response = await request('/pets');
    const body = (await response.json()) as { data: Array<{ name: string }> };
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(body.data.map((pet) => pet.name)).toContain('Rex');
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
