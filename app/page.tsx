'use client';
import { useEffect, useState } from 'react';
import type { IncidentTrace } from '../lib/types';

interface ScenarioSummary {
  id: string;
  name: string;
  description: string;
  injectionAttempt: boolean;
  eventCount: number;
}

const AGENT_ORDER = ['signal', 'diagnosis', 'revenue_impact', 'recovery', 'governance', 'observability'] as const;

const AGENT_LABELS: Record<(typeof AGENT_ORDER)[number], string> = {
  signal: 'Signal Agent',
  diagnosis: 'Diagnosis Agent',
  revenue_impact: 'Revenue Impact Agent',
  recovery: 'Recovery Agent',
  governance: 'Governance Agent',
  observability: 'Observability Agent',
};

function badgeClass(decision: string) {
  if (decision === 'AUTO') return 'badge green';
  if (decision === 'APPROVAL') return 'badge amber';
  if (decision === 'BLOCK') return 'badge red';
  return 'badge blue';
}

export default function Home() {
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [geminiAvailable, setGeminiAvailable] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<string>('');
  const [mode, setMode] = useState<'mock' | 'gemini'>('mock');
  const [running, setRunning] = useState(false);
  const [incident, setIncident] = useState<IncidentTrace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actor, setActor] = useState('demo_operator');

  useEffect(() => {
    fetch('/api/scenarios')
      .then((r) => r.json())
      .then((data) => {
        setScenarios(data.scenarios || []);
        setGeminiAvailable(Boolean(data.geminiAvailable));
        if (data.scenarios?.[0]) setSelectedScenario(data.scenarios[0].id);
      })
      .catch(() => setError('Failed to load scenarios.'));
  }, []);

  async function runInvestigation() {
    if (!selectedScenario) return;
    setRunning(true);
    setError(null);
    setIncident(null);
    try {
      const res = await fetch('/api/investigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId: selectedScenario, mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Investigation failed');
      setIncident(data.incident);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Investigation failed');
    } finally {
      setRunning(false);
    }
  }

  async function decide(decision: 'approve' | 'reject') {
    if (!incident) return;
    try {
      const res = await fetch(`/api/incidents/${incident.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, actor }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Decision failed');
      setIncident(data.incident);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Decision failed');
    }
  }

  const stepsByAgent = new Map((incident?.steps || []).map((s) => [s.agent, s]));
  const activeScenario = scenarios.find((s) => s.id === selectedScenario);

  return (
    <main className="shell">
      <div className="top">
        <div className="brand">◈ Revenue Sentinel</div>
        <div className="pill">AGENTIC PAYMENT CONTROL TOWER</div>
      </div>

      <section className="hero">
        <div className="muted">Autonomous Revenue Recovery &amp; Incident Control</div>
        <h1>
          Turn payment failures into
          <br />
          managed revenue recovery.
        </h1>
        <p className="muted">Signal → Diagnosis → Revenue Impact → Recovery → Governance → Observability</p>
      </section>

      <div className="grid">
        <section className="card">
          <div className="muted">Choose a synthetic incident scenario</div>
          <select
            className="select"
            value={selectedScenario}
            onChange={(e) => {
              setSelectedScenario(e.target.value);
              setIncident(null);
              setError(null);
            }}
          >
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.injectionAttempt ? ' (security test)' : ''}
              </option>
            ))}
          </select>
          {activeScenario && <p className="small" style={{ marginTop: 10 }}>{activeScenario.description}</p>}

          <div className="row" style={{ borderBottom: 'none', marginTop: 6 }}>
            <span className="small">Reasoning mode</span>
            <div>
              <label className="small" style={{ marginRight: 12 }}>
                <input type="radio" checked={mode === 'mock'} onChange={() => setMode('mock')} /> Mock (deterministic)
              </label>
              <label className="small" title={geminiAvailable ? '' : 'Set GEMINI_API_KEY and AGENT_MODE=gemini to enable'}>
                <input
                  type="radio"
                  checked={mode === 'gemini'}
                  disabled={!geminiAvailable}
                  onChange={() => setMode('gemini')}
                />{' '}
                Gemini {geminiAvailable ? '' : '(not configured)'}
              </label>
            </div>
          </div>

          <button className="button" style={{ marginTop: 14 }} onClick={runInvestigation} disabled={running || !selectedScenario}>
            {running ? 'Agents working…' : 'Run incident investigation'}
          </button>
          {error && <p className="small" style={{ color: '#fda4af', marginTop: 10 }}>{error}</p>}

          {incident && (
            <div style={{ marginTop: 20 }}>
              <div className="row">
                <span>Authorization rate</span>
                <strong>
                  {(incident.signal.baseline * 100).toFixed(1)}% → {(incident.signal.authRate * 100).toFixed(1)}%
                </strong>
              </div>
              <div className="row">
                <span>Severity</span>
                <span className={badgeClass(incident.signal.severity === 'HIGH' ? 'BLOCK' : incident.signal.severity === 'MEDIUM' ? 'APPROVAL' : 'AUTO')}>
                  {incident.signal.severity}
                </span>
              </div>
              <div className="row">
                <span>Estimated recoverable revenue (window)</span>
                <strong>¥{incident.revenueImpact.estimatedRecoverableAmount.toLocaleString()}</strong>
              </div>
              <div className="row">
                <span>Estimated monthly run-rate impact</span>
                <strong>¥{incident.revenueImpact.estimatedMonthlyRunRateImpact.toLocaleString()}</strong>
              </div>
              <div className="row">
                <span>Governance decision</span>
                <span className={badgeClass(incident.governance.decision)}>{incident.governance.decision}</span>
              </div>
            </div>
          )}
        </section>

        <section className="card">
          <div className="muted">Agent trajectory</div>
          <div className="timeline" style={{ marginTop: 18 }}>
            {AGENT_ORDER.map((agent, i) => {
              const step = stepsByAgent.get(agent);
              return (
                <div className="event" key={agent}>
                  <b>{step?.label ?? AGENT_LABELS[agent]}</b>
                  {step ? (
                    <>
                      <span className="small">{step.summary}</span>
                      <div className="small" style={{ marginTop: 4 }}>
                        confidence {(step.confidence * 100).toFixed(0)}% · {step.reasoningMode} ·{' '}
                        {new Date(step.finishedAt).toLocaleTimeString()}
                      </div>
                    </>
                  ) : (
                    <span className="small">{running ? 'Waiting…' : 'Idle — run an investigation to populate this step.'}</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {incident && (
        <div className="grid">
          <section className="card">
            <div className="muted">Diagnosis &amp; evidence</div>
            <h2>{incident.diagnosis.cause}</h2>
            {stepsByAgent.get('diagnosis')?.evidence.map((e) => (
              <div className="row" key={e}>
                ✓ {e}
              </div>
            ))}
          </section>

          <section className="card">
            <div className="muted">Recommended action</div>
            <h2>{incident.recovery.description}</h2>
            <p className="small">
              Required approvals: {incident.recovery.requiredApprovals.length ? incident.recovery.requiredApprovals.join(', ') : 'none'}
            </p>
            <span className={badgeClass(incident.governance.decision)}>{incident.governance.decision}</span>
            <p className="small" style={{ marginTop: 10 }}>{incident.governance.rationale}</p>

            {incident.governance.securityFindings.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div className="small" style={{ color: '#fda4af', fontWeight: 700 }}>Security findings (neutralized, not executed):</div>
                {incident.governance.securityFindings.map((f, i) => (
                  <div className="small" key={i} style={{ color: '#fda4af' }}>
                    • {f.matchedPattern}: “{f.excerpt}”
                  </div>
                ))}
              </div>
            )}

            {incident.status === 'pending_approval' && (
              <div style={{ marginTop: 14 }}>
                <input
                  className="select"
                  style={{ marginBottom: 8 }}
                  value={actor}
                  onChange={(e) => setActor(e.target.value)}
                  placeholder="Approver name"
                />
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="button" onClick={() => decide('approve')}>
                    Approve
                  </button>
                  <button className="button secondary" onClick={() => decide('reject')}>
                    Reject
                  </button>
                </div>
              </div>
            )}
            {incident.status !== 'pending_approval' && (
              <p className="small" style={{ marginTop: 12 }}>
                Status: <strong>{incident.status}</strong>. No real payment operation is executed in this MVP.
              </p>
            )}
          </section>
        </div>
      )}

      {incident && (
        <section className="card" style={{ marginTop: 18 }}>
          <div className="muted">Audit trail (Observability Agent)</div>
          <div style={{ marginTop: 10 }}>
            {incident.auditLog.map((a) => (
              <div className="row" key={a.id}>
                <span className="small">
                  {new Date(a.timestamp).toLocaleTimeString()} · {a.actor} · {a.type}
                </span>
                <span className="small">{a.detail}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="small" style={{ marginTop: 28 }}>
        Synthetic data only · No PAN/CVC · No funds movement · Demo environment · Target stack: Cloud Run + Gemini API + Firestore/BigQuery + Cloud Logging
      </p>
    </main>
  );
}
