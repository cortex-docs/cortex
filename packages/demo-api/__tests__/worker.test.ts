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
