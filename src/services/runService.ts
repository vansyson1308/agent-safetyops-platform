import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.ts';
import type { PolicyDecision } from '../types/index.ts';
import { writeAuditEvent } from './auditService.ts';
import { evaluateStep } from './policyEngine.ts';

// Run lifecycle shared by the dashboard API and the SDK. Runs only move
// between states through these functions:
//   running -> paused | blocked   (a step needs approval / is blocked)
//   paused | blocked -> running   (every pending approval was approved)
//   paused | blocked -> failed    (an approval was denied)
//   running -> completed          (the run finished)
//   running | paused | blocked -> failed (the run was cancelled)

export class RunServiceError extends Error {
  constructor(message: string, readonly status: 404 | 409) {
    super(message);
  }
}

interface Actor {
  id: string;
  source: 'api' | 'sdk';
  // SDK keys may only touch runs of their own agent.
  agentId?: string;
}

async function findRunFor(runId: string, actor: Actor) {
  const run = await prisma.run.findUnique({ where: { id: runId }, select: { id: true, status: true, agentId: true } });
  if (!run || (actor.agentId && run.agentId !== actor.agentId)) {
    throw new RunServiceError('Run not found', 404);
  }
  return run;
}

export interface StepReport {
  actionType: string;
  actionName?: string;
  // Parsed input used for policy evaluation.
  actionInput?: Record<string, unknown>;
  // What is stored; defaults to JSON of actionInput.
  storedInput?: string | null;
  storedOutput?: string | null;
}

// Evaluates a step against policy and records it. A step that is blocked or
// needs approval pauses the run and opens an approval request, atomically,
// and only while the run is still running.
export async function recordStep(runId: string, report: StepReport, actor: Actor) {
  for (let attempt = 0; ; attempt++) {
    const run = await findRunFor(runId, actor);
    if (run.status !== 'running') {
      throw new RunServiceError(`Run is ${run.status}, not running`, 409);
    }

    const last = await prisma.runStep.findFirst({
      where: { runId },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });
    const sequence = (last?.sequence ?? 0) + 1;

    const decision = await evaluateStep({
      actionType: report.actionType,
      actionName: report.actionName,
      actionInput: report.actionInput,
      agentId: run.agentId,
      stepNumber: sequence,
    });

    try {
      const step = await persistStep(run.id, sequence, report, decision);
      if (!decision.allowed) {
        await writeAuditEvent({
          eventType: decision.classification === 'blocked' ? 'step_blocked' : 'approval_requested',
          resourceType: 'run_step',
          resourceId: step.id,
          actorId: actor.id,
          details: { runId: run.id, reason: decision.reason, source: actor.source },
        });
      }
      return { step, decision };
    } catch (error) {
      // Another step took this sequence number concurrently; re-read and retry.
      const duplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
      if (!duplicate || attempt >= 4) throw error;
    }
  }
}

async function persistStep(runId: string, sequence: number, report: StepReport, decision: PolicyDecision) {
  return prisma.$transaction(async (tx) => {
    // Re-check the run inside the transaction; the write also serializes
    // concurrent steps on the same run.
    const guard = await tx.run.updateMany({
      where: { id: runId, status: 'running' },
      data: decision.allowed
        ? { updatedAt: new Date() }
        : { status: decision.classification === 'blocked' ? 'blocked' : 'paused' },
    });
    if (guard.count === 0) throw new RunServiceError('Run is no longer running', 409);

    const step = await tx.runStep.create({
      data: {
        id: crypto.randomUUID(),
        runId,
        sequence,
        actionType: report.actionType,
        actionName: report.actionName,
        actionInput: report.storedInput !== undefined
          ? report.storedInput
          : report.actionInput ? JSON.stringify(report.actionInput) : null,
        actionOutput: report.storedOutput ?? null,
        classification: decision.classification,
        riskScore: decision.riskScore,
        policyViolations: decision.violations.length > 0 ? JSON.stringify(decision.violations) : null,
      },
    });

    if (!decision.allowed) {
      await tx.approvalRequest.create({
        data: {
          runId,
          stepId: step.id,
          status: 'pending',
          reason: decision.reason,
          proposedAction: JSON.stringify({
            actionType: report.actionType,
            actionName: report.actionName,
            input: report.actionInput,
          }),
        },
      });
    }
    return step;
  });
}

const CANCELLABLE = ['running', 'paused', 'blocked'];

// Moves a run to completed (only from running) or failed (from any
// non-final state). Blocked and paused runs can only resume through the
// approval flow.
export async function finishRun(
  runId: string,
  outcome: 'completed' | 'failed',
  actor: Actor,
  summary?: string,
) {
  const run = await findRunFor(runId, actor);
  const allowedFrom = outcome === 'completed' ? ['running'] : CANCELLABLE;
  const updated = await prisma.run.updateMany({
    where: { id: run.id, status: { in: allowedFrom } },
    data: { status: outcome, ...(summary !== undefined ? { summary } : {}) },
  });
  if (updated.count === 0) {
    throw new RunServiceError(`Cannot mark a ${run.status} run as ${outcome}`, 409);
  }

  await writeAuditEvent({
    eventType: outcome === 'completed' ? 'run_completed' : 'run_failed',
    resourceType: 'run',
    resourceId: run.id,
    actorId: actor.id,
    details: { from: run.status, source: actor.source },
  });
  return prisma.run.findUniqueOrThrow({ where: { id: run.id } });
}

// Approves or denies a pending request. Approving resumes the run once no
// other request for it is pending; denying fails it.
export async function resolveApproval(approvalId: string, decision: 'approved' | 'denied', approverId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.approvalRequest.updateMany({
      where: { id: approvalId, status: 'pending' },
      data: { status: decision, approverId },
    });
    const approval = await tx.approvalRequest.findUnique({ where: { id: approvalId } });
    if (!approval) throw new RunServiceError('Approval request not found', 404);
    if (claimed.count === 0) throw new RunServiceError('Approval already processed', 409);

    if (decision === 'denied') {
      await tx.run.updateMany({
        where: { id: approval.runId, status: { in: ['paused', 'blocked'] } },
        data: { status: 'failed' },
      });
    } else {
      const stillPending = await tx.approvalRequest.count({ where: { runId: approval.runId, status: 'pending' } });
      if (stillPending === 0) {
        await tx.run.updateMany({
          where: { id: approval.runId, status: { in: ['paused', 'blocked'] } },
          data: { status: 'running' },
        });
      }
    }
    return approval;
  });

  await writeAuditEvent({
    eventType: decision === 'approved' ? 'approval_granted' : 'approval_denied',
    resourceType: 'approval_request',
    resourceId: result.id,
    actorId: approverId,
    details: { runId: result.runId, status: decision },
  });
  return result;
}
