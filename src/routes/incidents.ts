import { Router } from 'express';
import { prisma } from '../lib/prisma.ts';
import { z } from 'zod';
import { parsePagination } from '../lib/pagination.ts';
import { writeAuditEvent } from '../services/auditService.ts';
import { requirePermission } from '../middleware/auth.ts';

const router = Router();

// List all incidents
router.get('/', async (req, res) => {
  try {
    const page = parsePagination(req.query);
    const incidents = await prisma.incidentReport.findMany({
      include: {
        run: { select: { task: true, agent: { select: { name: true } } } },
        reporter: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      ...page,
    });
    res.json(incidents);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid pagination', details: error.issues });
    }
    res.status(500).json({ error: 'Failed to fetch incidents' });
  }
});

// Get single incident
router.get('/:id', async (req, res) => {
  try {
    const incident = await prisma.incidentReport.findUnique({
      where: { id: req.params.id },
      include: {
        run: { include: { agent: true, steps: true } },
        reporter: { select: { name: true, email: true } },
      },
    });
    if (!incident) return res.status(404).json({ error: 'Incident not found' });
    res.json(incident);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch incident' });
  }
});

const createIncidentSchema = z.object({
  runId: z.string().uuid(),
  title: z.string().min(1).max(255),
  summary: z.string().min(1),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  remediation: z.string().optional(),
});

// Create incident
router.post('/', requirePermission('operate'), async (req, res) => {
  try {
    const parsed = createIncidentSchema.parse(req.body);
    if (!(await prisma.run.findUnique({ where: { id: parsed.runId }, select: { id: true } }))) {
      return res.status(400).json({ error: 'Run not found' });
    }
    const incident = await prisma.incidentReport.create({
      data: {
        runId: parsed.runId,
        title: parsed.title,
        summary: parsed.summary,
        severity: parsed.severity,
        remediation: parsed.remediation,
        reporterId: req.user!.id,
      },
    });

    await writeAuditEvent({
      eventType: 'incident_created',
      resourceType: 'incident',
      resourceId: incident.id,
      actorId: req.user!.id,
      details: { title: parsed.title, severity: parsed.severity },
    });

    res.status(201).json(incident);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    res.status(500).json({ error: 'Failed to create incident' });
  }
});

const updateIncidentSchema = z.object({
  remediation: z.string().max(10_000).nullable().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
});

// Update incident
router.patch('/:id', requirePermission('operate'), async (req, res) => {
  try {
    const parsed = updateIncidentSchema.parse(req.body);
    const updated = await prisma.incidentReport.updateMany({ where: { id: req.params.id }, data: parsed });
    if (updated.count === 0) return res.status(404).json({ error: 'Incident not found' });
    const incident = await prisma.incidentReport.findUniqueOrThrow({ where: { id: req.params.id } });

    await writeAuditEvent({
      eventType: 'incident_updated',
      resourceType: 'incident',
      resourceId: incident.id,
      actorId: req.user!.id,
      details: parsed,
    });

    res.json(incident);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    res.status(500).json({ error: 'Failed to update incident' });
  }
});

export default router;
