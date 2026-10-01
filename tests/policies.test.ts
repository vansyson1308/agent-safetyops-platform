import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createUser, prisma, request, resetDb, startServer, type TestServer } from './helpers.ts';

let server: TestServer;
let token: string;
let agentId: string;

beforeAll(async () => { server = await startServer(); });
afterAll(async () => { await server.close(); });
beforeEach(async () => {
  await resetDb();
  const admin = await createUser('admin');
  token = admin.token;
  const agent = await prisma.agent.create({
    data: { name: 'a', provider: 'Custom', capabilities: '[]', createdById: admin.user.id },
  });
  agentId = agent.id;
});

const call = (method: string, path: string, body?: unknown) => request(server.url, method, path, { token, body });

describe('policy scope', () => {
  it('requires an existing agent for agent-scoped policies', async () => {
    expect((await call('POST', '/policies', { name: 'p', scope: 'agent' })).status).toBe(400);
    expect((await call('POST', '/policies', { name: 'p', scope: 'agent', agentId: crypto.randomUUID() })).status).toBe(400);
    const res = await call('POST', '/policies', { name: 'p', scope: 'agent', agentId });
    expect(res.status).toBe(201);
    expect(res.body.agentId).toBe(agentId);
  });

  it('drops the agent from global policies and validates updates', async () => {
    const created = await call('POST', '/policies', { name: 'p', scope: 'global', agentId });
    expect(created.body.agentId).toBeNull();
    expect((await call('PUT', `/policies/${created.body.id}`, { scope: 'agent' })).status).toBe(400);
    expect((await call('PUT', `/policies/${crypto.randomUUID()}`, { name: 'x' })).status).toBe(404);
  });
});

describe('policy enforcement through the API', () => {
  it('blocks a step matched by a custom "block" rule', async () => {
    const policy = await call('POST', '/policies', { name: 'p', scope: 'agent', agentId });
    await prisma.policyRule.create({
      data: { policyId: policy.body.id, condition: JSON.stringify({ actionName: 'rm_rf' }), action: 'block', severity: 95 },
    });
    const run = await call('POST', '/runs', { task: 't', agentId });
    const step = await call('POST', `/runs/${run.body.id}/steps`, { actionType: 'tool_call', actionName: 'rm_rf' });
    expect(step.status).toBe(201);
    expect(step.body.decision).toMatchObject({ allowed: false, classification: 'blocked' });
  });

  it('applies agent-scoped policies only to that agent', async () => {
    await call('POST', '/policies', { name: 'p', scope: 'agent', agentId, blockedTools: ['rm_rf'] });
    const other = await prisma.agent.create({
      data: { name: 'b', provider: 'Custom', capabilities: '[]', createdById: (await prisma.user.findFirstOrThrow()).id },
    });
    const run = await call('POST', '/runs', { task: 't', agentId: other.id });
    const step = await call('POST', `/runs/${run.body.id}/steps`, { actionType: 'tool_call', actionName: 'rm_rf' });
    expect(step.body.decision.classification).toBe('safe');
  });
});
