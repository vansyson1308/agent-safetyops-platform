import { describe, expect, it } from 'vitest';
import { evaluatePolicies, extractHosts, type PolicyWithRules } from '../src/services/policyEngine.ts';

let ruleId = 0;

function policy(overrides: Partial<Omit<PolicyWithRules, 'rules'>> & { rules?: Array<{ condition: unknown; action: string; severity?: number }> } = {}): PolicyWithRules {
  const { rules = [], ...fields } = overrides;
  const now = new Date();
  return {
    id: 'policy-1',
    name: 'Test policy',
    description: null,
    scope: 'global',
    allowedTools: '[]',
    blockedTools: '[]',
    blockedDomains: '[]',
    allowedDomains: '["*"]',
    restrictedActions: '[]',
    maxSpend: null,
    maxStepsPerRun: null,
    severityThreshold: 50,
    agentId: null,
    createdById: 'user-1',
    createdAt: now,
    updatedAt: now,
    ...fields,
    rules: rules.map((rule) => ({
      id: `rule-${++ruleId}`,
      policyId: 'policy-1',
      condition: typeof rule.condition === 'string' ? rule.condition : JSON.stringify(rule.condition),
      action: rule.action,
      severity: rule.severity ?? 90,
      createdAt: now,
      updatedAt: now,
    })),
  };
}

const toolCall = (actionName: string, actionInput: Record<string, unknown> = {}, stepNumber = 1) => ({
  actionType: 'tool_call',
  actionName,
  actionInput,
  stepNumber,
});

