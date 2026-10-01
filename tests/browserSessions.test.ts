import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as gemini from '../src/services/geminiService.ts';
import { createUser, prisma, request, resetDb, startServer, type TestServer } from './helpers.ts';

let server: TestServer;
let admin: string;
let analyst: string;
let approver: string;

beforeAll(async () => { server = await startServer(); });
afterAll(async () => { await server.close(); });
beforeEach(async () => {
  await resetDb();
  admin = (await createUser('admin')).token;
  analyst = (await createUser('analyst')).token;
  approver = (await createUser('approver')).token;
});
afterEach(() => { vi.restoreAllMocks(); });

const call = (token: string, method: string, path: string, body?: unknown) =>
  request(server.url, method, path, { token, body });

async function newSession(url = 'https://example.com') {
  const res = await call(analyst, 'POST', '/browser-sessions', { url });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

const act = (sessionId: string, actionType: string, target?: string, value?: string) =>
  call(analyst, 'POST', '/browser-sessions/action', { sessionId, actionType, target, value });

const sessionStatus = async (id: string) => (await prisma.browserSession.findUniqueOrThrow({ where: { id } })).status;

describe('browser actions without Gemini', () => {
  it('allows actions no policy stops and says only policies were applied', async () => {
    const sessionId = await newSession();
    const res = await act(sessionId, 'click', '#next');
    expect(res.status).toBe(200);
    expect(res.body.classification).toBe('safe');
    expect(res.body.explanation).toContain('not configured');
  });

  it('applies blocked domains, blocks the session and opens an approval', async () => {
    await call(admin, 'POST', '/policies', { name: 'domains', blockedDomains: ['evil.com'] });
    const sessionId = await newSession();

    const res = await act(sessionId, 'navigate', 'https://login.evil.com');
    expect(res.status).toBe(200);
    expect(res.body.classification).toBe('blocked');
    expect(await sessionStatus(sessionId)).toBe('blocked');

    const approval = await prisma.approvalRequest.findFirstOrThrow({ where: { sessionId } });
    expect(approval).toMatchObject({ runId: null, browserActionId: res.body.id, status: 'pending' });
    expect(await prisma.run.count()).toBe(0);

    expect((await act(sessionId, 'click', '#x')).status).toBe(409);
  });

  it('resumes the session when approved and fails it when denied', async () => {
    await call(admin, 'POST', '/policies', { name: 'domains', blockedDomains: ['evil.com'] });

    const approvedSession = await newSession();
    await act(approvedSession, 'navigate', 'https://evil.com');
    const first = await prisma.approvalRequest.findFirstOrThrow({ where: { sessionId: approvedSession } });
    expect((await call(approver, 'PATCH', `/approvals/${first.id}`, { status: 'approved' })).status).toBe(200);
    expect(await sessionStatus(approvedSession)).toBe('active');

    const deniedSession = await newSession();
    await act(deniedSession, 'navigate', 'https://evil.com');
    const second = await prisma.approvalRequest.findFirstOrThrow({ where: { sessionId: deniedSession } });
    await call(approver, 'PATCH', `/approvals/${second.id}`, { status: 'denied' });
    expect(await sessionStatus(deniedSession)).toBe('failed');

    const listed = await call(approver, 'GET', '/approvals');
    expect(listed.body.map((a: any) => a.session?.url)).toContain('https://example.com');
  });

  it('applies agent-scoped policies to sessions of that agent', async () => {
    const owner = await prisma.user.findFirstOrThrow({ where: { role: 'admin' } });
    const agent = await prisma.agent.create({ data: { name: 'a', provider: 'Custom', capabilities: '[]', createdById: owner.id } });
    await call(admin, 'POST', '/policies', { name: 'no typing', scope: 'agent', agentId: agent.id, blockedTools: ['browser.type'] });
    const res = await call(analyst, 'POST', '/browser-sessions', { url: 'https://example.com', agentId: agent.id });
    expect((await act(res.body.id, 'type', '#password', 'hunter2')).body.classification).toBe('blocked');
  });
});

describe('browser actions with Gemini', () => {
  beforeEach(() => { process.env.GEMINI_API_KEY = 'test-key'; });
  afterEach(() => { process.env.GEMINI_API_KEY = ''; });

  it('holds the action for review when the AI check fails', async () => {
    vi.spyOn(gemini, 'explainBrowserActionRisk').mockRejectedValue(new Error('model down'));
    const sessionId = await newSession();
    const res = await act(sessionId, 'type', '#password', 'hunter2');
    expect(res.status).toBe(200);
    expect(res.body.classification).toBe('requires_approval');
    expect(await sessionStatus(sessionId)).toBe('paused');
    expect(await prisma.approvalRequest.count({ where: { sessionId } })).toBe(1);
  });

  it('uses the stricter of the AI and policy verdicts', async () => {
    vi.spyOn(gemini, 'explainBrowserActionRisk').mockResolvedValue({
      classification: 'safe', riskScore: 5, explanation: 'Looks fine.', policyViolations: [],
    });
    await call(admin, 'POST', '/policies', { name: 'domains', blockedDomains: ['evil.com'] });
    const sessionId = await newSession('https://evil.com');
    const res = await act(sessionId, 'screenshot');
    expect(res.body.classification).toBe('blocked');
    expect(res.body.explanation).toContain('Looks fine.');
  });

  it('blocks when the AI says so', async () => {
    vi.spyOn(gemini, 'explainBrowserActionRisk').mockResolvedValue({
      classification: 'blocked', riskScore: 90, explanation: 'Credential entry.', policyViolations: ['Unauthorized Credential Entry'],
    });
    const sessionId = await newSession();
    const res = await act(sessionId, 'type', '#password', 'hunter2');
    expect(res.body).toMatchObject({ classification: 'blocked', riskScore: 90 });
    expect(JSON.parse(res.body.policyViolations)).toEqual(['Unauthorized Credential Entry']);
  });
});
