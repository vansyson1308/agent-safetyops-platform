// ============================================================
// Shared TypeScript types for Agent SafetyOps Platform
// These mirror the Prisma schema and are used across frontend & backend
// ============================================================

// --- Enums ---

export type UserRole = 'owner' | 'admin' | 'analyst' | 'approver' | 'viewer';
export type AgentProvider = 'Gemini' | 'OpenAI' | 'Anthropic' | 'Custom';
export type TrustLevel = 'low' | 'medium' | 'high';
export type AgentStatus = 'active' | 'inactive' | 'archived';
export type PolicyScope = 'global' | 'agent';
export type PolicyRuleAction = 'allow' | 'block' | 'require_approval';
export type RunStatus = 'running' | 'completed' | 'failed' | 'paused' | 'blocked';
export type StepActionType = 'tool_call' | 'reasoning' | 'observation';
export type StepClassification = 'safe' | 'warning' | 'blocked' | 'requires_approval';
export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'modified';
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type BrowserSessionStatus = 'active' | 'paused' | 'blocked' | 'completed' | 'failed';
export type BrowserActionType = 'navigate' | 'click' | 'type' | 'extract_text' | 'screenshot';
export type ArtifactType = 'screenshot' | 'extracted_text' | 'downloaded_file';

// --- Core Models ---

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface Agent {
  id: string;
  name: string;
  description: string | null;
  provider: AgentProvider;
  capabilities: string; // JSON array
  trustLevel: TrustLevel;
  maxTokenBudget: number | null;
  actionBudget: number | null;
  approvalMode: boolean;
  status: AgentStatus;
  createdById: string;
  createdBy?: Pick<User, 'name' | 'email'>;
  createdAt: string;
  updatedAt: string;
  runs?: Run[];
  policies?: Policy[];
}

export interface Policy {
  id: string;
  name: string;
  description: string | null;
  scope: PolicyScope;
  allowedTools: string; // JSON array
  blockedTools: string; // JSON array
  blockedDomains: string; // JSON array
  allowedDomains: string; // JSON array
  restrictedActions: string; // JSON array
  maxSpend: number | null;
  maxStepsPerRun: number | null;
  severityThreshold: number;
  agentId: string | null;
  agent?: Agent | null;
  createdById: string;
  createdBy?: Pick<User, 'name' | 'email'>;
  createdAt: string;
  updatedAt: string;
  rules?: PolicyRule[];
}

export interface PolicyRule {
  id: string;
  policyId: string;
  condition: string; // JSON
  action: PolicyRuleAction;
  severity: number;
  createdAt: string;
  updatedAt: string;
}

export interface Run {
  id: string;
  task: string;
  status: RunStatus;
  riskScore: number | null;
  confidence: number | null;
  summary: string | null;
  agentId: string;
  agent?: Agent;
  createdById: string;
  createdBy?: Pick<User, 'name' | 'email'>;
  createdAt: string;
  updatedAt: string;
  steps?: RunStep[];
  approvals?: ApprovalRequest[];
  incidents?: IncidentReport[];
}

export interface RunStep {
  id: string;
  runId: string;
  sequence: number;
  actionType: StepActionType;
  actionName: string | null;
  actionInput: string | null; // JSON
  actionOutput: string | null; // JSON
  classification: StepClassification;
  riskScore: number | null;
  policyViolations: string | null; // JSON array
  createdAt: string;
}

// Targets a run step (runId) or a browser action (sessionId).
export interface ApprovalRequest {
  id: string;
  runId: string | null;
  run?: Pick<Run, 'task'> & { agent?: Pick<Agent, 'name'> } | null;
  stepId: string | null;
  sessionId: string | null;
  session?: Pick<BrowserSession, 'url'> & { agent?: Pick<Agent, 'name'> | null } | null;
  browserActionId: string | null;
  status: ApprovalStatus;
  reason: string;
  proposedAction: string; // JSON
  approverId: string | null;
  approver?: User | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEvent {
  id: string;
  eventType: string;
  resourceType: string;
  resourceId: string;
  details: string; // JSON
  actorId: string;
  actor?: User;
  createdAt: string;
}

export interface IncidentReport {
  id: string;
  runId: string;
  run?: Run;
  title: string;
  summary: string;
  severity: IncidentSeverity;
  remediation: string | null;
  reporterId: string;
  reporter?: User;
  createdAt: string;
  updatedAt: string;
}

export interface BrowserSession {
  id: string;
  url: string;
  status: BrowserSessionStatus;
  riskScore: number | null;
  summary: string | null;
  agentId: string | null;
  agent?: Agent | null;
  createdById: string;
  createdBy?: User;
  createdAt: string;
  updatedAt: string;
  actions?: BrowserAction[];
  artifacts?: BrowserArtifact[];
}

export interface BrowserAction {
  id: string;
  sessionId: string;
  sequence: number;
  actionType: BrowserActionType;
  target: string | null;
  value: string | null;
  classification: StepClassification;
  riskScore: number | null;
  policyViolations: string | null; // JSON array
  explanation: string | null;
  createdAt: string;
}

export interface BrowserArtifact {
  id: string;
  sessionId: string;
  artifactType: ArtifactType;
  metadata: string; // JSON
  storagePath: string | null;
  createdAt: string;
}

// --- API Key (new model for SDK auth) ---

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  agentId: string;
  agent?: Pick<Agent, 'name'>;
  createdBy?: Pick<User, 'name' | 'email'>;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

// --- Webhook (new model for event dispatch) ---

export interface Webhook {
  id: string;
  url: string;
  events: string; // JSON array of event types
  secret: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// --- API Response Types ---

export interface DashboardStats {
  totalRuns: number;
  blockedRuns: number;
  approvalRequiredRuns: number;
  agentsCount: number;
  recentIncidents: IncidentReport[];
}

export interface RiskAnalysis {
  riskScore: number;
  confidence: number;
  reasons: string[];
  violatedPolicies: string[];
  remediation: string;
}

export interface BrowserActionRiskAssessment {
  classification: 'safe' | 'warning' | 'blocked';
  riskScore: number;
  explanation: string;
  policyViolations: string[];
}

export interface PolicyDecision {
  allowed: boolean;
  classification: StepClassification;
  riskScore: number;
  violations: string[];
  requiresApproval: boolean;
  reason: string;
}

export interface ApiError {
  error: string;
  details?: unknown;
}
