import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createUser, prisma, request, resetDb, startServer, type TestServer } from './helpers.ts';

let server: TestServer;
let token: string;
let userId: string;

beforeAll(async () => { server = await startServer(); });
afterAll(async () => { await server.close(); });
beforeEach(async () => {
  await resetDb();
  const admin = await createUser('admin');
  token = admin.token;
  userId = admin.user.id;
});

const call = (method: string, path: string, body?: unknown) => request(server.url, method, path, { token, body });

async function createAgents(count: number) {
  await prisma.agent.createMany({
    data: Array.from({ length: count }, (_, i) => ({ name: `a${i}`, provider: 'Custom', capabilities: '[]', createdById: userId })),
  });
}

describe('pagination', () => {
  it('limits list sizes and validates parameters', async () => {
    await createAgents(5);
    expect((await call('GET', '/agents?limit=2')).body).toHaveLength(2);
    expect((await call('GET', '/agents?limit=2&offset=4')).body).toHaveLength(1);
    expect((await call('GET', '/agents?limit=0')).status).toBe(400);
    expect((await call('GET', '/agents?limit=100000')).status).toBe(400);
  });

  it('validates the approvals status filter', async () => {
    expect((await call('GET', '/approvals?status=pending')).status).toBe(200);
    expect((await call('GET', '/approvals?status=bogus')).status).toBe(400);
  });
});

describe('audit events', () => {
  it('rejects filter objects in the query string', async () => {
    expect((await call('GET', '/audit-events?eventType[contains]=user')).status).toBe(400);
    const res = await call('GET', '/audit-events?limit=5&offset=0');
    expect(res.body).toMatchObject({ limit: 5, offset: 0 });
  });
});

describe('dashboard chart', () => {
  it('returns one bucket per day, even beyond a week', async () => {
    const agent = await prisma.agent.create({ data: { name: 'a', provider: 'Custom', capabilities: '[]', createdById: userId } });
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await prisma.run.create({ data: { task: 'old', agentId: agent.id, createdById: userId, createdAt: eightDaysAgo } });
    await prisma.run.create({ data: { task: 'new', agentId: agent.id, createdById: userId, status: 'blocked' } });

    const week = (await call('GET', '/dashboard/chart-data?days=7')).body;
    expect(week).toHaveLength(7);
    expect(week.reduce((sum: number, d: any) => sum + d.runs, 0)).toBe(1);
    expect(week[6]).toMatchObject({ runs: 1, blocked: 1 });

    const month = (await call('GET', '/dashboard/chart-data?days=30')).body;
    expect(month).toHaveLength(30);
    expect(new Set(month.map((d: any) => d.date)).size).toBe(30);
    expect(month.reduce((sum: number, d: any) => sum + d.runs, 0)).toBe(2);

    expect((await call('GET', '/dashboard/chart-data?days=100000')).body).toHaveLength(7);
  });
});

describe('incidents', () => {
  it('validates updates and missing references', async () => {
    expect((await call('POST', '/incidents', { runId: crypto.randomUUID(), title: 't', summary: 's', severity: 'low' })).status).toBe(400);

    const agent = await prisma.agent.create({ data: { name: 'a', provider: 'Custom', capabilities: '[]', createdById: userId } });
    const run = await prisma.run.create({ data: { task: 't', agentId: agent.id, createdById: userId } });
    const incident = await call('POST', '/incidents', { runId: run.id, title: 't', summary: 's', severity: 'low' });
    expect(incident.status).toBe(201);

    expect((await call('PATCH', `/incidents/${incident.body.id}`, { severity: 'apocalyptic' })).status).toBe(400);
    expect((await call('PATCH', `/incidents/${incident.body.id}`, { severity: 'high' })).body.severity).toBe('high');
    expect((await call('PATCH', `/incidents/${crypto.randomUUID()}`, { severity: 'high' })).status).toBe(404);
  });
});

describe('settings', () => {
  it('reports whether Gemini is configured', async () => {
    expect((await call('GET', '/settings/integrations')).body).toEqual({ gemini: false });
  });
});
