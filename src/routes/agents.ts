import { Router } from 'express';
import { prisma } from '../lib/prisma.ts';
import { z } from 'zod';
import { parsePagination } from '../lib/pagination.ts';
import { writeAuditEvent } from '../services/auditService.ts';
import { requirePermission } from '../middleware/auth.ts';

const router = Router();

// List all agents
router.get('/', async (req, res) => {
  try {
    const page = parsePagination(req.query);
    const agents = await prisma.agent.findMany({
      include: { createdBy: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      ...page,
    });
    res.json(agents);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid pagination', details: error.issues });
    }
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
});

// Get single agent
router.get('/:id', async (req, res) => {
  try {
    const agent = await prisma.agent.findUnique({
      where: { id: req.params.id },
      include: {
        createdBy: { select: { name: true, email: true } },
        runs: { take: 10, orderBy: { createdAt: 'desc' } },
        policies: true,
      },
    });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    res.json(agent);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch agent' });
  }
});

const createAgentSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  provider: z.enum(['Gemini', 'OpenAI', 'Anthropic', 'Custom']),
  capabilities: z.array(z.string()).default([]),
  trustLevel: z.enum(['low', 'medium', 'high']).default('medium'),
  maxTokenBudget: z.number().int().positive().optional(),
  actionBudget: z.number().int().positive().optional(),
  approvalMode: z.boolean().default(true),
});

// Create agent
router.post('/', requirePermission('manage'), async (req, res) => {
  try {
    const parsed = createAgentSchema.parse(req.body);
    const agent = await prisma.agent.create({
      data: {
        name: parsed.name,
        description: parsed.description,
        provider: parsed.provider,
        capabilities: JSON.stringify(parsed.capabilities),
        trustLevel: parsed.trustLevel,
        maxTokenBudget: parsed.maxTokenBudget,
        actionBudget: parsed.actionBudget,
        approvalMode: parsed.approvalMode,
        createdById: req.user!.id,
      },
    });

    await writeAuditEvent({
      eventType: 'agent_created',
      resourceType: 'agent',
      resourceId: agent.id,
      actorId: req.user!.id,
      details: { name: parsed.name, provider: parsed.provider },
    });

    res.status(201).json(agent);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

const updateAgentSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  provider: z.enum(['Gemini', 'OpenAI', 'Anthropic', 'Custom']).optional(),
  capabilities: z.array(z.string()).optional(),
  trustLevel: z.enum(['low', 'medium', 'high']).optional(),
  maxTokenBudget: z.number().int().positive().nullable().optional(),
  actionBudget: z.number().int().positive().nullable().optional(),
  approvalMode: z.boolean().optional(),
  status: z.enum(['active', 'inactive', 'archived']).optional(),
});

// Update agent
router.put('/:id', requirePermission('manage'), async (req, res) => {
  try {
    const parsed = updateAgentSchema.parse(req.body);
    const data: Record<string, unknown> = { ...parsed };
    if (parsed.capabilities) {
      data.capabilities = JSON.stringify(parsed.capabilities);
    }
    const agent = await prisma.agent.update({
      where: { id: req.params.id },
      data: data as any,
    });

    await writeAuditEvent({
      eventType: 'agent_updated',
      resourceType: 'agent',
      resourceId: agent.id,
      actorId: req.user!.id,
      details: parsed,
    });

    res.json(agent);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

// Delete agent (soft delete)
router.delete('/:id', requirePermission('manage'), async (req, res) => {
  try {
    const agent = await prisma.agent.update({
      where: { id: req.params.id },
      data: { status: 'archived' },
    });

    await writeAuditEvent({
      eventType: 'agent_deleted',
      resourceType: 'agent',
      resourceId: agent.id,
      actorId: req.user!.id,
    });

    res.json({ message: 'Agent archived successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete agent' });
  }
});

export default router;
