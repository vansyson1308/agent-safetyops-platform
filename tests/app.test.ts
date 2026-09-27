import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { request, startServer, type TestServer } from './helpers.ts';

let server: TestServer;
beforeAll(async () => { server = await startServer(); });
afterAll(async () => { await server.close(); });

describe('app', () => {
  it('serves the health check', async () => {
    const res = await request(server.url, 'GET', '/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('returns JSON 404 for unknown API routes', async () => {
    const res = await request(server.url, 'GET', '/health/nope/nope');
    expect(res.status).toBe(404);
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await fetch(`${server.url}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json',
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Malformed JSON body' });
  });
});
