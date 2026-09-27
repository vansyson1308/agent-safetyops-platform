import { prisma } from '../lib/prisma.ts';
import type { PolicyDecision } from '../types/index.ts';


interface EvaluateStepInput {
  actionType: string;
  actionName?: string;
  actionInput?: Record<string, unknown>;
  agentId: string;
  currentStepCount?: number;
  currentSpend?: number;
}

export async function evaluateStep(input: EvaluateStepInput): Promise<PolicyDecision> {
  const violations: string[] = [];
  let maxRiskScore = 0;
  let requiresApproval = false;

  // Fetch all applicable policies (global + agent-specific)
  const policies = await prisma.policy.findMany({
    where: {
      OR: [
        { scope: 'global' },
        { agentId: input.agentId },
      ],
    },
    include: { rules: true },
  });

  for (const policy of policies) {
    // Check blocked tools
    const blockedTools: string[] = JSON.parse(policy.blockedTools || '[]');
    if (input.actionName && blockedTools.includes(input.actionName)) {
      violations.push(`Policy "${policy.name}": tool "${input.actionName}" is blocked`);
      maxRiskScore = Math.max(maxRiskScore, policy.severityThreshold);
    }

    // Check blocked domains
    const blockedDomains: string[] = JSON.parse(policy.blockedDomains || '[]');
    const inputStr = JSON.stringify(input.actionInput || {});
    for (const domain of blockedDomains) {
      if (inputStr.includes(domain)) {
        violations.push(`Policy "${policy.name}": domain "${domain}" is blocked`);
        maxRiskScore = Math.max(maxRiskScore, policy.severityThreshold);
      }
    }

    // Check max steps per run
    if (policy.maxStepsPerRun && input.currentStepCount !== undefined) {
      if (input.currentStepCount >= policy.maxStepsPerRun) {
        violations.push(`Policy "${policy.name}": max steps per run (${policy.maxStepsPerRun}) exceeded`);
        maxRiskScore = Math.max(maxRiskScore, 70);
      }
    }

    // Check max spend
    if (policy.maxSpend && input.currentSpend !== undefined) {
      if (input.currentSpend > policy.maxSpend) {
        violations.push(`Policy "${policy.name}": max spend ($${policy.maxSpend}) exceeded`);
        maxRiskScore = Math.max(maxRiskScore, 90);
      }
    }

    // Check restricted actions (require approval)
    const restrictedActions: string[] = JSON.parse(policy.restrictedActions || '[]');
    if (input.actionName && restrictedActions.includes(input.actionName)) {
      requiresApproval = true;
      violations.push(`Policy "${policy.name}": action "${input.actionName}" requires approval`);
      maxRiskScore = Math.max(maxRiskScore, 60);
    }

    // Evaluate custom policy rules
    for (const rule of policy.rules) {
      const condition = JSON.parse(rule.condition || '{}');
      if (matchesCondition(condition, input)) {
        if (rule.action === 'block') {
          violations.push(`Policy rule: ${JSON.stringify(condition)} -> blocked`);
          maxRiskScore = Math.max(maxRiskScore, rule.severity);
        } else if (rule.action === 'require_approval') {
          requiresApproval = true;
          violations.push(`Policy rule: ${JSON.stringify(condition)} -> requires approval`);
          maxRiskScore = Math.max(maxRiskScore, rule.severity);
        }
      }
    }
  }

  const hasBlockingViolation = violations.some(v => v.includes('is blocked') || v.includes('exceeded'));

  let classification: PolicyDecision['classification'];
  if (hasBlockingViolation) {
    classification = 'blocked';
  } else if (requiresApproval) {
    classification = 'requires_approval';
  } else if (maxRiskScore > 40) {
    classification = 'warning';
  } else {
    classification = 'safe';
  }

  return {
    allowed: classification === 'safe' || classification === 'warning',
    classification,
    riskScore: maxRiskScore,
    violations,
    requiresApproval,
    reason: violations.length > 0
      ? violations.join('; ')
      : 'No policy violations detected',
  };
}

function matchesCondition(condition: Record<string, unknown>, input: EvaluateStepInput): boolean {
  if (condition.actionType && condition.actionType !== input.actionType) return false;
  if (condition.actionName && condition.actionName !== input.actionName) return false;
  if (condition.actionNamePattern && input.actionName) {
    const pattern = new RegExp(condition.actionNamePattern as string);
    if (!pattern.test(input.actionName)) return false;
  }
  return Object.keys(condition).length > 0;
}
