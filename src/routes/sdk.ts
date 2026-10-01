import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.ts';
import { z } from 'zod';
import { writeAuditEvent } from '../services/auditService.ts';
import { finishRun, recordStep, RunServiceError } from '../services/runService.ts';
import { hashApiKey } from '../services/apiKeyService.ts';

const router = Router();

declare global {
  namespace Express {
    interface Request {
      // Set by requireApiKey: the agent this SDK key acts for.
      sdkAgentId?: string;
    }
  }
}

// SDK API key authentication middleware
async function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer sk-')) {
    return res.status(401).json({ error: 'Missing or invalid API key. Use Authorization: Bearer sk-...' });
  }

  try {
    const apiKey = await prisma.apiKey.findUnique({
      where: { keyHash: hashApiKey(authHeader.slice(7)) },
      include: { agent: { select: { status: true } } },
    });

    if (!apiKey) return res.status(401).json({ error: 'Invalid API key' });
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      return res.status(401).json({ error: 'API key expired' });
    }
    if (apiKey.agent.status !== 'active') {
      return res.status(403).json({ error: `Agent is ${apiKey.agent.status}` });
    }

    await prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } });

    req.user = { id: apiKey.createdById, role: 'sdk', email: '' };
    req.sdkAgentId = apiKey.agentId;
    next();
  } catch (error) {
    next(error);
  }
}

router.use(requireApiKey);

function sdkActor(req: Request) {
  return { id: req.user!.id, source: 'sdk' as const, agentId: req.sdkAgentId! };
}

function handleError(res: Response, error: unknown, fallback: string) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: 'Validation error', details: error.issues });
  }
  if (error instanceof RunServiceError) {
    return res.status(error.status).json({ error: error.message });
  }
  console.error(error);
  res.status(500).json({ error: fallback });
}

// --- SDK Endpoints ---

const startRunSchema = z.object({
  task: z.string().min(1),
  // Optional: defaults to the key's agent, and must match it if given.
  agentId: z.string().uuid().optional(),
});

// Start a new run
router.post('/runs', async (req, res) => {
  try {
    const parsed = startRunSchema.parse(req.body);
    const agentId = req.sdkAgentId!;
    if (parsed.agentId && parsed.agentId !== agentId) {
      return res.status(403).json({ error: 'This API key cannot start runs for that agent' });
    }

    const run = await prisma.run.create({
      data: {
        task: parsed.task,
        agentId,
        createdById: req.user!.id,
        status: 'running',
      },
    });

    await writeAuditEvent({
      eventType: 'run_started',
      resourceType: 'run',
      resourceId: run.id,
      actorId: req.user!.id,
      details: { task: parsed.task, agentId, source: 'sdk' },
    });

    res.status(201).json({ id: run.id, status: run.status });
  } catch (error) {
    handleError(res, error, 'Failed to start run');
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
    const { step, decision } = await recordStep(
      req.params.id,
      {
        actionType: parsed.actionType,
        actionName: parsed.actionName,
        actionInput: parsed.actionInput,
        storedOutput: parsed.actionOutput ? JSON.stringify(parsed.actionOutput) : null,
      },
      sdkActor(req),
    );

    res.status(201).json({
      stepId: step.id,
      allowed: decision.allowed,
      classification: decision.classification,
      riskScore: decision.riskScore,
      reason: decision.reason,
      requiresApproval: decision.requiresApproval,
    });
  } catch (error) {
    handleError(res, error, 'Failed to report step');
  }
});

const completeRunSchema = z.object({
  summary: z.string().max(10_000).optional(),
});

// Complete a run. Only running runs can complete; a paused or blocked run
// must be approved first.
router.post('/runs/:id/complete', async (req, res) => {
  try {
    const parsed = completeRunSchema.parse(req.body ?? {});
    const run = await finishRun(req.params.id, 'completed', sdkActor(req), parsed.summary);
    res.json({ id: run.id, status: run.status });
  } catch (error) {
    handleError(res, error, 'Failed to complete run');
  }
});

// Check run decision (polling endpoint for agents)
router.get('/runs/:id/decision', async (req, res) => {
  try {
    const run = await prisma.run.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true, agentId: true },
    });
    if (!run || run.agentId !== req.sdkAgentId) return res.status(404).json({ error: 'Run not found' });

    const pendingApprovals = await prisma.approvalRequest.count({
      where: { runId: run.id, status: 'pending' },
    });

    res.json({
      runId: run.id,
      status: run.status,
      blocked: run.status === 'blocked' || run.status === 'paused',
      pendingApprovals,
    });
  } catch (error) {
    handleError(res, error, 'Failed to fetch decision');
  }
});

export default router;
