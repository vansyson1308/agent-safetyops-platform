import { Router } from 'express';
import { prisma } from '../lib/prisma.ts';
import { z } from 'zod';
import { BrowserSessionError, recordBrowserAction } from '../services/browserSessionService.ts';
import { writeAuditEvent } from '../services/auditService.ts';
import { requirePermission } from '../middleware/auth.ts';

const router = Router();

// List all sessions
router.get('/', async (req, res) => {
  try {
    const sessions = await prisma.browserSession.findMany({
      include: { agent: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch browser sessions' });
  }
});

// Get session details
router.get('/:id', async (req, res) => {
  try {
    const session = await prisma.browserSession.findUnique({
      where: { id: req.params.id },
      include: {
        agent: true,
        actions: { orderBy: { sequence: 'asc' } },
        artifacts: true,
      },
    });
    if (!session) return res.status(404).json({ error: 'Browser session not found' });
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch browser session details' });
  }
});

const createSessionSchema = z.object({
  url: z.string().url(),
  agentId: z.string().uuid().optional(),
});

// Create session
router.post('/', requirePermission('operate'), async (req, res) => {
  try {
    const parsed = createSessionSchema.parse(req.body);
    if (parsed.agentId && !(await prisma.agent.findUnique({ where: { id: parsed.agentId }, select: { id: true } }))) {
      return res.status(400).json({ error: 'Agent not found' });
    }
    const session = await prisma.browserSession.create({
      data: {
        url: parsed.url,
        agentId: parsed.agentId,
        createdById: req.user!.id,
      },
    });

    await writeAuditEvent({
      eventType: 'browser_session_created',
      resourceType: 'browser_session',
      resourceId: session.id,
      actorId: req.user!.id,
      details: { url: parsed.url },
    });

    res.status(201).json(session);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    console.error(error);
    res.status(500).json({ error: 'Failed to create browser session' });
  }
});

const browserActionSchema = z.object({
  sessionId: z.string().uuid(),
  actionType: z.enum(['navigate', 'click', 'type', 'extract_text', 'screenshot']),
  target: z.string().optional(),
  value: z.string().optional(),
});

// Record a browser action. Actions that policy or the AI risk check stop
// pause or block the session until an approver decides.
router.post('/action', requirePermission('operate'), async (req, res) => {
  try {
    const parsed = browserActionSchema.parse(req.body);
    const action = await recordBrowserAction(parsed, req.user!.id);
    res.json(action);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    if (error instanceof BrowserSessionError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error(error);
    res.status(500).json({ error: 'Failed to process browser action' });
  }
});

export default router;
