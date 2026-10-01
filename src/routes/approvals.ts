import { Router } from 'express';
import { prisma } from '../lib/prisma.ts';
import { z } from 'zod';
import { paginationSchema } from '../lib/pagination.ts';
import { resolveApproval, RunServiceError } from '../services/runService.ts';
import { requirePermission } from '../middleware/auth.ts';

const router = Router();

const listApprovalsSchema = paginationSchema.extend({
  status: z.enum(['pending', 'approved', 'denied', 'modified']).optional(),
});

// List approvals, optionally by status
router.get('/', async (req, res) => {
  try {
    const { status, limit, offset } = listApprovalsSchema.parse(req.query);
    const approvals = await prisma.approvalRequest.findMany({
      where: status ? { status } : {},
      include: {
        run: { select: { task: true, agent: { select: { name: true } } } },
        session: { select: { url: true, agent: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
    res.json(approvals);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    res.status(500).json({ error: 'Failed to fetch approvals' });
  }
});

const updateApprovalSchema = z.object({
  status: z.enum(['approved', 'denied']),
});

// Approve or deny
router.patch('/:id', requirePermission('approve'), async (req, res) => {
  try {
    const parsed = updateApprovalSchema.parse(req.body);
    const approval = await resolveApproval(req.params.id, parsed.status, req.user!.id);
    res.json(approval);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    if (error instanceof RunServiceError) {
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to update approval' });
  }
});

export default router;
