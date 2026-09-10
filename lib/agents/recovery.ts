import type { AgentStepTrace, DiagnosisOutput, RecoveryPlan, RevenueImpactOutput, SignalOutput } from '../types';
import { callGemini, resolveReasoningMode } from '../gemini/client';

// The action TYPE, required approvals, and effort are always decided by this
// deterministic rule table — never by the LLM. Governance's policy table
// (lib/agents/governance.ts) keys off actionType, so letting a model choose
// it freely would be a safety hole (a model could be talked into proposing
// a "safer-sounding" action type for a risky situation). Gemini, when
// enabled, is only ever asked to phrase the human-readable description of
// an already-decided action — see callGemini() below.
function decideAction(signal: SignalOutput): Pick<RecoveryPlan, 'actionType' | 'requiredApprovals' | 'estimatedEffort'> & { ruleDescription: string } {
  if (!signal.anomalyDetected) {
    return {
      actionType: 'notify_ops',
      requiredApprovals: [],
      estimatedEffort: 'LOW',
      ruleDescription: 'No action required. Continue monitoring.',
    };
  }
  if (signal.dominantErrorCode === '59') {
    return {
      actionType: 'escalate_to_psp_risk_team',
      requiredApprovals: ['payments_ops_lead'],
      estimatedEffort: 'MEDIUM',
      ruleDescription:
        'Escalate the decline-code-59 concentration to the PSP risk/fraud team for manual review. Do not auto-retry suspected-fraud declines.',
    };
  }
  if (signal.stateDriftDetected) {
    return {
      actionType: 'open_psp_incident',
      requiredApprovals: ['payments_ops_lead'],
      estimatedEffort: 'MEDIUM',
      ruleDescription:
        'Open a reconciliation incident: pause automated reliance on the webhook-reported status for the affected PSP and reconcile against the PSP source-of-truth API before any customer-facing or billing action.',
    };
  }
  if (signal.avgWebhookDelayMs >= 1500 && signal.authRate >= signal.baseline - 0.05) {
    return {
      actionType: 'open_psp_incident',
      requiredApprovals: [],
      estimatedEffort: 'LOW',
      ruleDescription: 'Open a delivery-pipeline incident with the PSP/webhook provider; no traffic or retry change needed.',
    };
  }
  return {
    actionType: 'traffic_shift',
    requiredApprovals: ['payments_ops_lead', 'engineering_on_call'],
    estimatedEffort: 'HIGH',
    ruleDescription:
      'Open a PSP incident and, pending human approval, shift eligible traffic to the fallback route while retrying recoverable soft declines.',
  };
}

export async function runRecoveryAgent(
  signal: SignalOutput,
  diagnosis: DiagnosisOutput,
  revenueImpact: RevenueImpactOutput,
  requestedMode?: string,
): Promise<{ output: RecoveryPlan; step: AgentStepTrace }> {
  const startedAt = new Date().toISOString();
  const mode = resolveReasoningMode(requestedMode);
  const decided = decideAction(signal);

  const { text: description, mode: usedMode } = await callGemini(
    {
      agent: 'recovery',
      systemInstruction:
        'You are a payments recovery-planning assistant. The action TYPE has already been decided by a fixed policy ' +
        'and is not yours to change. Your only job is to write one or two clear operational sentences describing how ' +
        'to carry out the given action type, using the diagnosis and estimated revenue impact as context. ' +
        'Never suggest refunds, transfers, or any action other than the given action type. Never mention approving, ' +
        'executing, or bypassing anything — you are drafting an operational description for a human to review.',
      prompt:
        `Decided action type: ${decided.actionType}. ` +
        `Diagnosis: ${diagnosis.cause} ` +
        `Estimated recoverable revenue this window: ¥${revenueImpact.estimatedRecoverableAmount.toLocaleString()} ` +
        `(monthly run-rate estimate ¥${revenueImpact.estimatedMonthlyRunRateImpact.toLocaleString()}). ` +
        `Default operational description to refine: ${decided.ruleDescription}`,
    },
    () => decided.ruleDescription,
  );

  const output: RecoveryPlan = {
    actionType: decided.actionType,
    description,
    requiredApprovals: decided.requiredApprovals,
    estimatedEffort: decided.estimatedEffort,
  };

  const finishedAt = new Date().toISOString();
  const step: AgentStepTrace = {
    agent: 'recovery',
    label: 'Recovery Agent',
    startedAt,
    finishedAt,
    summary: output.description,
    evidence: [
      `Proposed action type: ${output.actionType} (policy-decided, not model-chosen)`,
      `Required approvals: ${output.requiredApprovals.length ? output.requiredApprovals.join(', ') : 'none'}`,
      `Based on Diagnosis Agent: ${diagnosis.cause}`,
      `Based on Revenue Impact Agent: ¥${revenueImpact.estimatedRecoverableAmount.toLocaleString()} estimated recoverable this window`,
    ],
    confidence: signal.anomalyDetected ? 0.78 : 0.6,
    reasoningMode: usedMode,
    data: output as unknown as Record<string, unknown>,
  };

  return { output, step };
}
