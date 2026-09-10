import type { IncidentTrace } from './types';
import { getScenario } from './scenarios';
import { runSignalAgent } from './agents/signal';
import { runDiagnosisAgent } from './agents/diagnosis';
import { runRevenueImpactAgent } from './agents/revenueImpact';
import { runRecoveryAgent } from './agents/recovery';
import { runGovernanceAgent } from './agents/governance';
import { makeAuditEvent, runObservabilityAgent, summarizeIncidentForLog } from './agents/observability';
import { saveIncident } from './store';
import { resolveReasoningMode } from './gemini/client';

let incidentCounter = 0;
function nextIncidentId(): string {
  incidentCounter += 1;
  return `inc-${Date.now()}-${incidentCounter}`;
}

export class ScenarioNotFoundError extends Error {}

/**
 * Runs the full six-agent pipeline (Signal -> Diagnosis -> Revenue Impact ->
 * Recovery -> Governance -> Observability) for a scenario and returns the
 * complete incident trace. Deterministic in mock mode; individual steps may
 * use Gemini when configured (see lib/gemini/client.ts).
 */
export async function investigateScenario(scenarioId: string, requestedMode?: string): Promise<IncidentTrace> {
  const scenario = getScenario(scenarioId);
  if (!scenario) throw new ScenarioNotFoundError(`Unknown scenario: ${scenarioId}`);

  const id = nextIncidentId();
  const createdAt = new Date().toISOString();

  const { output: signal, step: signalStep } = runSignalAgent(scenario.events, scenario.baselineAuthRate);
  const { output: diagnosis, step: diagnosisStep } = await runDiagnosisAgent(scenario.events, signal, requestedMode);
  const { output: revenueImpact, step: revenueImpactStep } = runRevenueImpactAgent(scenario.events, signal);
  const { output: recovery, step: recoveryStep } = await runRecoveryAgent(signal, diagnosis, revenueImpact, requestedMode);
  const { output: governance, step: governanceStep } = runGovernanceAgent(scenario.events, recovery);

  const stepsSoFar = [signalStep, diagnosisStep, revenueImpactStep, recoveryStep, governanceStep];
  const { step: observabilityStep, auditEvents } = runObservabilityAgent(id, stepsSoFar);

  const status: IncidentTrace['status'] =
    governance.decision === 'AUTO' ? 'auto_executed' : governance.decision === 'BLOCK' ? 'blocked' : 'pending_approval';

  const auditLog = [
    makeAuditEvent(id, 'system', 'incident.created', `Scenario "${scenario.name}" investigated.`),
    ...auditEvents,
    makeAuditEvent(id, 'system', 'governance.decision', `${governance.decision}: ${governance.rationale}`),
  ];

  const trace: IncidentTrace = {
    id,
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    createdAt,
    mode: resolveReasoningMode(requestedMode),
    steps: [...stepsSoFar, observabilityStep],
    signal,
    diagnosis,
    revenueImpact,
    recovery,
    governance,
    status,
    auditLog,
  };

  saveIncident(trace);
  summarizeIncidentForLog(trace);
  return trace;
}
