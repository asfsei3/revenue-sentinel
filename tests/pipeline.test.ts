import { describe, expect, it } from 'vitest';
import { investigateScenario, ScenarioNotFoundError } from '../lib/pipeline';

describe('investigateScenario (mock mode, end to end)', () => {
  it('classifies the PSP-A decline spike as APPROVAL', async () => {
    const trace = await investigateScenario('psp-a-decline-spike', 'mock');
    expect(trace.governance.decision).toBe('APPROVAL');
    expect(trace.status).toBe('pending_approval');
    expect(trace.steps).toHaveLength(6);
  });

  it('classifies payment/webhook state drift as its own incident type, not a decline anomaly', async () => {
    const trace = await investigateScenario('payment-state-drift', 'mock');
    expect(trace.signal.stateDriftDetected).toBe(true);
    expect(trace.diagnosis.cause).toMatch(/state drift|synchronization/i);
    expect(trace.recovery.actionType).toBe('open_psp_incident');
    expect(trace.governance.decision).toBe('AUTO');
  });

  it('classifies the webhook latency spike as AUTO (no fund-affecting action needed)', async () => {
    const trace = await investigateScenario('webhook-latency-spike', 'mock');
    expect(trace.governance.decision).toBe('AUTO');
    expect(trace.status).toBe('auto_executed');
  });

  it('classifies the suspected-fraud storm for escalation, not auto-retry', async () => {
    const trace = await investigateScenario('psp-b-fraud-block-storm', 'mock');
    expect(trace.recovery.actionType).toBe('escalate_to_psp_risk_team');
    expect(trace.revenueImpact.recoverableFractionAssumption).toBe(0);
  });

  it('blocks the prompt-injection scenario and records the security finding in the audit trail', async () => {
    const trace = await investigateScenario('prompt-injection-attempt', 'mock');
    expect(trace.governance.decision).toBe('BLOCK');
    expect(trace.status).toBe('blocked');
    expect(trace.governance.securityFindings.length).toBeGreaterThan(0);
    const injectionAudited = trace.auditLog.some((a) => a.detail.includes('BLOCKED'));
    expect(injectionAudited).toBe(true);
  });

  it('throws ScenarioNotFoundError for an unknown scenario id', async () => {
    await expect(investigateScenario('does-not-exist', 'mock')).rejects.toBeInstanceOf(ScenarioNotFoundError);
  });
});
