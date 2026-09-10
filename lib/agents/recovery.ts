import type { AgentStepTrace, DiagnosisOutput, RecoveryPlan, SignalOutput } from '../types';

export function runRecoveryAgent(
  signal: SignalOutput,
  diagnosis: DiagnosisOutput,
): { output: RecoveryPlan; step: AgentStepTrace } {
  const startedAt = new Date().toISOString();

  let output: RecoveryPlan;

  if (!signal.anomalyDetected) {
    output = {
      actionType: 'notify_ops',
      description: 'No action required. Continue monitoring.',
      requiredApprovals: [],
      estimatedEffort: 'LOW',
    };
  } else if (signal.dominantErrorCode === '59') {
    output = {
      actionType: 'escalate_to_psp_risk_team',
      description:
        'Escalate the decline-code-59 concentration to the PSP risk/fraud team for manual review. Do not auto-retry suspected-fraud declines.',
      requiredApprovals: ['payments_ops_lead'],
      estimatedEffort: 'MEDIUM',
    };
  } else if (signal.avgWebhookDelayMs >= 1500 && signal.authRate >= signal.baseline - 0.05) {
    output = {
      actionType: 'open_psp_incident',
      description: 'Open a delivery-pipeline incident with the PSP/webhook provider; no traffic or retry change needed.',
      requiredApprovals: [],
      estimatedEffort: 'LOW',
    };
  } else {
    output = {
      actionType: 'traffic_shift',
      description:
        'Open a PSP incident and, pending human approval, shift eligible traffic to the fallback route while retrying recoverable soft declines.',
      requiredApprovals: ['payments_ops_lead', 'engineering_on_call'],
      estimatedEffort: 'HIGH',
    };
  }

  const finishedAt = new Date().toISOString();
  const step: AgentStepTrace = {
    agent: 'recovery',
    label: 'Recovery Agent',
    startedAt,
    finishedAt,
    summary: output.description,
    evidence: [
      `Proposed action type: ${output.actionType}`,
      `Required approvals: ${output.requiredApprovals.length ? output.requiredApprovals.join(', ') : 'none'}`,
      `Diagnosis basis: ${diagnosis.cause}`,
    ],
    confidence: signal.anomalyDetected ? 0.78 : 0.6,
    reasoningMode: 'mock',
    data: output as unknown as Record<string, unknown>,
  };

  return { output, step };
}
