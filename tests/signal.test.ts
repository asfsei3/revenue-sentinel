import { describe, expect, it } from 'vitest';
import { runSignalAgent } from '../lib/agents/signal';
import type { PaymentEvent } from '../lib/types';

function evt(partial: Partial<PaymentEvent>): PaymentEvent {
  return {
    id: 'e',
    timestamp: '2026-01-01T00:00:00Z',
    psp: 'PSP-A',
    status: 'approved',
    amount: 1000,
    webhookDelayMs: 300,
    ...partial,
  };
}

describe('runSignalAgent', () => {
  it('reports no anomaly when authorization rate matches baseline', () => {
    const events = [evt({}), evt({}), evt({ status: 'declined', errorCode: '51' })];
    const { output } = runSignalAgent(events, 0.6);
    expect(output.anomalyDetected).toBe(false);
    expect(output.severity).toBe('LOW');
  });

  it('detects an anomaly on a large auth-rate drop', () => {
    const events = [
      evt({}),
      evt({ status: 'declined', errorCode: '05' }),
      evt({ status: 'declined', errorCode: '05' }),
      evt({ status: 'declined', errorCode: '05' }),
    ];
    const { output } = runSignalAgent(events, 0.92);
    expect(output.anomalyDetected).toBe(true);
    expect(output.dominantErrorCode).toBe('05');
    expect(output.severity).toBe('HIGH');
  });

  it('detects a latency-only anomaly even with normal authorization rate', () => {
    const events = [evt({ webhookDelayMs: 3000 }), evt({ webhookDelayMs: 2800 }), evt({ webhookDelayMs: 3200 })];
    const { output } = runSignalAgent(events, 0.92);
    expect(output.anomalyDetected).toBe(true);
    expect(output.avgWebhookDelayMs).toBeGreaterThanOrEqual(1500);
  });

  it('detects payment/webhook state drift even when auth rate and latency are normal', () => {
    const events = [
      evt({ status: 'approved', reconciledState: 'declined' }),
      evt({ status: 'approved', reconciledState: 'declined' }),
      evt({ status: 'approved', reconciledState: 'approved' }),
    ];
    const { output } = runSignalAgent(events, 0.92);
    expect(output.stateDriftDetected).toBe(true);
    expect(output.stateDriftCount).toBe(2);
    expect(output.anomalyDetected).toBe(true);
  });

  it('does not flag state drift for a single mismatched event (below threshold)', () => {
    const events = [
      evt({ status: 'approved', reconciledState: 'declined' }),
      evt({ status: 'approved', reconciledState: 'approved' }),
      evt({ status: 'approved', reconciledState: 'approved' }),
    ];
    const { output } = runSignalAgent(events, 0.92);
    expect(output.stateDriftDetected).toBe(false);
  });
});
