import type { AgentStepTrace, AuditEvent, IncidentTrace } from '../types';
import { logger } from '../logger';

let auditCounter = 0;
function nextAuditId(): string {
  auditCounter += 1;
  return `audit-${Date.now()}-${auditCounter}`;
}

export function makeAuditEvent(incidentId: string, actor: AuditEvent['actor'], type: string, detail: string): AuditEvent {
  return { id: nextAuditId(), incidentId, timestamp: new Date().toISOString(), actor, type, detail };
}

/**
 * Assembles the final decision trail and writes a single structured log
 * line per completed step (Cloud Logging ingests JSON stdout lines
 * automatically on Cloud Run — see docs/DEPLOY.md).
 */
export function runObservabilityAgent(
  incidentId: string,
  priorSteps: AgentStepTrace[],
): { step: AgentStepTrace; auditEvents: AuditEvent[] } {
  const startedAt = new Date().toISOString();

  const auditEvents: AuditEvent[] = priorSteps.map((s) =>
    makeAuditEvent(incidentId, 'system', `${s.agent}.completed`, s.summary),
  );

  for (const s of priorSteps) {
    logger.info('agent_step_completed', {
      incidentId,
      agent: s.agent,
      confidence: s.confidence,
      reasoningMode: s.reasoningMode,
      summary: s.summary,
    });
  }

  const finishedAt = new Date().toISOString();
  const step: AgentStepTrace = {
    agent: 'observability',
    label: 'Observability Agent',
    startedAt,
    finishedAt,
    summary: `Decision trail recorded: ${priorSteps.length} agent steps captured with evidence, confidence, and timestamps.`,
    evidence: priorSteps.map((s) => `${s.label}: confidence ${(s.confidence * 100).toFixed(0)}% (${s.reasoningMode})`),
    confidence: 1,
    reasoningMode: 'mock',
  };

  return { step, auditEvents };
}

export function summarizeIncidentForLog(trace: Pick<IncidentTrace, 'id' | 'scenarioId' | 'status' | 'governance'>) {
  logger.info('incident_finalized', {
    incidentId: trace.id,
    scenarioId: trace.scenarioId,
    status: trace.status,
    governanceDecision: trace.governance.decision,
    securityFindingCount: trace.governance.securityFindings.length,
  });
}
