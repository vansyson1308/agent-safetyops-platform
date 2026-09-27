import { Router } from 'express';
import { prisma } from '../lib/prisma.ts';
import { z } from 'zod';
import { analyzeRunRisk } from '../services/geminiService.ts';
import { finishRun, recordStep, RunServiceError } from '../services/runService.ts';
import { writeAuditEvent } from '../services/auditService.ts';
import { requirePermission } from '../middleware/auth.ts';

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
router.post('/', requirePermission('operate'), async (req, res) => {
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

// Policies are evaluated against parsed input. Input that is not a JSON
// object is still evaluated (as raw text), so it cannot hide a domain.
function parseActionInput(raw: string | undefined): Record<string, unknown> | undefined {
  if (raw === undefined) return undefined;
  try {
    const value = JSON.parse(raw);
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  } catch {}
  return { input: raw };
}

// Add a step to a run
router.post('/:id/steps', requirePermission('operate'), async (req, res) => {
  try {
    const parsed = addStepSchema.parse(req.body);
    const result = await recordStep(
      req.params.id,
      {
        actionType: parsed.actionType,
        actionName: parsed.actionName,
        actionInput: parseActionInput(parsed.actionInput),
        storedInput: parsed.actionInput ?? null,
        storedOutput: parsed.actionOutput ?? null,
      },
      { id: req.user!.id, source: 'api' },
    );
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    if (error instanceof RunServiceError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error(error);
    res.status(500).json({ error: 'Failed to add step' });
  }
});

const updateRunSchema = z.object({
  // Blocked and paused runs resume only through approvals.
  status: z.enum(['completed', 'failed']).optional(),
  summary: z.string().max(10_000).optional(),
});

// Complete or cancel a run, or edit its summary
router.patch('/:id', requirePermission('operate'), async (req, res) => {
  try {
    const parsed = updateRunSchema.parse(req.body);
    const actor = { id: req.user!.id, source: 'api' as const };

    if (parsed.status) {
      return res.json(await finishRun(req.params.id, parsed.status, actor, parsed.summary));
    }

    const existing = await prisma.run.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Run not found' });
    if (parsed.summary === undefined) return res.json(existing);

    const run = await prisma.run.update({ where: { id: existing.id }, data: { summary: parsed.summary } });
    await writeAuditEvent({
      eventType: 'run_updated',
      resourceType: 'run',
      resourceId: run.id,
      actorId: actor.id,
      details: { summary: parsed.summary },
    });
    res.json(run);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    if (error instanceof RunServiceError) {
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to update run' });
  }
});

// Analyze run with Gemini AI
router.post('/:id/analyze', requirePermission('operate'), async (req, res) => {
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
