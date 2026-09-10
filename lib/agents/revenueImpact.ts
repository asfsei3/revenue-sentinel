import type { AgentStepTrace, PaymentEvent, RevenueImpactOutput, SignalOutput } from '../types';

// Fraction of declined amount assumed recoverable through legitimate retry /
// routing improvements. This is a reference assumption for the demo, not a
// measured figure — always surfaced to the user as an estimate.
const RECOVERABLE_FRACTION_ASSUMPTION = 0.35;
const OBSERVED_WINDOW_MINUTES = 8;
const MINUTES_PER_MONTH = 30 * 24 * 60;

export function runRevenueImpactAgent(
  events: PaymentEvent[],
  signal: SignalOutput,
): { output: RevenueImpactOutput; step: AgentStepTrace } {
  const startedAt = new Date().toISOString();

  const declined = events.filter((e) => e.status === 'declined');
  const observedDeclinedAmount = declined.reduce((sum, e) => sum + e.amount, 0);

  // Suspected-fraud declines (code 59) are not counted as recoverable —
  // retrying a fraud block is not a legitimate recovery action.
  const isFraudCode = signal.dominantErrorCode === '59';
  const recoverableFraction = isFraudCode ? 0 : RECOVERABLE_FRACTION_ASSUMPTION;
  const estimatedRecoverableAmount = Math.round(observedDeclinedAmount * recoverableFraction);
  const runRateMultiplier = MINUTES_PER_MONTH / OBSERVED_WINDOW_MINUTES;
  const estimatedMonthlyRunRateImpact = Math.round(estimatedRecoverableAmount * runRateMultiplier);

  const output: RevenueImpactOutput = {
    observedDeclinedAmount,
    estimatedRecoverableAmount,
    estimatedMonthlyRunRateImpact,
    recoverableFractionAssumption: recoverableFraction,
    note: isFraudCode
      ? '参考値: suspected-fraud declines are excluded from the recoverable estimate — they should not be retried automatically.'
      : `参考値: assumes ${Math.round(recoverableFraction * 100)}% of declined volume in this window is recoverable via legitimate retry/routing; extrapolated to a monthly run rate from an ${OBSERVED_WINDOW_MINUTES}-minute synthetic sample. This is an estimate, not a measured figure.`,
  };

  const finishedAt = new Date().toISOString();
  const step: AgentStepTrace = {
    agent: 'revenue_impact',
    label: 'Revenue Impact Agent',
    startedAt,
    finishedAt,
    summary: `Estimated recoverable revenue in this incident window: ¥${estimatedRecoverableAmount.toLocaleString()} (¥${estimatedMonthlyRunRateImpact.toLocaleString()} monthly run-rate estimate).`,
    evidence: [
      `¥${observedDeclinedAmount.toLocaleString()} declined across ${declined.length} events in the observed window`,
      output.note,
    ],
    confidence: declined.length >= 3 ? 0.75 : 0.5,
    reasoningMode: 'mock',
    data: output as unknown as Record<string, unknown>,
  };

  return { output, step };
}
