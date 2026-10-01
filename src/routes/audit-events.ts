import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.ts';
import { paginationSchema } from '../lib/pagination.ts';

const router = Router();

// Plain strings only: a query like ?eventType[contains]=x must not become a
// Prisma filter object.
const listEventsSchema = paginationSchema.extend({
  eventType: z.string().max(100).optional(),
  resourceType: z.string().max(100).optional(),
  resourceId: z.string().max(100).optional(),
});

// List audit events with optional filtering
router.get('/', async (req, res) => {
  try {
    const { eventType, resourceType, resourceId, limit, offset } = listEventsSchema.parse(req.query);
    const where = { eventType, resourceType, resourceId };

    const [events, total] = await Promise.all([
      prisma.auditEvent.findMany({
        where,
        include: { actor: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.auditEvent.count({ where }),
    ]);

    res.json({ events, total, limit, offset });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    res.status(500).json({ error: 'Failed to fetch audit events' });
  }
});

export default router;
