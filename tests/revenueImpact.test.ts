import { describe, expect, it } from 'vitest';
import { runRevenueImpactAgent } from '../lib/agents/revenueImpact';
import { runSignalAgent } from '../lib/agents/signal';
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

describe('runRevenueImpactAgent', () => {
  it('estimates recoverable revenue as a fraction of declined amount', () => {
    const events = [evt({ status: 'declined', errorCode: '05', amount: 10000 })];
    const { output: signal } = runSignalAgent(events, 0.92);
    const { output } = runRevenueImpactAgent(events, signal);
    expect(output.observedDeclinedAmount).toBe(10000);
    expect(output.recoverableFractionAssumption).toBeGreaterThan(0);
    expect(output.estimatedRecoverableAmount).toBe(Math.round(10000 * output.recoverableFractionAssumption));
    expect(output.note).toMatch(/参考値/);
  });

  it('excludes suspected-fraud (code 59) declines from the recoverable estimate', () => {
    const events = [
      evt({ status: 'declined', errorCode: '59', amount: 50000 }),
      evt({ status: 'declined', errorCode: '59', amount: 40000 }),
    ];
    const { output: signal } = runSignalAgent(events, 0.9);
    const { output } = runRevenueImpactAgent(events, signal);
    expect(output.recoverableFractionAssumption).toBe(0);
    expect(output.estimatedRecoverableAmount).toBe(0);
    expect(output.note).toMatch(/fraud/);
  });

  it('reports zero impact when nothing declined', () => {
    const events = [evt({}), evt({})];
    const { output: signal } = runSignalAgent(events, 0.92);
    const { output } = runRevenueImpactAgent(events, signal);
    expect(output.observedDeclinedAmount).toBe(0);
    expect(output.estimatedRecoverableAmount).toBe(0);
  });
});
