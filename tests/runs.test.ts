import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createUser, prisma, request, resetDb, startServer, type TestServer } from './helpers.ts';

let server: TestServer;
let analyst: string;
let approver: string;
let admin: string;
let agentId: string;

beforeAll(async () => { server = await startServer(); });
afterAll(async () => { await server.close(); });
beforeEach(async () => {
  await resetDb();
  const a = await createUser('admin');
  admin = a.token;
  analyst = (await createUser('analyst')).token;
  approver = (await createUser('approver')).token;
  const agent = await prisma.agent.create({
    data: { name: 'agent', provider: 'Custom', capabilities: '[]', createdById: a.user.id },
  });
  agentId = agent.id;
  await request(server.url, 'POST', '/policies', {
    token: admin,
    body: { name: 'p', blockedTools: ['rm_rf'], restrictedActions: ['refund'] },
  });
});

const call = (token: string, method: string, path: string, body?: unknown) =>
  request(server.url, method, path, { token, body });

async function startRun() {
  const res = await call(analyst, 'POST', '/runs', { task: 't', agentId });
  return res.body.id as string;
}

async function blockRun(actionName = 'rm_rf') {
  const runId = await startRun();
  const step = await call(analyst, 'POST', `/runs/${runId}/steps`, { actionType: 'tool_call', actionName });
  expect(step.body.decision.allowed).toBe(false);
  const approval = await prisma.approvalRequest.findFirstOrThrow({ where: { runId } });
  return { runId, approvalId: approval.id };
}

const runStatus = async (id: string) => (await prisma.run.findUniqueOrThrow({ where: { id } })).status;

describe('run status changes', () => {
  it('cannot move a blocked run back to running directly', async () => {
    const { runId } = await blockRun();
    const res = await call(analyst, 'PATCH', `/runs/${runId}`, { status: 'running' });
    expect(res.status).toBe(400);
    expect(await runStatus(runId)).toBe('blocked');
  });

  it('cannot complete a blocked run', async () => {
    const { runId } = await blockRun();
    expect((await call(analyst, 'PATCH', `/runs/${runId}`, { status: 'completed' })).status).toBe(409);
    expect(await runStatus(runId)).toBe('blocked');
  });

  it('can cancel a blocked run and completes running ones, with audit events', async () => {
    const { runId } = await blockRun();
    expect((await call(analyst, 'PATCH', `/runs/${runId}`, { status: 'failed' })).body.status).toBe('failed');

    const other = await startRun();
    const done = await call(analyst, 'PATCH', `/runs/${other}`, { status: 'completed', summary: 'ok' });
    expect(done.body).toMatchObject({ status: 'completed', summary: 'ok' });

    const events = await prisma.auditEvent.findMany({ where: { eventType: { in: ['run_failed', 'run_completed'] } } });
    expect(events).toHaveLength(2);
  });

  it('rejects steps on runs that are not running', async () => {
    const { runId } = await blockRun();
    const res = await call(analyst, 'POST', `/runs/${runId}/steps`, { actionType: 'tool_call', actionName: 'ls' });
    expect(res.status).toBe(409);
  });

  it('numbers concurrent steps uniquely', async () => {
    const runId = await startRun();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => call(analyst, 'POST', `/runs/${runId}/steps`, { actionType: 'reasoning' })),
    );
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
    const steps = await prisma.runStep.findMany({ where: { runId }, orderBy: { sequence: 'asc' } });
    expect(steps.map((s) => s.sequence)).toEqual([1, 2, 3, 4, 5]);
  });

  it('evaluates non-JSON input as text so domains are still checked', async () => {
    await call(admin, 'POST', '/policies', { name: 'domains', blockedDomains: ['evil.com'] });
    const runId = await startRun();
    const res = await call(analyst, 'POST', `/runs/${runId}/steps`, {
      actionType: 'tool_call',
      actionName: 'fetch',
      actionInput: 'GET https://evil.com/steal',
    });
    expect(res.body.decision.classification).toBe('blocked');
  });
});

describe('AI analysis', () => {
  it('reports when Gemini is not configured instead of failing opaquely', async () => {
    const runId = await startRun();
    const res = await call(analyst, 'POST', `/runs/${runId}/analyze`);
    expect(res.status).toBe(503);
  });
});

