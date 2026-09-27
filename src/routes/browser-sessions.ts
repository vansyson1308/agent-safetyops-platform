import { Router } from 'express';
import { prisma } from '../lib/prisma.ts';
import { z } from 'zod';
import { explainBrowserActionRisk } from '../services/geminiService.ts';
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

// Execute browser action
router.post('/action', requirePermission('operate'), async (req, res) => {
  try {
    const parsed = browserActionSchema.parse(req.body);
    const session = await prisma.browserSession.findUnique({
      where: { id: parsed.sessionId },
      include: { actions: true },
    });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const sequence = session.actions.length + 1;

    // AI risk assessment
    const riskAssessment = await explainBrowserActionRisk({
      actionType: parsed.actionType,
      target: parsed.target,
      value: parsed.value,
      url: session.url,
    });

    const newAction = await prisma.browserAction.create({
      data: {
        sessionId: parsed.sessionId,
        sequence,
        actionType: parsed.actionType,
        target: parsed.target,
        value: parsed.value,
        classification: riskAssessment.classification,
        riskScore: riskAssessment.riskScore,
        explanation: riskAssessment.explanation,
        policyViolations: JSON.stringify(riskAssessment.policyViolations),
      },
    });

    // Update session risk score if this action is riskier
    if (riskAssessment.riskScore > (session.riskScore || 0)) {
      await prisma.browserSession.update({
        where: { id: session.id },
        data: {
          riskScore: riskAssessment.riskScore,
          status: riskAssessment.classification === 'blocked' ? 'blocked' : session.status,
        },
      });
    }

    // If blocked, create an approval request linked to the session
    if (riskAssessment.classification === 'blocked') {
      // Find or create a run for this session to properly link the approval
      let run = await prisma.run.findFirst({ where: { task: `Browser session: ${session.url}` } });
      if (!run) {
        const fallbackAgent = await prisma.agent.findFirst({ where: { status: 'active' } });
        if (!fallbackAgent && !session.agentId) {
          // Cannot create approval without a valid agent - skip
          return;
        }
        run = await prisma.run.create({
          data: {
            task: `Browser session: ${session.url}`,
            status: 'blocked',
            agentId: session.agentId || fallbackAgent!.id,
            createdById: session.createdById,
          },
        });
      }

      await prisma.approvalRequest.create({
        data: {
          runId: run.id,
          status: 'pending',
          reason: riskAssessment.explanation,
          proposedAction: JSON.stringify({ actionType: parsed.actionType, target: parsed.target, value: parsed.value }),
        },
      });

      await writeAuditEvent({
        eventType: 'browser_action_blocked',
        resourceType: 'browser_action',
        resourceId: newAction.id,
        actorId: req.user!.id,
        details: { sessionId: session.id, reason: riskAssessment.explanation },
      });
    }

    res.json(newAction);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }
    console.error(error);
    res.status(500).json({ error: 'Failed to process browser action' });
  }
});

export default router;
