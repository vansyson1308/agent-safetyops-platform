import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.ts';

const router = Router();

// Dashboard stats
router.get('/stats', async (req, res) => {
  try {
    const [totalRuns, blockedRuns, approvalRequiredRuns, agentsCount] = await Promise.all([
      prisma.run.count(),
      prisma.run.count({ where: { status: 'blocked' } }),
      prisma.approvalRequest.count({ where: { status: 'pending' } }),
      prisma.agent.count({ where: { status: 'active' } }),
    ]);

    const recentIncidents = await prisma.incidentReport.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: { run: { select: { task: true } } },
    });

    res.json({
      totalRuns,
      blockedRuns,
      approvalRequiredRuns,
      agentsCount,
      recentIncidents,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

const DAY_MS = 24 * 60 * 60 * 1000;

// Chart data: runs, blocked runs and approval requests per UTC day for the
// last `days` days (1-90, default 7).
router.get('/chart-data', async (req, res) => {
  try {
    const days = z.coerce.number().int().min(1).max(90).catch(7).parse(req.query.days ?? 7);
    const todayStart = new Date(new Date().toISOString().slice(0, 10)).getTime();
    const startDate = new Date(todayStart - (days - 1) * DAY_MS);

    const [runs, approvals] = await Promise.all([
      prisma.run.findMany({ where: { createdAt: { gte: startDate } }, select: { createdAt: true, status: true } }),
      prisma.approvalRequest.findMany({ where: { createdAt: { gte: startDate } }, select: { createdAt: true } }),
    ]);

    const buckets = new Map<string, { date: string; name: string; runs: number; blocked: number; approvals: number }>();
    for (let i = 0; i < days; i++) {
      const day = new Date(startDate.getTime() + i * DAY_MS);
      const date = day.toISOString().slice(0, 10);
      const name = days <= 7
        ? day.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
        : day.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
      buckets.set(date, { date, name, runs: 0, blocked: 0, approvals: 0 });
    }

    const bucketFor = (createdAt: Date) => buckets.get(createdAt.toISOString().slice(0, 10));
    for (const run of runs) {
      const bucket = bucketFor(run.createdAt);
      if (!bucket) continue;
      bucket.runs++;
      if (run.status === 'blocked') bucket.blocked++;
    }
    for (const approval of approvals) {
      const bucket = bucketFor(approval.createdAt);
      if (bucket) bucket.approvals++;
    }

    res.json([...buckets.values()]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch chart data' });
  }
});

export default router;
