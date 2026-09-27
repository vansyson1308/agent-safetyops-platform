import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.ts';
import { z } from 'zod';
import crypto from 'crypto';
import { evaluateStep } from '../services/policyEngine.ts';
import { writeAuditEvent } from '../services/auditService.ts';

const router = Router();

// SDK API Key authentication middleware
async function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer sk-')) {
    return res.status(401).json({ error: 'Missing or invalid API key. Use Authorization: Bearer sk-...' });
  }

  const rawKey = authHeader.slice(7);
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
    include: { agent: true },
  });

  if (!apiKey) return res.status(401).json({ error: 'Invalid API key' });
  if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
    return res.status(401).json({ error: 'API key expired' });
  }

  // Update last used
  await prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } });

  req.user = { id: apiKey.createdById, role: 'sdk', email: '' };
  (req as any).apiKey = apiKey;
  next();
}

router.use(requireApiKey);

// --- SDK Endpoints ---

const startRunSchema = z.object({
  task: z.string().min(1),
  agentId: z.string().uuid(),
});

// Start a new run
router.post('/runs', async (req, res) => {
  try {
    const parsed = startRunSchema.parse(req.body);
    const agent = await prisma.agent.findUnique({ where: { id: parsed.agentId } });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const run = await prisma.run.create({
      data: {
        task: parsed.task,
        agentId: parsed.agentId,
        createdById: req.user!.id,
        status: 'running',
      },
    });

    await writeAuditEvent({
      eventType: 'run_started',
      resourceType: 'run',
      resourceId: run.id,
      actorId: req.user!.id,
      details: { task: parsed.task, agentId: parsed.agentId, source: 'sdk' },
    });

    res.status(201).json({ id: run.id, status: run.status });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    res.status(500).json({ error: 'Failed to start run' });
  }
});

const reportStepSchema = z.object({
  actionType: z.enum(['tool_call', 'reasoning', 'observation']),
  actionName: z.string().optional(),
  actionInput: z.record(z.string(), z.unknown()).optional(),
  actionOutput: z.record(z.string(), z.unknown()).optional(),
});

// Report a step
router.post('/runs/:id/steps', async (req, res) => {
  try {
    const parsed = reportStepSchema.parse(req.body);
    const run = await prisma.run.findUnique({
      where: { id: req.params.id },
      include: { steps: true },
    });
    if (!run) return res.status(404).json({ error: 'Run not found' });
    if (run.status !== 'running') {
      return res.status(400).json({ error: `Run is ${run.status}, not running`, status: run.status });
    }

    const sequence = run.steps.length + 1;

    const decision = await evaluateStep({
      actionType: parsed.actionType,
      actionName: parsed.actionName,
      actionInput: parsed.actionInput as Record<string, unknown>,
      agentId: run.agentId,
      currentStepCount: sequence,
    });

    const step = await prisma.runStep.create({
      data: {
        runId: run.id,
        sequence,
        actionType: parsed.actionType,
        actionName: parsed.actionName,
        actionInput: parsed.actionInput ? JSON.stringify(parsed.actionInput) : null,
        actionOutput: parsed.actionOutput ? JSON.stringify(parsed.actionOutput) : null,
        classification: decision.classification,
        riskScore: decision.riskScore,
        policyViolations: decision.violations.length > 0 ? JSON.stringify(decision.violations) : null,
      },
    });

    if (!decision.allowed) {
      await prisma.run.update({
        where: { id: run.id },
        data: { status: decision.classification === 'blocked' ? 'blocked' : 'paused' },
      });

      await prisma.approvalRequest.create({
        data: {
          runId: run.id,
          stepId: step.id,
          status: 'pending',
          reason: decision.reason,
          proposedAction: JSON.stringify({
            actionType: parsed.actionType,
            actionName: parsed.actionName,
            input: parsed.actionInput,
          }),
        },
      });
    }

    res.status(201).json({
      stepId: step.id,
      allowed: decision.allowed,
      classification: decision.classification,
      riskScore: decision.riskScore,
      reason: decision.reason,
      requiresApproval: decision.requiresApproval,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    console.error(error);
    res.status(500).json({ error: 'Failed to report step' });
  }
});

// Complete a run
router.post('/runs/:id/complete', async (req, res) => {
  try {
    const { summary } = req.body;
    const run = await prisma.run.update({
      where: { id: req.params.id },
      data: { status: 'completed', summary },
    });

    await writeAuditEvent({
      eventType: 'run_completed',
      resourceType: 'run',
      resourceId: run.id,
      actorId: req.user!.id,
      details: { source: 'sdk' },
    });

    res.json({ id: run.id, status: 'completed' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to complete run' });
  }
});

// Check run decision (polling endpoint for agents)
router.get('/runs/:id/decision', async (req, res) => {
  try {
    const run = await prisma.run.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true },
    });
    if (!run) return res.status(404).json({ error: 'Run not found' });

    const pendingApprovals = await prisma.approvalRequest.findMany({
      where: { runId: run.id, status: 'pending' },
    });

    res.json({
      runId: run.id,
      status: run.status,
      blocked: run.status === 'blocked' || run.status === 'paused',
      pendingApprovals: pendingApprovals.length,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch decision' });
  }
});

export default router;
