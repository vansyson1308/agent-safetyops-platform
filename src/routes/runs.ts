import { Router } from 'express';
import { prisma } from '../lib/prisma.ts';
import { z } from 'zod';
import { analyzeRunRisk } from '../services/geminiService.ts';
import { evaluateStep } from '../services/policyEngine.ts';
import { writeAuditEvent } from '../services/auditService.ts';

const router = Router();

// List all runs
router.get('/', async (req, res) => {
  try {
    const runs = await prisma.run.findMany({
      include: {
        agent: { select: { name: true } },
        createdBy: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(runs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch runs' });
  }
});

// Get run details
router.get('/:id', async (req, res) => {
  try {
    const run = await prisma.run.findUnique({
      where: { id: req.params.id },
      include: {
        agent: true,
        steps: { orderBy: { sequence: 'asc' } },
        approvals: true,
        incidents: true,
      },
    });
    if (!run) return res.status(404).json({ error: 'Run not found' });
    res.json(run);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch run details' });
  }
});

const createRunSchema = z.object({
  task: z.string().min(1),
  agentId: z.string().uuid(),
});

// Create a new run
router.post('/', async (req, res) => {
  try {
    const parsed = createRunSchema.parse(req.body);
    const agent = await prisma.agent.findUnique({ where: { id: parsed.agentId } });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const run = await prisma.run.create({
      data: {
        task: parsed.task,
        agentId: parsed.agentId,
        createdById: req.user!.id,
        status: 'running',
      },
      include: { agent: { select: { name: true } } },
    });

    await writeAuditEvent({
      eventType: 'run_started',
      resourceType: 'run',
      resourceId: run.id,
      actorId: req.user!.id,
      details: { task: parsed.task, agentId: parsed.agentId },
    });

    res.status(201).json(run);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    res.status(500).json({ error: 'Failed to create run' });
  }
});

const addStepSchema = z.object({
  actionType: z.enum(['tool_call', 'reasoning', 'observation']),
  actionName: z.string().optional(),
  actionInput: z.string().optional(),
  actionOutput: z.string().optional(),
});

// Add a step to a run
router.post('/:id/steps', async (req, res) => {
  try {
    const parsed = addStepSchema.parse(req.body);
    const run = await prisma.run.findUnique({
      where: { id: req.params.id },
      include: { steps: true },
    });
    if (!run) return res.status(404).json({ error: 'Run not found' });
    if (run.status !== 'running') return res.status(400).json({ error: 'Run is not in running state' });

    const sequence = run.steps.length + 1;

    // Evaluate step against policies
    let inputObj: Record<string, unknown> = {};
    try { inputObj = JSON.parse(parsed.actionInput || '{}'); } catch {}

    const decision = await evaluateStep({
      actionType: parsed.actionType,
      actionName: parsed.actionName,
      actionInput: inputObj,
      agentId: run.agentId,
      currentStepCount: sequence,
    });

    const step = await prisma.runStep.create({
      data: {
        runId: run.id,
        sequence,
        actionType: parsed.actionType,
        actionName: parsed.actionName,
        actionInput: parsed.actionInput,
        actionOutput: parsed.actionOutput,
        classification: decision.classification,
        riskScore: decision.riskScore,
        policyViolations: decision.violations.length > 0 ? JSON.stringify(decision.violations) : null,
      },
    });

    // If blocked, update run status and create approval request
    if (decision.classification === 'blocked' || decision.classification === 'requires_approval') {
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
            input: inputObj,
          }),
        },
      });

      await writeAuditEvent({
        eventType: 'step_blocked',
        resourceType: 'run_step',
        resourceId: step.id,
        actorId: req.user!.id,
        details: { runId: run.id, reason: decision.reason },
      });
    }

    res.status(201).json({ step, decision });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    console.error(error);
    res.status(500).json({ error: 'Failed to add step' });
  }
});

// Update run status
router.patch('/:id', async (req, res) => {
  try {
    const { status, summary } = req.body;
    const data: Record<string, unknown> = {};
    if (status) data.status = status;
    if (summary) data.summary = summary;

    const run = await prisma.run.update({
      where: { id: req.params.id },
      data: data as any,
    });
    res.json(run);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update run' });
  }
});

// Analyze run with Gemini AI
router.post('/:id/analyze', async (req, res) => {
  try {
    const run = await prisma.run.findUnique({
      where: { id: req.params.id },
      include: { steps: true, agent: true },
    });
    if (!run) return res.status(404).json({ error: 'Run not found' });

    const analysis = await analyzeRunRisk(run);

    await prisma.run.update({
      where: { id: req.params.id },
      data: {
        riskScore: analysis.riskScore,
        confidence: analysis.confidence,
        summary: analysis.reasons.join(' '),
      },
    });

    res.json(analysis);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to analyze run' });
  }
});

export default router;
