import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { writeAuditEvent } from '../services/auditService.ts';

const router = Router();
const prisma = new PrismaClient();

// List all incidents
router.get('/', async (req, res) => {
  try {
    const incidents = await prisma.incidentReport.findMany({
      include: {
        run: { select: { task: true, agent: { select: { name: true } } } },
        reporter: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(incidents);
  } catch (error) {
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
router.post('/', async (req, res) => {
  try {
    const parsed = createIncidentSchema.parse(req.body);
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

// Update incident
router.patch('/:id', async (req, res) => {
  try {
    const { remediation, severity } = req.body;
    const data: Record<string, unknown> = {};
    if (remediation !== undefined) data.remediation = remediation;
    if (severity !== undefined) data.severity = severity;

    const incident = await prisma.incidentReport.update({
      where: { id: req.params.id },
      data: data as any,
    });

    await writeAuditEvent({
      eventType: 'incident_updated',
      resourceType: 'incident',
      resourceId: incident.id,
      actorId: req.user!.id,
      details: data,
    });

    res.json(incident);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update incident' });
  }
});

export default router;
