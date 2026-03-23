import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { writeAuditEvent } from '../services/auditService.ts';

const router = Router();
const prisma = new PrismaClient();

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
router.patch('/:id', async (req, res) => {
  try {
    const parsed = updateApprovalSchema.parse(req.body);

    const approval = await prisma.approvalRequest.findUnique({
      where: { id: req.params.id },
    });
    if (!approval) return res.status(404).json({ error: 'Approval request not found' });
    if (approval.status !== 'pending') return res.status(400).json({ error: 'Approval already processed' });

    const updated = await prisma.approvalRequest.update({
      where: { id: req.params.id },
      data: {
        status: parsed.status,
        approverId: req.user!.id,
      },
    });

    // Resume or fail the associated run
    if (parsed.status === 'approved') {
      await prisma.run.update({
        where: { id: approval.runId },
        data: { status: 'running' },
      });
    } else {
      await prisma.run.update({
        where: { id: approval.runId },
        data: { status: 'failed' },
      });
    }

    await writeAuditEvent({
      eventType: parsed.status === 'approved' ? 'approval_granted' : 'approval_denied',
      resourceType: 'approval_request',
      resourceId: updated.id,
      actorId: req.user!.id,
      details: { runId: approval.runId, status: parsed.status },
    });

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    res.status(500).json({ error: 'Failed to update approval' });
  }
});

export default router;
