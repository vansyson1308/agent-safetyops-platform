import { Router } from 'express';
import { prisma } from '../lib/prisma.ts';
import { z } from 'zod';
import { writeAuditEvent } from '../services/auditService.ts';
import { requirePermission } from '../middleware/auth.ts';

const router = Router();

// List all policies
router.get('/', async (req, res) => {
  try {
    const policies = await prisma.policy.findMany({
      include: { createdBy: { select: { name: true, email: true } }, rules: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(policies);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch policies' });
  }
});

// Get single policy
router.get('/:id', async (req, res) => {
  try {
    const policy = await prisma.policy.findUnique({
      where: { id: req.params.id },
      include: { rules: true, agent: true, createdBy: { select: { name: true, email: true } } },
    });
    if (!policy) return res.status(404).json({ error: 'Policy not found' });
    res.json(policy);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch policy' });
  }
});

const createPolicySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  scope: z.enum(['global', 'agent']).default('global'),
  allowedTools: z.array(z.string()).default([]),
  blockedTools: z.array(z.string()).default([]),
  blockedDomains: z.array(z.string()).default([]),
  allowedDomains: z.array(z.string()).default(['*']),
  restrictedActions: z.array(z.string()).default([]),
  maxSpend: z.number().positive().optional(),
  maxStepsPerRun: z.number().int().positive().optional(),
  severityThreshold: z.number().int().min(0).max(100).default(50),
  agentId: z.string().uuid().optional(),
});

// Create policy
router.post('/', requirePermission('manage'), async (req, res) => {
  try {
    const parsed = createPolicySchema.parse(req.body);
    const policy = await prisma.policy.create({
      data: {
        name: parsed.name,
        description: parsed.description,
        scope: parsed.scope,
        allowedTools: JSON.stringify(parsed.allowedTools),
        blockedTools: JSON.stringify(parsed.blockedTools),
        blockedDomains: JSON.stringify(parsed.blockedDomains),
        allowedDomains: JSON.stringify(parsed.allowedDomains),
        restrictedActions: JSON.stringify(parsed.restrictedActions),
        maxSpend: parsed.maxSpend,
        maxStepsPerRun: parsed.maxStepsPerRun,
        severityThreshold: parsed.severityThreshold,
        agentId: parsed.agentId,
        createdById: req.user!.id,
      },
    });

    await writeAuditEvent({
      eventType: 'policy_created',
      resourceType: 'policy',
      resourceId: policy.id,
      actorId: req.user!.id,
      details: { name: parsed.name, scope: parsed.scope },
    });

    res.status(201).json(policy);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    res.status(500).json({ error: 'Failed to create policy' });
  }
});

const updatePolicySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  scope: z.enum(['global', 'agent']).optional(),
  allowedTools: z.array(z.string()).optional(),
  blockedTools: z.array(z.string()).optional(),
  blockedDomains: z.array(z.string()).optional(),
  allowedDomains: z.array(z.string()).optional(),
  restrictedActions: z.array(z.string()).optional(),
  maxSpend: z.number().positive().nullable().optional(),
  maxStepsPerRun: z.number().int().positive().nullable().optional(),
  severityThreshold: z.number().int().min(0).max(100).optional(),
  agentId: z.string().uuid().nullable().optional(),
});

// Update policy
router.put('/:id', requirePermission('manage'), async (req, res) => {
  try {
    const parsed = updatePolicySchema.parse(req.body);
    const data: Record<string, unknown> = {};
    if (parsed.name !== undefined) data.name = parsed.name;
    if (parsed.description !== undefined) data.description = parsed.description;
    if (parsed.scope !== undefined) data.scope = parsed.scope;
    if (parsed.allowedTools !== undefined) data.allowedTools = JSON.stringify(parsed.allowedTools);
    if (parsed.blockedTools !== undefined) data.blockedTools = JSON.stringify(parsed.blockedTools);
    if (parsed.blockedDomains !== undefined) data.blockedDomains = JSON.stringify(parsed.blockedDomains);
    if (parsed.allowedDomains !== undefined) data.allowedDomains = JSON.stringify(parsed.allowedDomains);
    if (parsed.restrictedActions !== undefined) data.restrictedActions = JSON.stringify(parsed.restrictedActions);
    if (parsed.maxSpend !== undefined) data.maxSpend = parsed.maxSpend;
    if (parsed.maxStepsPerRun !== undefined) data.maxStepsPerRun = parsed.maxStepsPerRun;
    if (parsed.severityThreshold !== undefined) data.severityThreshold = parsed.severityThreshold;
    if (parsed.agentId !== undefined) data.agentId = parsed.agentId;

    const policy = await prisma.policy.update({
      where: { id: req.params.id },
      data: data as any,
    });

    await writeAuditEvent({
      eventType: 'policy_updated',
      resourceType: 'policy',
      resourceId: policy.id,
      actorId: req.user!.id,
      details: parsed,
    });

    res.json(policy);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    res.status(500).json({ error: 'Failed to update policy' });
  }
});

// Delete policy
router.delete('/:id', requirePermission('manage'), async (req, res) => {
  try {
    await prisma.policy.delete({ where: { id: req.params.id } });

    await writeAuditEvent({
      eventType: 'policy_deleted',
      resourceType: 'policy',
      resourceId: req.params.id,
      actorId: req.user!.id,
    });

    res.json({ message: 'Policy deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete policy' });
  }
});

export default router;
