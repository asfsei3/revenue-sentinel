import type { AgentStepTrace, PaymentEvent, SignalOutput } from '../types';

const AUTH_RATE_DROP_THRESHOLD = 0.1; // 10pp drop from baseline is anomalous
const LATENCY_ANOMALY_MS = 1500;
const STATE_DRIFT_COUNT_THRESHOLD = 2; // 2+ mismatched events in the window is anomalous

function mode(values: string[]): string | null {
  if (values.length === 0) return null;
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

export function runSignalAgent(events: PaymentEvent[], baselineAuthRate: number): { output: SignalOutput; step: AgentStepTrace } {
  const startedAt = new Date().toISOString();

  const total = events.length;
  const declined = events.filter((e) => e.status === 'declined');
  const authRate = total > 0 ? (total - declined.length) / total : 1;
  const delta = baselineAuthRate - authRate;
  const errorCodes = declined.map((e) => e.errorCode).filter((c): c is string => Boolean(c));
  const dominantErrorCode = mode(errorCodes);
  const delays = events.map((e) => e.webhookDelayMs);
  const avgWebhookDelayMs = delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : 0;
  const maxWebhookDelayMs = delays.length ? Math.max(...delays) : 0;

  const stateDriftCount = events.filter((e) => e.reconciledState && e.reconciledState !== e.status).length;

  const authAnomaly = delta >= AUTH_RATE_DROP_THRESHOLD;
  const latencyAnomaly = avgWebhookDelayMs >= LATENCY_ANOMALY_MS;
  const stateDriftDetected = stateDriftCount >= STATE_DRIFT_COUNT_THRESHOLD;
  const anomalyDetected = authAnomaly || latencyAnomaly || stateDriftDetected;

  let severity: SignalOutput['severity'] = 'LOW';
  if (anomalyDetected) {
    severity = authRate < 0.7 || avgWebhookDelayMs >= 2500 || stateDriftCount >= 3 ? 'HIGH' : 'MEDIUM';
  }

  const output: SignalOutput = {
    authRate,
    baseline: baselineAuthRate,
    delta,
    declinedCount: declined.length,
    totalCount: total,
    dominantErrorCode,
    avgWebhookDelayMs,
    maxWebhookDelayMs,
    stateDriftCount,
    stateDriftDetected,
    anomalyDetected,
    severity,
  };

  const evidence: string[] = [
    `${declined.length}/${total} events declined in the observed window`,
    `Authorization rate ${(authRate * 100).toFixed(1)}% vs ${(baselineAuthRate * 100).toFixed(1)}% baseline (${delta >= 0 ? '-' : '+'}${Math.abs(delta * 100).toFixed(1)}pp)`,
  ];
  if (dominantErrorCode) evidence.push(`Declines concentrated on error code ${dominantErrorCode}`);
  evidence.push(`Webhook delay avg ${avgWebhookDelayMs}ms, max ${maxWebhookDelayMs}ms`);
  if (stateDriftCount > 0) {
    evidence.push(`${stateDriftCount}/${total} events have a webhook-vs-internal-ledger state mismatch`);
  }

  const finishedAt = new Date().toISOString();
  const step: AgentStepTrace = {
    agent: 'signal',
    label: 'Signal Agent',
    startedAt,
    finishedAt,
    summary: anomalyDetected
      ? `Anomaly detected — severity ${severity}.`
      : 'No anomaly beyond normal variance detected.',
    evidence,
    confidence: total >= 6 ? 0.9 : 0.6,
    reasoningMode: 'mock',
    data: output as unknown as Record<string, unknown>,
  };

  return { output, step };
}
