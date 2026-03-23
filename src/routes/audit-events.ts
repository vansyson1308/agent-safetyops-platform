import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// List audit events with optional filtering
router.get('/', async (req, res) => {
  try {
    const { eventType, resourceType, resourceId, limit = '50', offset = '0' } = req.query;

    const where: Record<string, unknown> = {};
    if (eventType) where.eventType = eventType;
    if (resourceType) where.resourceType = resourceType;
    if (resourceId) where.resourceId = resourceId;

    const [events, total] = await Promise.all([
      prisma.auditEvent.findMany({
        where: where as any,
        include: { actor: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        take: Math.min(parseInt(limit as string, 10) || 50, 100),
        skip: parseInt(offset as string, 10) || 0,
      }),
      prisma.auditEvent.count({ where: where as any }),
    ]);

    res.json({ events, total, limit: parseInt(limit as string, 10), offset: parseInt(offset as string, 10) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit events' });
  }
});

export default router;
