import type { Policy, PolicyRule } from '@prisma/client';
import { prisma } from '../lib/prisma.ts';
import type { PolicyDecision } from '../types/index.ts';

export interface StepToEvaluate {
  actionType: string;
  actionName?: string;
  actionInput?: Record<string, unknown>;
  // 1-based position of this step in its run.
  stepNumber?: number;
  currentSpend?: number;
}

export type PolicyWithRules = Policy & { rules: PolicyRule[] };

// Risk assigned when a policy cannot be read: the step is blocked.
const MISCONFIGURED_RISK = 100;

// Loads the global policies plus those attached to the agent and evaluates
// the step against them.
export async function evaluateStep(input: StepToEvaluate & { agentId: string | null }): Promise<PolicyDecision> {
  const policies = await prisma.policy.findMany({
    where: {
      OR: [
        { scope: 'global' },
        ...(input.agentId ? [{ agentId: input.agentId }] : []),
      ],
    },
    include: { rules: true },
  });
  return evaluatePolicies(policies, input);
}

export function evaluatePolicies(policies: PolicyWithRules[], input: StepToEvaluate): PolicyDecision {
  const violations: string[] = [];
  let riskScore = 0;
  let blocked = false;
  let requiresApproval = false;

  const block = (message: string, risk: number) => {
    violations.push(message);
    riskScore = Math.max(riskScore, risk);
    blocked = true;
  };
  const flagForApproval = (message: string, risk: number) => {
    violations.push(message);
    riskScore = Math.max(riskScore, risk);
    requiresApproval = true;
  };

  const hosts = extractHosts(input.actionInput ?? {});

  for (const policy of policies) {
    const label = `Policy "${policy.name}"`;
    const severity = policy.severityThreshold;

    let lists: Record<ListField, string[]>;
    try {
      lists = parseLists(policy);
    } catch (error) {
      block(`${label} is misconfigured (${(error as Error).message}); blocking until it is fixed`, MISCONFIGURED_RISK);
      continue;
    }

    // Tools
    if (input.actionName && lists.blockedTools.includes(input.actionName)) {
      block(`${label}: tool "${input.actionName}" is blocked`, severity);
    }
    if (input.actionType === 'tool_call' && !allowsAll(lists.allowedTools)) {
      if (!input.actionName) {
        block(`${label}: tool calls must name an allowed tool`, severity);
      } else if (!lists.allowedTools.includes(input.actionName)) {
        block(`${label}: tool "${input.actionName}" is not in the allowed tools`, severity);
      }
    }

    // Domains
    const blockedDomains = lists.blockedDomains.map(normalizeDomainPattern).filter(Boolean);
    for (const host of hosts.all) {
      const match = blockedDomains.find((domain) => hostMatches(host, domain));
      if (match) block(`${label}: domain "${host}" is blocked (${match})`, severity);
    }
    if (!allowsAll(lists.allowedDomains)) {
      const allowedDomains = lists.allowedDomains.map(normalizeDomainPattern).filter(Boolean);
      for (const host of hosts.fromUrls) {
        if (!allowedDomains.some((domain) => hostMatches(host, domain))) {
          block(`${label}: domain "${host}" is not in the allowed domains`, severity);
        }
      }
    }

    // Budgets
    if (policy.maxStepsPerRun && input.stepNumber !== undefined && input.stepNumber > policy.maxStepsPerRun) {
      block(`${label}: max steps per run (${policy.maxStepsPerRun}) exceeded`, 70);
    }
    if (policy.maxSpend && input.currentSpend !== undefined && input.currentSpend > policy.maxSpend) {
      block(`${label}: max spend ($${policy.maxSpend}) exceeded`, 90);
    }

    // Actions that need a human decision
    if (input.actionName && lists.restrictedActions.includes(input.actionName)) {
      flagForApproval(`${label}: action "${input.actionName}" requires approval`, 60);
    }

    // Custom rules
    for (const rule of policy.rules) {
      let matched: boolean;
      try {
        matched = ruleMatches(rule, input);
      } catch (error) {
        block(`${label}: rule ${rule.id} is misconfigured (${(error as Error).message}); blocking until it is fixed`, MISCONFIGURED_RISK);
        continue;
      }
      if (!matched) continue;
      if (rule.action === 'block') {
        block(`${label}: rule ${rule.condition} blocks this action`, rule.severity);
      } else if (rule.action === 'require_approval') {
        flagForApproval(`${label}: rule ${rule.condition} requires approval`, rule.severity);
      }
    }
  }

  let classification: PolicyDecision['classification'];
  if (blocked) classification = 'blocked';
  else if (requiresApproval) classification = 'requires_approval';
  else if (riskScore > 40) classification = 'warning';
  else classification = 'safe';

  return {
    allowed: classification === 'safe' || classification === 'warning',
    classification,
    riskScore,
    violations,
    requiresApproval,
    reason: violations.length > 0 ? violations.join('; ') : 'No policy violations detected',
  };
}

