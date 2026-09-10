import { describe, expect, it } from 'vitest';
import { runRecoveryAgent } from '../lib/agents/recovery';
import { runSignalAgent } from '../lib/agents/signal';
import { runDiagnosisAgent } from '../lib/agents/diagnosis';
import type { PaymentEvent } from '../lib/types';

function evt(partial: Partial<PaymentEvent>): PaymentEvent {
  return {
    id: 'e',
    timestamp: '2026-01-01T00:00:00Z',
    psp: 'PSP-A',
    status: 'approved',
    amount: 10000,
    webhookDelayMs: 400,
    ...partial,
  };
}

describe('runRecoveryAgent', () => {
  it('recommends no action when no anomaly is present', async () => {
    const events = [evt({}), evt({})];
    const { output: signal } = runSignalAgent(events, 0.92);
    const { output: diagnosis } = await runDiagnosisAgent(events, signal, 'mock');
    const { output } = runRecoveryAgent(signal, diagnosis);
    expect(output.actionType).toBe('notify_ops');
    expect(output.requiredApprovals).toHaveLength(0);
  });

  it('recommends escalation (not retry) for suspected-fraud declines', async () => {
    const events = [
      evt({ status: 'declined', errorCode: '59', psp: 'PSP-B', amount: 40000 }),
      evt({ status: 'declined', errorCode: '59', psp: 'PSP-B', amount: 45000 }),
      evt({ status: 'declined', errorCode: '59', psp: 'PSP-B', amount: 38000 }),
    ];
    const { output: signal } = runSignalAgent(events, 0.9);
    const { output: diagnosis } = await runDiagnosisAgent(events, signal, 'mock');
    const { output } = runRecoveryAgent(signal, diagnosis);
    expect(output.actionType).toBe('escalate_to_psp_risk_team');
  });

  it('recommends a traffic shift for a concentrated non-fraud decline spike', async () => {
    const events = [
      evt({ status: 'declined', errorCode: '05', amount: 10000, webhookDelayMs: 800 }),
      evt({ status: 'declined', errorCode: '05', amount: 12000, webhookDelayMs: 850 }),
      evt({ status: 'declined', errorCode: '05', amount: 9000, webhookDelayMs: 900 }),
    ];
    const { output: signal } = runSignalAgent(events, 0.92);
    const { output: diagnosis } = await runDiagnosisAgent(events, signal, 'mock');
    const { output } = runRecoveryAgent(signal, diagnosis);
    expect(output.actionType).toBe('traffic_shift');
    expect(output.requiredApprovals.length).toBeGreaterThan(0);
  });

  it('recommends opening a PSP incident (no traffic change) for a pure latency anomaly', async () => {
    const events = [evt({ webhookDelayMs: 3000 }), evt({ webhookDelayMs: 2900 }), evt({ webhookDelayMs: 3100 })];
    const { output: signal } = runSignalAgent(events, 0.92);
    const { output: diagnosis } = await runDiagnosisAgent(events, signal, 'mock');
    const { output } = runRecoveryAgent(signal, diagnosis);
    expect(output.actionType).toBe('open_psp_incident');
    expect(output.requiredApprovals).toHaveLength(0);
  });
});
