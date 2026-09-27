import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { createApp } from '../src/app.ts';
import { prisma } from '../src/lib/prisma.ts';

export { prisma };

export interface TestServer {
  url: string;
  close: () => Promise<void>;
}

export async function startServer(): Promise<TestServer> {
  const server: Server = await new Promise((resolve) => {
    const s = createApp().listen(0, () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/api`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

// Deletes every row, children before parents.
export async function resetDb() {
  await prisma.$transaction([
    prisma.auditEvent.deleteMany(),
    prisma.approvalRequest.deleteMany(),
    prisma.incidentReport.deleteMany(),
    prisma.runStep.deleteMany(),
    prisma.run.deleteMany(),
    prisma.browserAction.deleteMany(),
    prisma.browserArtifact.deleteMany(),
    prisma.browserSession.deleteMany(),
    prisma.apiKey.deleteMany(),
    prisma.policyRule.deleteMany(),
    prisma.policy.deleteMany(),
    prisma.agent.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

export async function request(
  base: string,
  method: string,
  path: string,
  options: { token?: string; body?: unknown } = {},
) {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const res = await fetch(base + path, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await res.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch {}
  return { status: res.status, body };
}
