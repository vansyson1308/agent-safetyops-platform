import jwt from 'jsonwebtoken';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createUser, request, resetDb, startServer, type TestServer } from './helpers.ts';

let server: TestServer;
beforeAll(async () => { server = await startServer(); });
afterAll(async () => { await server.close(); });
beforeEach(resetDb);
afterEach(() => { delete process.env.ALLOW_REGISTRATION; });

const call = (method: string, path: string, options?: { token?: string; body?: unknown }) =>
  request(server.url, method, path, options);

const policyBody = { name: 'p' };

describe('authentication', () => {
  it('rejects requests without a token, even when an admin exists', async () => {
    await createUser('admin');
    expect((await call('GET', '/agents')).status).toBe(401);
    expect((await call('POST', '/policies', { body: policyBody })).status).toBe(401);
  });

  it('rejects invalid, forged and orphaned tokens', async () => {
    expect((await call('GET', '/agents', { token: 'garbage' })).status).toBe(401);

    const { user } = await createUser('admin');
    const forged = jwt.sign({ userId: user.id }, 'wrong-secret');
    expect((await call('GET', '/agents', { token: forged })).status).toBe(401);

    const { user: gone, token } = await createUser('admin');
    const { prisma } = await import('./helpers.ts');
    await prisma.user.delete({ where: { id: gone.id } });
    expect((await call('GET', '/agents', { token })).status).toBe(401);
  });

  it('serves /auth/me for a signed-in user', async () => {
    const { user, token } = await createUser('analyst');
    const res = await call('GET', '/auth/me', { token });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: user.id, role: 'analyst' });
    expect((await call('GET', '/auth/me')).status).toBe(401);
  });

  it('logs in with a password and returns a working token', async () => {
    await call('POST', '/auth/register', { body: { email: 'o@x.io', name: 'o', password: 'password123' } });
    const bad = await call('POST', '/auth/login', { body: { email: 'o@x.io', password: 'nope' } });
    expect(bad.status).toBe(401);
    const res = await call('POST', '/auth/login', { body: { email: 'o@x.io', password: 'password123' } });
    expect(res.status).toBe(200);
    expect((await call('GET', '/agents', { token: res.body.token })).status).toBe(200);
  });
});

describe('registration', () => {
  it('makes the first user the owner, then closes sign-up by default', async () => {
    expect((await call('GET', '/auth/status')).body).toEqual({ needsSetup: true, registrationOpen: false });

    const first = await call('POST', '/auth/register', { body: { email: 'a@x.io', name: 'a', password: 'password123' } });
    expect(first.status).toBe(201);
    expect(first.body.user.role).toBe('owner');

    const second = await call('POST', '/auth/register', { body: { email: 'b@x.io', name: 'b', password: 'password123' } });
    expect(second.status).toBe(403);
    expect((await call('GET', '/auth/status')).body.needsSetup).toBe(false);
  });

  it('registers later users as viewers when ALLOW_REGISTRATION=true', async () => {
    await createUser('owner');
    process.env.ALLOW_REGISTRATION = 'true';
    const res = await call('POST', '/auth/register', { body: { email: 'v@x.io', name: 'v', password: 'password123' } });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('viewer');
  });
});

describe('authorization', () => {
  it('lets viewers read but not write', async () => {
    const { token } = await createUser('viewer');
    expect((await call('GET', '/policies', { token })).status).toBe(200);
    expect((await call('POST', '/policies', { token, body: policyBody })).status).toBe(403);
    expect((await call('POST', '/runs', { token, body: {} })).status).toBe(403);
    expect((await call('PATCH', '/approvals/x', { token, body: {} })).status).toBe(403);
  });

  it('limits policy management to admins and owners', async () => {
    const analyst = await createUser('analyst');
    expect((await call('POST', '/policies', { token: analyst.token, body: policyBody })).status).toBe(403);
    const admin = await createUser('admin');
    expect((await call('POST', '/policies', { token: admin.token, body: policyBody })).status).toBe(201);
  });

  it('limits approvals to approvers, admins and owners', async () => {
    const analyst = await createUser('analyst');
    expect((await call('PATCH', '/approvals/x', { token: analyst.token, body: { status: 'approved' } })).status).toBe(403);
    const approver = await createUser('approver');
    expect((await call('PATCH', '/approvals/x', { token: approver.token, body: { status: 'approved' } })).status).toBe(404);
  });
});
