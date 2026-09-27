import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.ts';
import { requirePermission } from '../middleware/auth.ts';
import { generateApiKey } from '../services/apiKeyService.ts';
import { writeAuditEvent } from '../services/auditService.ts';

const router = Router();

router.use(requirePermission('manage'));

const publicFields = {
  id: true,
  name: true,
  prefix: true,
  agentId: true,
  agent: { select: { name: true } },
  createdBy: { select: { name: true, email: true } },
  lastUsedAt: true,
  expiresAt: true,
  createdAt: true,
} as const;

// List SDK API keys (never their hashes)
router.get('/', async (req, res) => {
  try {
    const keys = await prisma.apiKey.findMany({ select: publicFields, orderBy: { createdAt: 'desc' } });
    res.json(keys);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch API keys' });
  }
});

const createKeySchema = z.object({
  name: z.string().min(1).max(255),
  agentId: z.string().uuid(),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
});

// Create a key for one agent. The raw key is only returned here.
router.post('/', async (req, res) => {
  try {
    const parsed = createKeySchema.parse(req.body);
    const agent = await prisma.agent.findUnique({ where: { id: parsed.agentId }, select: { id: true } });
    if (!agent) return res.status(400).json({ error: 'Agent not found' });

    const { key, keyHash, prefix } = generateApiKey();
    const apiKey = await prisma.apiKey.create({
      data: {
        name: parsed.name,
        keyHash,
        prefix,
        agentId: agent.id,
        createdById: req.user!.id,
        expiresAt: parsed.expiresInDays ? new Date(Date.now() + parsed.expiresInDays * 86_400_000) : null,
      },
      select: publicFields,
    });

    await writeAuditEvent({
      eventType: 'api_key_created',
      resourceType: 'api_key',
      resourceId: apiKey.id,
      actorId: req.user!.id,
      details: { name: parsed.name, agentId: agent.id, prefix },
    });

    res.status(201).json({ apiKey, key });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

// Revoke a key
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await prisma.apiKey.deleteMany({ where: { id: req.params.id } });
    if (deleted.count === 0) return res.status(404).json({ error: 'API key not found' });

    await writeAuditEvent({
      eventType: 'api_key_deleted',
      resourceType: 'api_key',
      resourceId: req.params.id,
      actorId: req.user!.id,
    });

    res.json({ message: 'API key revoked' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

export default router;
