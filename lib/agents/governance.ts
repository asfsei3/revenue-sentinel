import type {
  AgentStepTrace,
  GovernanceClass,
  GovernanceOutput,
  PaymentEvent,
  RecoveryPlan,
  SecurityFinding,
} from '../types';
import { detectInjection } from '../security';

// Action types that would move real funds are never allowed to execute in
// this system, under any governance classification — the MVP only ever
// *proposes* these; nothing in the codebase calls a real payment API.
const HARD_BLOCK_ACTIONS: RecoveryPlan['actionType'][] = ['refund', 'fund_transfer'];

// Baseline risk classification by action type, before security findings are
// factored in.
const BASE_CLASS_BY_ACTION: Record<RecoveryPlan['actionType'], GovernanceClass> = {
  notify_ops: 'AUTO',
  open_psp_incident: 'AUTO',
  retry_soft_decline: 'APPROVAL',
  traffic_shift: 'APPROVAL',
  escalate_to_psp_risk_team: 'AUTO',
  refund: 'BLOCK',
  fund_transfer: 'BLOCK',
};

function collectSecurityFindings(events: PaymentEvent[]): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  for (const e of events) {
    findings.push(...detectInjection(`event:${e.id}.customerNote`, e.customerNote));
  }
  return findings;
}

function escalate(base: GovernanceClass, hasSecurityFindings: boolean): GovernanceClass {
  if (hasSecurityFindings) return 'BLOCK';
  return base;
}

export function runGovernanceAgent(
  events: PaymentEvent[],
  recovery: RecoveryPlan,
): { output: GovernanceOutput; step: AgentStepTrace } {
  const startedAt = new Date().toISOString();

  const securityFindings = collectSecurityFindings(events);
  const policyRulesApplied: string[] = [];

  let decision: GovernanceClass;
  if (HARD_BLOCK_ACTIONS.includes(recovery.actionType)) {
    decision = 'BLOCK';
    policyRulesApplied.push('hard-block: fund-movement action types are never permitted to execute');
  } else {
    const base = BASE_CLASS_BY_ACTION[recovery.actionType];
    policyRulesApplied.push(`base classification for action type "${recovery.actionType}": ${base}`);
    decision = escalate(base, securityFindings.length > 0);
    if (securityFindings.length > 0) {
      policyRulesApplied.push('escalation: detected prompt-injection / control-bypass attempt forces BLOCK regardless of requested action');
    }
  }

  const rationale =
    securityFindings.length > 0
      ? `BLOCKED — ${securityFindings.length} prompt-injection/control-bypass attempt(s) detected in incident data. The embedded instructions were treated as untrusted data, not followed, and are recorded below. No human approval can override this classification through the automated pipeline; a security review is required.`
      : decision === 'AUTO'
        ? 'Low-risk, no-fund-movement action; auto-approved per policy.'
        : decision === 'APPROVAL'
          ? 'Action affects payment routing/retry behavior; requires explicit human approval before any (simulated) execution.'
          : 'Action would move funds directly; blocked by hard policy regardless of context.';

  const output: GovernanceOutput = { decision, rationale, policyRulesApplied, securityFindings };

  const finishedAt = new Date().toISOString();
  const step: AgentStepTrace = {
    agent: 'governance',
    label: 'Governance Agent',
    startedAt,
    finishedAt,
    summary: `Classification: ${decision}`,
    evidence: [
      ...policyRulesApplied,
      ...securityFindings.map((f) => `Security finding: ${f.matchedPattern} in ${f.source} — "${f.excerpt}"`),
    ],
    confidence: 0.95,
    reasoningMode: 'mock',
    data: output as unknown as Record<string, unknown>,
  };

  return { output, step };
}
