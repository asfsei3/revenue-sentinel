// Shared types for the Revenue Sentinel agent pipeline.
// All payment data in this project is synthetic. No PAN/CVC, no real PSP
// credentials, and no code path ever calls a real payment execution API.

export type PSP = 'PSP-A' | 'PSP-B' | 'PSP-C';

export type PaymentEventStatus = 'approved' | 'declined';

export interface PaymentEvent {
  id: string;
  timestamp: string; // ISO8601
  psp: PSP;
  status: PaymentEventStatus;
  errorCode?: string;
  amount: number; // JPY, synthetic
  webhookDelayMs: number;
  /**
   * Free-text field an attacker-controlled actor could influence in a real
   * system (e.g. a customer-supplied statement descriptor or webhook note).
   * Always treated as untrusted DATA — see lib/security.ts. Never treated
   * as an instruction to any agent or to Gemini.
   */
  customerNote?: string;
}

export interface ScenarioDefinition {
  id: string;
  name: string;
  description: string;
  /** Marks scenarios specifically designed to exercise prompt-injection defenses. */
  injectionAttempt?: boolean;
  baselineAuthRate: number;
  events: PaymentEvent[];
}

export type ReasoningMode = 'mock' | 'gemini';

export type GovernanceClass = 'AUTO' | 'APPROVAL' | 'BLOCK';

export interface SecurityFinding {
  source: string; // e.g. "event:p-2003.customerNote"
  matchedPattern: string;
  excerpt: string;
  action: 'sanitized' | 'blocked';
}

export interface AgentStepTrace {
  agent:
    | 'signal'
    | 'diagnosis'
    | 'revenue_impact'
    | 'recovery'
    | 'governance'
    | 'observability';
  label: string;
  startedAt: string;
  finishedAt: string;
  summary: string;
  evidence: string[];
  confidence: number; // 0..1
  reasoningMode: ReasoningMode;
  data?: Record<string, unknown>;
}

export interface SignalOutput {
  authRate: number;
  baseline: number;
  delta: number;
  declinedCount: number;
  totalCount: number;
  dominantErrorCode: string | null;
  avgWebhookDelayMs: number;
  maxWebhookDelayMs: number;
  anomalyDetected: boolean;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface DiagnosisOutput {
  cause: string;
  contributingFactors: string[];
}

export interface RevenueImpactOutput {
  observedDeclinedAmount: number;
  estimatedRecoverableAmount: number;
  estimatedMonthlyRunRateImpact: number;
  recoverableFractionAssumption: number;
  note: string; // must state this is an estimate / reference value
}

export type RecoveryActionType =
  | 'notify_ops'
  | 'open_psp_incident'
  | 'retry_soft_decline'
  | 'traffic_shift'
  | 'escalate_to_psp_risk_team'
  | 'refund'
  | 'fund_transfer';

export interface RecoveryPlan {
  actionType: RecoveryActionType;
  description: string;
  requiredApprovals: string[];
  estimatedEffort: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface GovernanceOutput {
  decision: GovernanceClass;
  rationale: string;
  policyRulesApplied: string[];
  securityFindings: SecurityFinding[];
}

export type IncidentStatus =
  | 'pending_approval'
  | 'auto_executed'
  | 'approved'
  | 'rejected'
  | 'blocked';

export interface AuditEvent {
  id: string;
  incidentId: string;
  timestamp: string;
  actor: 'system' | 'human';
  type: string;
  detail: string;
}

export interface IncidentTrace {
  id: string;
  scenarioId: string;
  scenarioName: string;
  createdAt: string;
  mode: ReasoningMode;
  steps: AgentStepTrace[];
  signal: SignalOutput;
  diagnosis: DiagnosisOutput;
  revenueImpact: RevenueImpactOutput;
  recovery: RecoveryPlan;
  governance: GovernanceOutput;
  status: IncidentStatus;
  auditLog: AuditEvent[];
}