describe('evaluatePolicies', () => {
  it('allows steps when no policy applies', () => {
    const decision = evaluatePolicies([policy()], toolCall('ls'));
    expect(decision).toMatchObject({ allowed: true, classification: 'safe', violations: [] });
  });

  it('blocks tools on the block-list', () => {
    const decision = evaluatePolicies([policy({ blockedTools: '["rm_rf"]' })], toolCall('rm_rf'));
    expect(decision).toMatchObject({ allowed: false, classification: 'blocked' });
  });

  describe('custom rules', () => {
    it('blocks when a "block" rule matches', () => {
      const p = policy({ rules: [{ condition: { actionName: 'rm_rf' }, action: 'block', severity: 95 }] });
      expect(evaluatePolicies([p], toolCall('rm_rf'))).toMatchObject({ allowed: false, classification: 'blocked', riskScore: 95 });
      expect(evaluatePolicies([p], toolCall('ls'))).toMatchObject({ allowed: true, classification: 'safe' });
    });

    it('blocks a low-severity "block" rule too', () => {
      const p = policy({ rules: [{ condition: { actionName: 'rm_rf' }, action: 'block', severity: 10 }] });
      expect(evaluatePolicies([p], toolCall('rm_rf')).classification).toBe('blocked');
    });

    it('requires approval when a "require_approval" rule matches', () => {
      const p = policy({ rules: [{ condition: { actionType: 'tool_call' }, action: 'require_approval' }] });
      expect(evaluatePolicies([p], toolCall('ls'))).toMatchObject({ allowed: false, classification: 'requires_approval' });
    });

    it('matches actionNamePattern only when the step has a name', () => {
      const p = policy({ rules: [{ condition: { actionNamePattern: '^delete_' }, action: 'block' }] });
      expect(evaluatePolicies([p], toolCall('delete_user')).classification).toBe('blocked');
      expect(evaluatePolicies([p], { actionType: 'reasoning' }).classification).toBe('safe');
    });

    it('fails closed on rules it cannot evaluate', () => {
      for (const condition of ['{not json', {}, { amountGreaterThan: 50 }, { actionNamePattern: '(' }]) {
        const p = policy({ rules: [{ condition, action: 'block' }] });
        expect(evaluatePolicies([p], toolCall('ls')).classification).toBe('blocked');
      }
    });
  });

  it('is not affected by words in the policy name', () => {
    const p = policy({ name: 'Nothing is blocked or exceeded', restrictedActions: '["refund"]' });
    expect(evaluatePolicies([p], toolCall('refund')).classification).toBe('requires_approval');
  });

  describe('domains', () => {
    const blockX = policy({ blockedDomains: '["x.com"]' });

    it('blocks the domain and its subdomains', () => {
      for (const url of ['https://x.com/a', 'https://api.x.com', 'HTTPS://X.COM.', 'x.com']) {
        expect(evaluatePolicies([blockX], toolCall('fetch', { url })).classification, url).toBe('blocked');
      }
    });

    it('does not block unrelated domains that share a suffix', () => {
      for (const url of ['https://dropbox.com', 'https://x.com.evil.org.example', 'https://notx.com']) {
        expect(evaluatePolicies([blockX], toolCall('fetch', { url })).classification, url).toBe('safe');
      }
    });

    it('sees through percent-encoding, nesting and URL userinfo', () => {
      const inputs = [
        { url: 'https://x%2Ecom/path' },
        { url: 'https%253A%252F%252Fx.com' },
        { nested: { list: ['ok', { target: 'https://x.com' }] } },
        { url: 'https://user@x.com/' },
        { to: 'someone@x.com' },
      ];
      for (const input of inputs) {
        expect(evaluatePolicies([blockX], toolCall('fetch', input)).classification, JSON.stringify(input)).toBe('blocked');
      }
    });

    it('accepts wildcard and URL forms in domain lists', () => {
      const p = policy({ blockedDomains: '["*.evil.org", "https://bad.net/login"]' });
      expect(evaluatePolicies([p], toolCall('fetch', { url: 'https://a.evil.org' })).classification).toBe('blocked');
      expect(evaluatePolicies([p], toolCall('fetch', { url: 'http://bad.net' })).classification).toBe('blocked');
    });

    it('enforces allowed domains for URLs', () => {
      const p = policy({ allowedDomains: '["example.com"]' });
      expect(evaluatePolicies([p], toolCall('fetch', { url: 'https://docs.example.com' })).classification).toBe('safe');
      expect(evaluatePolicies([p], toolCall('fetch', { url: 'https://example.org' })).classification).toBe('blocked');
      // Bare names such as file names are not treated as destinations.
      expect(evaluatePolicies([p], toolCall('read_file', { path: 'report.pdf' })).classification).toBe('safe');
    });
  });

  describe('allowed tools', () => {
    const p = policy({ allowedTools: '["read_balance"]' });

    it('blocks tool calls outside the allow-list', () => {
      expect(evaluatePolicies([p], toolCall('read_balance')).classification).toBe('safe');
      expect(evaluatePolicies([p], toolCall('wire_transfer')).classification).toBe('blocked');
      expect(evaluatePolicies([p], { actionType: 'tool_call' }).classification).toBe('blocked');
    });

    it('does not restrict reasoning or observation steps', () => {
      expect(evaluatePolicies([p], { actionType: 'reasoning', actionName: 'think' }).classification).toBe('safe');
    });

    it('treats an empty list or "*" as unrestricted', () => {
      for (const allowedTools of ['[]', '["*"]']) {
        expect(evaluatePolicies([policy({ allowedTools })], toolCall('anything')).classification).toBe('safe');
      }
    });
  });

  it('allows exactly maxStepsPerRun steps', () => {
    const p = policy({ maxStepsPerRun: 2 });
    expect(evaluatePolicies([p], toolCall('ls', {}, 2)).classification).toBe('safe');
    expect(evaluatePolicies([p], toolCall('ls', {}, 3)).classification).toBe('blocked');
  });

  it('flags restricted actions for approval', () => {
    const decision = evaluatePolicies([policy({ restrictedActions: '["issue_refund"]' })], toolCall('issue_refund'));
    expect(decision).toMatchObject({ allowed: false, classification: 'requires_approval', requiresApproval: true });
  });

  it('prefers blocking over approval when both apply', () => {
    const p = policy({ blockedTools: '["issue_refund"]', restrictedActions: '["issue_refund"]' });
    expect(evaluatePolicies([p], toolCall('issue_refund')).classification).toBe('blocked');
  });

  it('fails closed when a policy list is malformed', () => {
    for (const blockedTools of ['{oops', '"rm_rf"', '[1, 2]']) {
      const decision = evaluatePolicies([policy({ blockedTools })], toolCall('ls'));
      expect(decision.classification, blockedTools).toBe('blocked');
      expect(decision.reason).toContain('misconfigured');
    }
  });
});

describe('extractHosts', () => {
  it('separates URL hosts from bare names', () => {
    const hosts = extractHosts({ a: 'see https://Sub.Example.com/x and mail bob@corp.io', b: 'report.pdf' });
    expect([...hosts.fromUrls]).toEqual(['sub.example.com']);
    expect(hosts.all).toEqual(new Set(['sub.example.com', 'corp.io', 'report.pdf']));
  });
});
