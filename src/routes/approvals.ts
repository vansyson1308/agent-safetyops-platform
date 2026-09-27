import { Router } from 'express';
import { prisma } from '../lib/prisma.ts';
import { z } from 'zod';
import { resolveApproval, RunServiceError } from '../services/runService.ts';
import { requirePermission } from '../middleware/auth.ts';

const router = Router();

// List all approvals
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const where = status ? { status: status as string } : {};
    const approvals = await prisma.approvalRequest.findMany({
      where,
      include: {
        run: { select: { task: true, agent: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(approvals);
  } catch (error) {
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
