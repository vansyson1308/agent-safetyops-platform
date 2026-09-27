import { Router } from 'express';
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

// Chart data
router.get('/chart-data', async (req, res) => {
  try {
    const days = parseInt(req.query.days as string, 10) || 7;
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const runs = await prisma.run.findMany({
      where: { createdAt: { gte: startDate } },
      select: { createdAt: true, status: true },
    });

    const approvals = await prisma.approvalRequest.findMany({
      where: { createdAt: { gte: startDate } },
      select: { createdAt: true },
    });

    // Group by day
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const chartData: Record<string, { runs: number; blocked: number; approvals: number }> = {};

    for (let i = 0; i < days; i++) {
      const date = new Date(now.getTime() - (days - 1 - i) * 24 * 60 * 60 * 1000);
      const key = dayNames[date.getDay()];
      chartData[key] = { runs: 0, blocked: 0, approvals: 0 };
    }

    for (const run of runs) {
      const key = dayNames[new Date(run.createdAt).getDay()];
      if (chartData[key]) {
        chartData[key].runs++;
        if (run.status === 'blocked') chartData[key].blocked++;
      }
    }

    for (const approval of approvals) {
      const key = dayNames[new Date(approval.createdAt).getDay()];
      if (chartData[key]) chartData[key].approvals++;
    }

    const result = Object.entries(chartData).map(([name, data]) => ({ name, ...data }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch chart data' });
  }
});

export default router;
