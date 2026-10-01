import { prisma } from '../lib/prisma.ts';


export type AuditEventType =
  | 'agent_created' | 'agent_updated' | 'agent_deleted'
  | 'policy_created' | 'policy_updated' | 'policy_deleted'
  | 'run_started' | 'run_completed' | 'run_failed' | 'run_blocked' | 'run_updated'
  | 'step_blocked' | 'step_flagged'
  | 'approval_requested' | 'approval_granted' | 'approval_denied'
  | 'incident_created' | 'incident_updated'
  | 'browser_session_created' | 'browser_action_blocked'
  | 'api_key_created' | 'api_key_deleted'
  | 'user_login' | 'user_registered';

export async function writeAuditEvent(params: {
  eventType: AuditEventType;
  resourceType: string;
  resourceId: string;
  actorId: string;
  details?: Record<string, unknown>;
}) {
  return prisma.auditEvent.create({
    data: {
      eventType: params.eventType,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      actorId: params.actorId,
      details: JSON.stringify(params.details || {}),
    },
  });
}
