import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create admin user with password (password: "admin123")
  const passwordHash = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@safetyops.ai' },
    update: {},
    create: {
      email: 'admin@safetyops.ai',
      name: 'Security Admin',
      role: 'admin',
      passwordHash,
    },
  });

  // Create analyst user
  const analyst = await prisma.user.upsert({
    where: { email: 'analyst@safetyops.ai' },
    update: {},
    create: {
      email: 'analyst@safetyops.ai',
      name: 'Risk Analyst',
      role: 'analyst',
      passwordHash: await bcrypt.hash('analyst123', 12),
    },
  });

  // Create Agents
  const agent1 = await prisma.agent.create({
    data: {
      name: 'Customer Support Bot',
      description: 'Handles customer inquiries, refunds, and account management.',
      provider: 'Gemini',
      capabilities: JSON.stringify(['browser', 'email actions', 'CRM actions', 'refund processing']),
      trustLevel: 'medium',
      maxTokenBudget: 50000,
      actionBudget: 10,
      approvalMode: true,
      createdById: admin.id,
    },
  });

  const agent2 = await prisma.agent.create({
    data: {
      name: 'Data Scraper',
      description: 'Collects competitor pricing and market data from public sites.',
      provider: 'Anthropic',
      capabilities: JSON.stringify(['browser', 'web requests', 'data extraction']),
      trustLevel: 'low',
      maxTokenBudget: 20000,
      actionBudget: 50,
      approvalMode: false,
      createdById: admin.id,
    },
  });

  const agent3 = await prisma.agent.create({
    data: {
      name: 'Code Review Agent',
      description: 'Automated code review and security scanning for pull requests.',
      provider: 'OpenAI',
      capabilities: JSON.stringify(['code analysis', 'git operations', 'issue creation']),
      trustLevel: 'high',
      maxTokenBudget: 100000,
      actionBudget: 25,
      approvalMode: false,
      createdById: admin.id,
    },
  });

  // Create Policies
  const policy1 = await prisma.policy.create({
    data: {
      name: 'Strict Financial Controls',
      description: 'Requires approval for any transaction over $50.',
      scope: 'agent',
      agentId: agent1.id,
      allowedTools: JSON.stringify(['read_balance', 'issue_refund', 'view_transactions', 'lookup_order']),
      blockedTools: JSON.stringify(['wire_transfer', 'delete_account', 'modify_credit_limit']),
      blockedDomains: JSON.stringify(['competitor.com', 'malicious.org']),
      allowedDomains: JSON.stringify(['*']),
      restrictedActions: JSON.stringify(['issue_refund', 'modify_subscription']),
      maxSpend: 50.0,
      maxStepsPerRun: 15,
      severityThreshold: 80,
      createdById: admin.id,
    },
  });

  const policy2 = await prisma.policy.create({
    data: {
      name: 'Data Access Controls',
      description: 'Prevents access to sensitive data domains and PII extraction.',
      scope: 'global',
      allowedTools: JSON.stringify(['*']),
      blockedTools: JSON.stringify(['export_pii', 'bulk_download', 'database_dump']),
      blockedDomains: JSON.stringify(['internal.company.com', 'hr-system.local']),
      allowedDomains: JSON.stringify(['*']),
      restrictedActions: JSON.stringify([]),
      maxSpend: null,
      maxStepsPerRun: 30,
      severityThreshold: 70,
      createdById: admin.id,
    },
  });

  // Create Runs
  const run1 = await prisma.run.create({
    data: {
      task: 'Process refund of $120 for user #12345 - order #ORD-2024-8891',
      status: 'blocked',
      riskScore: 85,
      confidence: 95,
      summary: 'Agent attempted to issue a refund exceeding the $50 policy limit without prior approval.',
      agentId: agent1.id,
      createdById: admin.id,
    },
  });

  const run2 = await prisma.run.create({
    data: {
      task: 'Scrape competitor pricing data from market-data.io',
      status: 'completed',
      riskScore: 25,
      confidence: 90,
      summary: 'Data collection completed successfully within policy bounds.',
      agentId: agent2.id,
      createdById: admin.id,
    },
  });

  const run3 = await prisma.run.create({
    data: {
      task: 'Review PR #482 for security vulnerabilities in auth module',
      status: 'completed',
      riskScore: 10,
      confidence: 98,
      summary: 'Code review completed. 2 minor issues flagged.',
      agentId: agent3.id,
      createdById: analyst.id,
    },
  });

  // Create Run Steps for Run 1
  await prisma.runStep.create({
    data: {
      runId: run1.id,
      sequence: 1,
      actionType: 'reasoning',
      actionName: 'analyze_request',
      actionInput: JSON.stringify({ thought: 'User requested a refund for order #ORD-2024-8891. Need to look up the order and process the refund.' }),
      actionOutput: JSON.stringify({ result: 'Order found. Purchase amount is $120. Refund requested.' }),
      classification: 'safe',
      riskScore: 5,
    },
  });

  await prisma.runStep.create({
    data: {
      runId: run1.id,
      sequence: 2,
      actionType: 'tool_call',
      actionName: 'issue_refund',
      actionInput: JSON.stringify({ userId: '12345', amount: 120, orderId: 'ORD-2024-8891' }),
      actionOutput: JSON.stringify({ error: 'Blocked by policy: Strict Financial Controls - Amount exceeds $50 limit' }),
      classification: 'blocked',
      riskScore: 85,
      policyViolations: JSON.stringify([policy1.id]),
    },
  });

  // Steps for Run 2
  await prisma.runStep.create({
    data: {
      runId: run2.id,
      sequence: 1,
      actionType: 'tool_call',
      actionName: 'navigate',
      actionInput: JSON.stringify({ url: 'https://market-data.io/pricing' }),
      actionOutput: JSON.stringify({ status: 200, title: 'Market Data Pricing' }),
      classification: 'safe',
      riskScore: 10,
    },
  });

  await prisma.runStep.create({
    data: {
      runId: run2.id,
      sequence: 2,
      actionType: 'tool_call',
      actionName: 'extract_data',
      actionInput: JSON.stringify({ selector: '.pricing-table', format: 'json' }),
      actionOutput: JSON.stringify({ products: 15, dataPoints: 45 }),
      classification: 'safe',
      riskScore: 15,
    },
  });

  // Steps for Run 3
  await prisma.runStep.create({
    data: {
      runId: run3.id,
      sequence: 1,
      actionType: 'tool_call',
      actionName: 'fetch_pr_diff',
      actionInput: JSON.stringify({ pr: 482, repo: 'company/auth-service' }),
      actionOutput: JSON.stringify({ filesChanged: 8, additions: 145, deletions: 32 }),
      classification: 'safe',
      riskScore: 0,
    },
  });

  await prisma.runStep.create({
    data: {
      runId: run3.id,
      sequence: 2,
      actionType: 'reasoning',
      actionName: 'security_analysis',
      actionInput: JSON.stringify({ thought: 'Analyzing authentication middleware changes for SQL injection and XSS vulnerabilities.' }),
      actionOutput: JSON.stringify({ issues: ['Missing input sanitization in login handler', 'JWT expiry not enforced on refresh'] }),
      classification: 'warning',
      riskScore: 10,
    },
  });

  // Create Approval Request
  await prisma.approvalRequest.create({
    data: {
      runId: run1.id,
      status: 'pending',
      reason: 'Refund amount ($120) exceeds the maximum allowed spend ($50) defined in "Strict Financial Controls" policy.',
      proposedAction: JSON.stringify({ tool: 'issue_refund', args: { userId: '12345', amount: 120, orderId: 'ORD-2024-8891' } }),
    },
  });

  // Create Incident Reports
  await prisma.incidentReport.create({
    data: {
      runId: run1.id,
      title: 'Unauthorized High-Value Refund Attempt',
      summary: 'Customer Support Bot attempted to process a $120 refund, violating the $50 maximum spend policy. The action was automatically blocked.',
      severity: 'high',
      remediation: 'Review agent instructions to ensure it checks policy limits before attempting transactions. Consider adding a pre-check step.',
      reporterId: admin.id,
    },
  });

  // Create Browser Session
  const browserSession = await prisma.browserSession.create({
    data: {
      url: 'https://example-bank.com/login',
      status: 'blocked',
      riskScore: 90,
      summary: 'Agent attempted to input credentials into an unverified financial portal.',
      agentId: agent1.id,
      createdById: admin.id,
    },
  });

  await prisma.browserAction.create({
    data: {
      sessionId: browserSession.id,
      sequence: 1,
      actionType: 'navigate',
      target: 'https://example-bank.com/login',
      classification: 'warning',
      riskScore: 40,
      explanation: 'Navigating to a financial institution login page. This is inherently risky but not explicitly blocked by current policies.',
    },
  });

  const credentialAction = await prisma.browserAction.create({
    data: {
      sessionId: browserSession.id,
      sequence: 2,
      actionType: 'type',
      target: '#username',
      value: 'admin_user',
      classification: 'blocked',
      riskScore: 90,
      policyViolations: JSON.stringify([policy1.id]),
      explanation: 'Attempted to input credentials into a login form. This violates the policy against automated credential entry on financial sites.',
    },
  });

  await prisma.approvalRequest.create({
    data: {
      sessionId: browserSession.id,
      browserActionId: credentialAction.id,
      status: 'pending',
      reason: 'Attempted to input credentials into a login form on a financial site.',
      proposedAction: JSON.stringify({ actionType: 'type', target: '#username', value: 'admin_user', url: 'https://example-bank.com/login' }),
    },
  });

  await prisma.browserArtifact.create({
    data: {
      sessionId: browserSession.id,
      artifactType: 'screenshot',
      metadata: JSON.stringify({ width: 1920, height: 1080, format: 'png', capturedAt: new Date().toISOString() }),
      storagePath: '/artifacts/screenshots/login-page.png',
    },
  });

  // Create Audit Events
  await prisma.auditEvent.create({
    data: {
      eventType: 'run_blocked',
      resourceType: 'run',
      resourceId: run1.id,
      actorId: admin.id,
      details: JSON.stringify({ reason: 'Policy violation: max spend exceeded', policyId: policy1.id }),
    },
  });

  await prisma.auditEvent.create({
    data: {
      eventType: 'incident_created',
      resourceType: 'incident',
      resourceId: run1.id,
      actorId: admin.id,
      details: JSON.stringify({ title: 'Unauthorized High-Value Refund Attempt', severity: 'high' }),
    },
  });

  console.log('Database seeded successfully.');
  console.log(`  - ${2} users (admin@safetyops.ai / admin123)`);
  console.log(`  - ${3} agents`);
  console.log(`  - ${2} policies`);
  console.log(`  - ${3} runs with steps`);
  console.log(`  - ${2} approval requests`);
  console.log(`  - ${1} incident report`);
  console.log(`  - ${1} browser session with actions`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