describe('approvals', () => {
  it('resumes the run when approved', async () => {
    const { runId, approvalId } = await blockRun('refund');
    expect(await runStatus(runId)).toBe('paused');
    const res = await call(approver, 'PATCH', `/approvals/${approvalId}`, { status: 'approved' });
    expect(res.status).toBe(200);
    expect(await runStatus(runId)).toBe('running');
  });

  it('fails the run when denied', async () => {
    const { runId, approvalId } = await blockRun();
    await call(approver, 'PATCH', `/approvals/${approvalId}`, { status: 'denied' });
    expect(await runStatus(runId)).toBe('failed');
  });

  it('processes each request once, even when decided concurrently', async () => {
    const { approvalId } = await blockRun();
    const [a, b] = await Promise.all([
      call(approver, 'PATCH', `/approvals/${approvalId}`, { status: 'approved' }),
      call(admin, 'PATCH', `/approvals/${approvalId}`, { status: 'denied' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });

  it('returns 404 for unknown requests', async () => {
    expect((await call(approver, 'PATCH', `/approvals/${crypto.randomUUID()}`, { status: 'approved' })).status).toBe(404);
  });
});

describe('SDK', () => {
  async function createKey(forAgent = agentId) {
    const res = await call(admin, 'POST', '/api-keys', { name: 'k', agentId: forAgent });
    expect(res.status).toBe(201);
    return res.body.key as string;
  }
  const sdk = (key: string, method: string, path: string, body?: unknown) =>
    request(server.url, method, `/v1/sdk${path}`, { token: key, body });

  it('runs the full flow with a key', async () => {
    const key = await createKey();
    const run = await sdk(key, 'POST', '/runs', { task: 'sdk task' });
    expect(run.status).toBe(201);

    const ok = await sdk(key, 'POST', `/runs/${run.body.id}/steps`, { actionType: 'tool_call', actionName: 'ls' });
    expect(ok.body).toMatchObject({ allowed: true, classification: 'safe' });

    const done = await sdk(key, 'POST', `/runs/${run.body.id}/complete`, { summary: 'done' });
    expect(done.body).toEqual({ id: run.body.id, status: 'completed' });
  });

  it('cannot complete a blocked run', async () => {
    const key = await createKey();
    const run = await sdk(key, 'POST', '/runs', { task: 't' });
    const step = await sdk(key, 'POST', `/runs/${run.body.id}/steps`, { actionType: 'tool_call', actionName: 'rm_rf' });
    expect(step.body.allowed).toBe(false);

    expect((await sdk(key, 'POST', `/runs/${run.body.id}/complete`, {})).status).toBe(409);
    expect((await sdk(key, 'GET', `/runs/${run.body.id}/decision`)).body).toMatchObject({ blocked: true, pendingApprovals: 1 });
  });

  it("is limited to its own agent's runs", async () => {
    const otherAgent = await prisma.agent.create({
      data: { name: 'other', provider: 'Custom', capabilities: '[]', createdById: (await prisma.user.findFirstOrThrow()).id },
    });
    const key = await createKey();
    const otherKey = await createKey(otherAgent.id);
    const run = await sdk(otherKey, 'POST', '/runs', { task: 'theirs' });

    expect((await sdk(key, 'POST', '/runs', { task: 't', agentId: otherAgent.id })).status).toBe(403);
    expect((await sdk(key, 'POST', `/runs/${run.body.id}/steps`, { actionType: 'reasoning' })).status).toBe(404);
    expect((await sdk(key, 'POST', `/runs/${run.body.id}/complete`, {})).status).toBe(404);
    expect((await sdk(key, 'GET', `/runs/${run.body.id}/decision`)).status).toBe(404);
  });

  it('rejects unknown, expired, revoked and archived-agent keys', async () => {
    expect((await sdk('sk-nope', 'POST', '/runs', { task: 't' })).status).toBe(401);

    const key = await createKey();
    await prisma.apiKey.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await sdk(key, 'POST', '/runs', { task: 't' })).status).toBe(401);

    const revoked = await createKey();
    const [listed] = await call(admin, 'GET', '/api-keys').then((r) => r.body);
    expect(listed).not.toHaveProperty('keyHash');
    await call(admin, 'DELETE', `/api-keys/${listed.id}`);
    expect((await sdk(revoked, 'POST', '/runs', { task: 't' })).status).toBe(401);

    const archivedKey = await createKey();
    await prisma.agent.update({ where: { id: agentId }, data: { status: 'archived' } });
    expect((await sdk(archivedKey, 'POST', '/runs', { task: 't' })).status).toBe(403);
  });

  it('lets only admins manage keys', async () => {
    expect((await call(analyst, 'GET', '/api-keys')).status).toBe(403);
    expect((await call(analyst, 'POST', '/api-keys', { name: 'k', agentId })).status).toBe(403);
  });
});