// --- Policy fields ---

const LIST_FIELDS = ['allowedTools', 'blockedTools', 'blockedDomains', 'allowedDomains', 'restrictedActions'] as const;
type ListField = typeof LIST_FIELDS[number];

function parseLists(policy: Policy): Record<ListField, string[]> {
  const lists = {} as Record<ListField, string[]>;
  for (const field of LIST_FIELDS) {
    const raw = policy[field];
    let value: unknown;
    try {
      value = raw ? JSON.parse(raw) : [];
    } catch {
      throw new Error(`${field} is not valid JSON`);
    }
    if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
      throw new Error(`${field} must be an array of strings`);
    }
    lists[field] = value;
  }
  return lists;
}

// An empty allow-list, or one containing "*", allows everything.
function allowsAll(list: string[]) {
  return list.length === 0 || list.includes('*');
}

// --- Rules ---

const RULE_CONDITION_KEYS = ['actionType', 'actionName', 'actionNamePattern'];

function ruleMatches(rule: PolicyRule, input: StepToEvaluate): boolean {
  let condition: unknown;
  try {
    condition = JSON.parse(rule.condition);
  } catch {
    throw new Error('condition is not valid JSON');
  }
  if (typeof condition !== 'object' || condition === null || Array.isArray(condition)) {
    throw new Error('condition must be an object');
  }
  const c = condition as Record<string, unknown>;
  const keys = Object.keys(c);
  const unknown = keys.filter((key) => !RULE_CONDITION_KEYS.includes(key));
  if (keys.length === 0 || unknown.length > 0) {
    throw new Error(unknown.length > 0 ? `unsupported condition keys: ${unknown.join(', ')}` : 'condition is empty');
  }

  if (c.actionType !== undefined && c.actionType !== input.actionType) return false;
  if (c.actionName !== undefined && c.actionName !== input.actionName) return false;
  if (c.actionNamePattern !== undefined) {
    let pattern: RegExp;
    try {
      pattern = new RegExp(String(c.actionNamePattern));
    } catch {
      throw new Error('actionNamePattern is not a valid regular expression');
    }
    if (!input.actionName || !pattern.test(input.actionName)) return false;
  }
  return true;
}

// --- Domains ---

const URL_PATTERN = /[a-z][a-z0-9+.-]*:\/\/[^\s"'<>\\]+/gi;
const HOSTNAME_PATTERN = /(?<![a-z0-9.-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])(?![a-z0-9-])/gi;

// Collects hostnames mentioned anywhere in the step input (keys and string
// values, percent-decoded). `fromUrls` holds hosts of explicit URLs and is
// what allow-lists are checked against; `all` also includes bare names like
// "evil.com" or the domain of an email address, and feeds block-lists.
export function extractHosts(value: unknown): { fromUrls: Set<string>; all: Set<string> } {
  const fromUrls = new Set<string>();
  const all = new Set<string>();

  for (const text of collectStrings(value)) {
    for (const variant of decodeVariants(text)) {
      for (const match of variant.matchAll(URL_PATTERN)) {
        try {
          const host = normalizeHost(new URL(match[0]).hostname);
          if (host) {
            fromUrls.add(host);
            all.add(host);
          }
        } catch {
          // Not a parseable URL; bare-hostname matching below still applies.
        }
      }
      for (const match of variant.matchAll(HOSTNAME_PATTERN)) {
        all.add(normalizeHost(match[0]));
      }
    }
  }
  return { fromUrls, all };
}

function collectStrings(value: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 20) return out;
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, out, depth + 1));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      out.push(key);
      collectStrings(item, out, depth + 1);
    }
  }
  return out;
}

// The text plus up to three rounds of percent-decoding, so "x%2Ecom" and
// double-encoded forms are seen as "x.com".
function decodeVariants(text: string): string[] {
  const variants = [text];
  let current = text;
  for (let i = 0; i < 3 && current.includes('%'); i++) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      variants.push(decoded);
      current = decoded;
    } catch {
      break;
    }
  }
  return variants;
}

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');
}

// Accepts "example.com", "*.example.com", ".example.com" or a full URL.
function normalizeDomainPattern(pattern: string): string {
  let value = pattern.trim().toLowerCase();
  if (value.includes('://')) {
    try {
      value = new URL(value).hostname;
    } catch {
      // Keep the raw value.
    }
  }
  return value.replace(/^\*?\.+/, '').replace(/\.+$/, '');
}

// A domain covers itself and its subdomains, never unrelated names that
// merely end with the same letters ("x.com" does not cover "dropbox.com").
function hostMatches(host: string, domain: string) {
  return host === domain || host.endsWith(`.${domain}`);
}
