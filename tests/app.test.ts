import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUser, request, resetDb, startServer, type TestServer } from './helpers.ts';

let server: TestServer;
beforeAll(async () => { server = await startServer(); });
afterAll(async () => { await server.close(); });

describe('app', () => {
  it('serves the health check', async () => {
    const res = await request(server.url, 'GET', '/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('requires auth for unknown API routes, then returns a JSON 404', async () => {
    expect((await request(server.url, 'GET', '/nope')).status).toBe(401);

    await resetDb();
    const { token } = await createUser('viewer');
    const res = await request(server.url, 'GET', '/nope', { token });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
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
