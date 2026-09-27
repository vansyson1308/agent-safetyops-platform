import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.ts';
import type { StepClassification } from '../types/index.ts';
import { writeAuditEvent } from './auditService.ts';
import { explainBrowserActionRisk, isGeminiConfigured, type BrowserActionRisk } from './geminiService.ts';
import { evaluateStep } from './policyEngine.ts';

export class BrowserSessionError extends Error {
  constructor(message: string, readonly status: 404 | 409) {
    super(message);
  }
}

export interface BrowserActionInput {
  sessionId: string;
  actionType: string;
  target?: string;
  value?: string;
}

const SEVERITY: StepClassification[] = ['safe', 'warning', 'requires_approval', 'blocked'];

function mostSevere(a: StepClassification, b: StepClassification) {
  return SEVERITY.indexOf(a) >= SEVERITY.indexOf(b) ? a : b;
}

// Gemini's opinion on the action, or why there is none. When the model is
// configured but fails, the action is held for a human instead of allowed.
async function assessWithAi(input: BrowserActionInput, url: string): Promise<{ risk: BrowserActionRisk | null; note: string | null; classification: StepClassification }> {
  if (!isGeminiConfigured()) {
    return { risk: null, note: 'AI risk assessment is not configured (GEMINI_API_KEY); only policies were applied.', classification: 'safe' };
  }
  try {
    const risk = await explainBrowserActionRisk({ actionType: input.actionType, target: input.target, value: input.value, url });
    return { risk, note: null, classification: risk.classification };
  } catch (error) {
    console.error('Browser action risk assessment failed:', error);
    return { risk: null, note: 'AI risk assessment failed, so the action is held for human review.', classification: 'requires_approval' };
  }
}

// Checks a browser action against the agent's policies and the AI risk
// model, records it, and holds the session for approval when either says
// the action should not proceed.
export async function recordBrowserAction(input: BrowserActionInput, actorId: string) {
  const session = await prisma.browserSession.findUnique({ where: { id: input.sessionId } });
  if (!session) throw new BrowserSessionError('Session not found', 404);
  if (session.status !== 'active') {
    throw new BrowserSessionError(`Session is ${session.status}; it accepts actions only while active`, 409);
  }

  const policy = await evaluateStep({
    actionType: 'browser_action',
    actionName: `browser.${input.actionType}`,
    actionInput: { url: session.url, target: input.target, value: input.value },
    agentId: session.agentId,
  });
  const ai = await assessWithAi(input, session.url);

  const classification = mostSevere(policy.classification, ai.classification);
  const riskScore = Math.max(policy.riskScore, ai.risk?.riskScore ?? 0);
  const held = classification === 'blocked' || classification === 'requires_approval';
  const explanation = [
    policy.violations.length > 0 ? policy.reason : null,
    ai.risk?.explanation ?? ai.note,
  ].filter(Boolean).join(' ');
  const violations = [...policy.violations, ...(ai.risk?.policyViolations ?? [])];

  for (let attempt = 0; ; attempt++) {
    const last = await prisma.browserAction.findFirst({
      where: { sessionId: session.id },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });
    const sequence = (last?.sequence ?? 0) + 1;

    try {
      const action = await prisma.$transaction(async (tx) => {
        const guard = await tx.browserSession.updateMany({
          where: { id: session.id, status: 'active' },
          data: {
            riskScore: Math.max(session.riskScore ?? 0, riskScore),
            ...(held ? { status: classification === 'blocked' ? 'blocked' : 'paused' } : {}),
          },
        });
        if (guard.count === 0) throw new BrowserSessionError('Session is no longer active', 409);

        const created = await tx.browserAction.create({
          data: {
            id: crypto.randomUUID(),
            sessionId: session.id,
            sequence,
            actionType: input.actionType,
            target: input.target,
            value: input.value,
            classification,
            riskScore,
            explanation,
            policyViolations: JSON.stringify(violations),
          },
        });

        if (held) {
          await tx.approvalRequest.create({
            data: {
              sessionId: session.id,
              browserActionId: created.id,
              status: 'pending',
              reason: explanation || 'Held for review',
              proposedAction: JSON.stringify({ actionType: input.actionType, target: input.target, value: input.value, url: session.url }),
            },
          });
        }
        return created;
      });

      if (held) {
        await writeAuditEvent({
          eventType: 'browser_action_blocked',
          resourceType: 'browser_action',
          resourceId: action.id,
          actorId,
          details: { sessionId: session.id, classification, reason: explanation },
        });
      }
      return action;
    } catch (error) {
      const duplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
      if (!duplicate || attempt >= 4) throw error;
    }
  }
}
