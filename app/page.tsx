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
  if (decision === 'APPROVAL') return 'badge green';
  if (decision === 'BLOCK') return 'badge red';
  return 'badge blue';
}

function severityBadgeClass(severity: string) {
  if (severity === 'HIGH') return 'badge red';
  if (severity === 'MEDIUM') return 'badge amber';
  return 'badge green';
}

// ---------------------------------------------------------------------------
// Display-only Japanese translation layer.
//
// The backend (lib/agents/*, lib/scenarios/*, lib/pipeline.ts, API routes) is
// completely untouched by this file and keeps generating English text/data,
// exactly as before. Everything below only recognizes the FIXED, deterministic
// sentence templates that mock-mode agents actually produce (enumerated by
// reading that source directly) and renders a natural Japanese equivalent for
// the screen. Numbers, PSP names, action-type identifiers, role names, and
// enum values (APPROVAL/BLOCK/AUTO, HIGH/MEDIUM/LOW, mock/gemini, etc.) are
// passed through unchanged -- only the surrounding English prose is replaced.
//
// If a string doesn't match any known template -- most notably, real
// free-form Gemini output when AGENT_MODE=gemini, which cannot be predicted
// or safely rewritten from the display layer -- it is rendered as-is in
// English. Translating live model output would require changing the Gemini
// prompt/logic itself, which is explicitly out of scope here.
// ---------------------------------------------------------------------------

const SCENARIO_DESCRIPTION_JA: Record<string, string> = {
  'psp-a-decline-spike':
    'PSP-Aの承認率が基準値92%からおよそ50%まで低下し、エラーコード05に集中。webhookの遅延も増加しており、決済代行会社またはカード発行会社側のルート障害に一致するパターンです。',
  'webhook-latency-spike':
    '承認率はほぼ基準値のままですが、すべてのイベントでwebhookの配信遅延が通常より大幅に増加しています。決済の承認自体ではなく、配信パイプライン側の問題です。',
  'psp-b-fraud-block-storm':
    '短時間にPSP-Bでエラーコード59（不正利用の疑い）が集中発生。自動での再試行は安全でないため、推奨アクションは再試行ではなくエスカレーションです。',
  'payment-state-drift':
    '承認率・webhook遅延ともに正常範囲内ですが、複数のPSP webhook通知が内部台帳と一致しません（例: webhookは"approved"なのに内部記録は"declined"のまま）。決済失敗ではなく、同期のずれによるインシデントです。',
  'prompt-injection-attempt':
    'PSP-Aシナリオと同じ承認異常ですが、1件のイベントのcustomer-noteフィールドに、Agentパイプラインへ返金の自動承認とログの無効化を試みる埋め込み指示が含まれています。GovernanceのPrompt Injection対策を検証するシナリオです。',
};
function translateScenarioDescription(id: string, fallback: string): string {
  return SCENARIO_DESCRIPTION_JA[id] ?? fallback;
}

// Scenario NAMES, keyed by the backend's exact English name string (the
// scenario id/enum/API payload are untouched -- this only swaps what's
// rendered for the title). "Prompt Injection" is kept in English per
// instruction, as a recognized technical term.
const SCENARIO_NAME_JA: Record<string, string> = {
  'PSP-A authorization rate drop': 'PSP-A 承認率低下',
  'Payment/webhook state drift (reconciliation gap)': '決済/webhookの状態不整合（突合ギャップ）',
  'PSP-A decline spike + embedded prompt injection': 'PSP-A 拒否急増（Prompt Injection混入）',
  'Webhook latency spike (no authorization impact)': 'Webhook遅延急増（承認への影響なし）',
  'PSP-B suspected-fraud decline storm': 'PSP-B 不正利用疑いの拒否多発',
};
function translateScenarioName(name: string): string {
  return SCENARIO_NAME_JA[name] ?? name;
}

function translateSignalSummary(text: string): string {
  let m = text.match(/^Anomaly detected — severity (\w+)\.$/);
  if (m) return `異常を検知 — 重大度 ${m[1]}。`;
  if (text === 'No anomaly beyond normal variance detected.') return '通常の変動範囲内であり、異常は検知されませんでした。';
  return text;
}

function translateSignalEvidence(text: string): string {
  let m = text.match(/^(\d+)\/(\d+) events declined in the observed window$/);
  if (m) return `観測期間中、${m[2]}件中${m[1]}件が拒否`;
  m = text.match(/^Authorization rate ([\d.]+)% vs ([\d.]+)% baseline \(([+-][\d.]+)pp\)$/);
  if (m) return `承認率 ${m[1]}%（基準値 ${m[2]}% に対して ${m[3]}pp）`;
  m = text.match(/^Declines concentrated on error code (\S+)$/);
  if (m) return `拒否がエラーコード${m[1]}に集中`;
  m = text.match(/^Webhook delay avg (\d+)ms, max (\d+)ms$/);
  if (m) return `webhook遅延 平均${m[1]}ms、最大${m[2]}ms`;
  m = text.match(/^(\d+)\/(\d+) events have a webhook-vs-internal-ledger state mismatch$/);
  if (m) return `${m[1]}/${m[2]}件でwebhookと内部台帳のステータスが不一致`;
  return text;
}

function translateCause(text: string): string {
  if (text === 'No systemic issue identified; metrics are within normal variance.') {
    return '重大な問題は見つからず、指標は通常の変動範囲内です。';
  }
  let m = text.match(
    /^Concentrated decline code 59 \(suspected fraud\) on (.+?) suggests an issuer or PSP risk-engine tightening, not a customer-side or technical problem\.$/,
  );
  if (m) {
    return `${m[1]}でエラーコード59（不正利用の疑い）が集中しており、カード発行会社または決済代行会社のリスクエンジンが厳格化した可能性が高く、顧客側や技術的な問題ではないと考えられます。`;
  }
  if (
    text ===
    'Payment/webhook state drift: the PSP webhook status and the internal payment record disagree for multiple transactions, indicating a synchronization gap between the webhook pipeline and internal ledger rather than a genuine authorization problem.'
  ) {
    return '決済とwebhookの状態にずれが発生：複数の取引でPSP webhookのステータスと内部の決済記録が一致しておらず、実際の承認上の問題ではなく、webhookパイプラインと内部台帳との間の同期のずれを示しています。';
  }
  m = text.match(
    /^Concentrated decline-code (\S+) spike on (.+?)(, with correlated webhook latency,)? suggests a PSP-side incident or issuer\/route degradation rather than isolated customer behavior\.$/,
  );
  if (m) {
    const [, code, psp, latency] = m;
    return `${psp}でエラーコード${code}の拒否が集中${latency ? '、webhook遅延の相関も見られ' : ''}、決済代行会社側の障害またはカード発行会社・ルートの劣化によるものと考えられ、個別の顧客側の問題ではないと推定されます。`;
  }
  if (
    text ===
    'Delivery-pipeline latency issue (webhook/notification path) rather than a payment-authorization issue — approvals are succeeding but confirmations are arriving late.'
  ) {
    return '決済の承認自体ではなく、配信パイプライン（webhook/通知経路）の遅延が原因です。承認自体は成功していますが、確認通知の到着が遅れています。';
  }
  m = text.match(/^Elevated decline rate on (.+?) without a single dominant error code; likely a mixed-cause incident requiring PSP-side confirmation\.$/);
  if (m) return `${m[1]}で拒否率が上昇していますが、単一の支配的なエラーコードは見られず、複合的な原因によるインシデントの可能性があり、決済代行会社側での確認が必要です。`;
  return text;
}

function translateFactor(text: string): string {
  const table: Record<string, string> = {
    'Decline code 59 indicates suspected-fraud blocks, not a technical failure':
      'エラーコード59は不正利用の疑いによるブロックを示しており、技術的な障害ではありません',
    'Retrying these transactions automatically would be unsafe': 'これらの取引を自動的に再試行することは安全ではありません',
    'Authorization/decline rate itself is near baseline — this is a synchronization gap, not a decline-rate incident':
      '承認率・拒否率自体は基準値に近く、これは拒否率のインシデントではなく同期のずれです',
    'Webhook latency is also elevated on failed events': '失敗したイベントではwebhook遅延も増加しています',
    'Authorization rate is near baseline while webhook delivery latency is elevated on nearly every event':
      '承認率は基準値に近いものの、ほぼすべてのイベントでwebhookの配信遅延が増加しています',
    'No contributing factors beyond baseline variance': '通常の変動範囲を超える要因は見つかりませんでした',
  };
  if (table[text]) return table[text];
  let m = text.match(/^(\d+) events show a webhook-reported status that disagrees with the internal ledger's reconciled status$/);
  if (m) return `${m[1]}件のイベントで、webhook通知のステータスと内部台帳の照合結果が一致していません`;
  m = text.match(/^Decline code (\S+) is concentrated rather than evenly distributed$/);
  if (m) return `エラーコード${m[1]}が偏って集中しています（均等に分散していません）`;
  return text;
}

function translateRecoveryDescription(text: string): string {
  const table: Record<string, string> = {
    'No action required. Continue monitoring.': '対応は不要です。引き続き監視します。',
    'Escalate the decline-code-59 concentration to the PSP risk/fraud team for manual review. Do not auto-retry suspected-fraud declines.':
      'エラーコード59の集中発生を決済代行会社のリスク/不正対策チームにエスカレーションし、手動でレビューします。不正利用の疑いがある拒否は自動で再試行しません。',
    'Open a reconciliation incident: pause automated reliance on the webhook-reported status for the affected PSP and reconcile against the PSP source-of-truth API before any customer-facing or billing action.':
      '突合インシデントを起票します。対象の決済代行会社についてwebhook通知のステータスへの自動的な依存を一時停止し、顧客対応や請求処理を行う前に決済代行会社の正データAPIと突合します。',
    'Open a delivery-pipeline incident with the PSP/webhook provider; no traffic or retry change needed.':
      '決済代行会社/webhookプロバイダに配信パイプラインのインシデントを起票します。トラフィックや再試行方式の変更は不要です。',
    'Open a PSP incident and, pending human approval, shift eligible traffic to the fallback route while retrying recoverable soft declines.':
      '決済代行会社にインシデントを起票し、人による承認を経てフォールバックルートへ対象トラフィックを切り替えつつ、回復可能な一時的な拒否を再試行します。',
  };
  return table[text] ?? text;
}

function translateRevenueNote(text: string): string {
  if (
    text ===
    '参考値: suspected-fraud declines are excluded from the recoverable estimate — they should not be retried automatically.'
  ) {
    return '参考値: 不正利用の疑いがある拒否は回収可能額の試算から除外しています。自動的に再試行すべきではないためです。';
  }
  let m = text.match(
    /^参考値: AI-estimated assumption that (\d+)% of declined volume in this window is recoverable via legitimate retry\/routing; extrapolated to a monthly run rate from an (\d+)-minute synthetic sample\. This is an estimate, not a measured figure\.$/,
  );
  if (m) {
    return `参考値: この期間に拒否となった金額のうち${m[1]}%は正規のリトライ/ルーティングにより回収可能というAIによる仮定に基づく試算です。${m[2]}分間の合成データから月次換算しています。実測値ではなく推定値です。`;
  }
  m = text.match(
    /^参考値: this is not a "declined revenue" estimate — it is the transaction amount exposed to reconciliation risk \((\d+) transactions where the PSP webhook status and internal ledger disagree\)\. Until reconciled, this amount is at risk of duplicate billing, under-recording, or an incorrect customer-facing status\. AI-estimated from synthetic data, extrapolated to a monthly run rate from an (\d+)-minute sample\.$/,
  );
  if (m) {
    return `参考値: これは「拒否済み売上」の試算ではなく、突合リスクにさらされている取引金額です（PSP webhookのステータスと内部台帳が一致しない${m[1]}件の取引）。突合が完了するまで、二重請求・計上漏れ・顧客への誤ったステータス表示のリスクがあります。合成データによるAI試算で、${m[2]}分間のサンプルから月次換算しています。`;
  }
  return text;
}

function translateRevenueSummary(text: string): string {
  let m = text.match(/^Estimated revenue-at-risk from reconciliation drift: ¥([\d,]+) \(¥([\d,]+) monthly run-rate estimate\)\.$/);
  if (m) return `突合のずれによるリスク金額の試算: ¥${m[1]}（月次換算 ¥${m[2]}）。`;
  m = text.match(/^Estimated recoverable revenue in this incident window: ¥([\d,]+) \(¥([\d,]+) monthly run-rate estimate\)\.$/);
  if (m) return `この期間における推定回収可能額: ¥${m[1]}（月次換算 ¥${m[2]}）。`;
  return text;
}

function translateRevenueEvidence(text: string): string {
  let m = text.match(/^¥([\d,]+) across (\d+) state-mismatched events in the observed window$/);
  if (m) return `観測期間中、ステータス不一致の${m[2]}件のイベントで¥${m[1]}`;
  m = text.match(/^¥([\d,]+) declined across (\d+) events in the observed window$/);
  if (m) return `観測期間中、${m[2]}件のイベントで¥${m[1]}が拒否`;
  return translateRevenueNote(text);
}

function translateGovernanceSummary(text: string): string {
  const m = text.match(/^Classification: (\w+)$/);
  return m ? `判定: ${m[1]}` : text;
}

function translateGovernanceRationale(text: string): string {
  const m = text.match(
    /^BLOCKED — (\d+) prompt-injection\/control-bypass attempt\(s\) detected in incident data\. The embedded instructions were treated as untrusted data, not followed, and are recorded below\. No human approval can override this classification through the automated pipeline; a security review is required\.$/,
  );
  if (m) {
    return `BLOCKED — インシデントデータ内で${m[1]}件のプロンプトインジェクション/制御回避の試みを検知しました。埋め込まれた指示は信頼できないデータとして扱われ、一切実行されていません（内容は以下に記録）。このパイプラインでは人による承認があってもこの判定を上書きできません。セキュリティレビューが必要です。`;
  }
  const table: Record<string, string> = {
    'Low-risk, no-fund-movement action; auto-approved per policy.':
      '低リスクかつ資金移動を伴わないアクションのため、ポリシーに基づき自動承認されました。',
    'Action affects payment routing/retry behavior; requires explicit human approval before any (simulated) execution.':
      '決済のルーティング/リトライ挙動に影響するアクションのため、（シミュレーション上の）実行前に人による明示的な承認が必要です。',
    'Action would move funds directly; blocked by hard policy regardless of context.':
      '資金を直接移動させるアクションのため、状況によらずハードポリシーによりブロックされました。',
  };
  return table[text] ?? text;
}

function translateGovernanceEvidence(text: string): string {
  if (text === 'hard-block: fund-movement action types are never permitted to execute') {
    return 'hard-block: 資金移動を伴うアクションタイプは常に実行が許可されません';
  }
  if (text === 'escalation: detected prompt-injection / control-bypass attempt forces BLOCK regardless of requested action') {
    return 'escalation: プロンプトインジェクション/制御回避の試みを検知したため、要求されたアクションに関わらずBLOCKへ強制的にエスカレーションされました';
  }
  let m = text.match(/^base classification for action type "(.+?)": (\w+)$/);
  if (m) return `アクションタイプ「${m[1]}」の基本分類: ${m[2]}`;
  m = text.match(/^Security finding: (\S+) in (\S+) — "(.+)"$/);
  if (m) return `セキュリティ検出: ${m[1]}（発生箇所: ${m[2]}） — "${m[3]}"`;
  return text;
}

function translateRecoveryEvidence(text: string): string {
  let m = text.match(/^Proposed action type: (\S+) \(policy-decided, not model-chosen\)$/);
  if (m) return `提案されたアクションタイプ: ${m[1]}（ポリシーにより決定・モデルによる選択ではありません）`;
  m = text.match(/^Required approvals: (.+)$/);
  if (m) return `必要な承認: ${m[1] === 'none' ? 'なし' : m[1]}`;
  m = text.match(/^Based on Diagnosis Agent: ([\s\S]+)$/);
  if (m) return `Diagnosis Agentの分析: ${translateCause(m[1])}`;
  m = text.match(/^Based on Revenue Impact Agent: ¥([\d,]+) estimated recoverable this window$/);
  if (m) return `Revenue Impact Agentの試算: この期間の推定回収可能額 ¥${m[1]}`;
  return text;
}

function translateObservabilitySummary(text: string): string {
  const m = text.match(/^Decision trail recorded: (\d+) agent steps captured with evidence, confidence, and timestamps\.$/);
  return m ? `${m[1]}件のAgentステップを、根拠・確信度・タイムスタンプとともに記録しました。` : text;
}

function translateObservabilityEvidence(text: string): string {
  const m = text.match(/^(.+?): confidence (\d+)% \((\w+)\)$/);
  return m ? `${m[1]}: 確信度 ${m[2]}%（${m[3]}）` : text;
}

function translateStepSummary(agent: string, text: string): string {
  switch (agent) {
    case 'signal':
      return translateSignalSummary(text);
    case 'diagnosis':
      return translateCause(text);
    case 'revenue_impact':
      return translateRevenueSummary(text);
    case 'recovery':
      return translateRecoveryDescription(text);
    case 'governance':
      return translateGovernanceSummary(text);
    case 'observability':
      return translateObservabilitySummary(text);
    default:
      return text;
  }
}

function translateStepEvidence(agent: string, text: string): string {
  switch (agent) {
    case 'signal':
      return translateSignalEvidence(text);
    case 'diagnosis':
      return translateFactor(text);
    case 'revenue_impact':
      return translateRevenueEvidence(text);
    case 'recovery':
      return translateRecoveryEvidence(text);
    case 'governance':
      return translateGovernanceEvidence(text);
    case 'observability':
      return translateObservabilityEvidence(text);
    default:
      return text;
  }
}

function translateAuditDetail(type: string, detail: string): string {
  if (type === 'incident.created') {
    const m = detail.match(/^Scenario "(.+)" investigated\.$/);
    return m ? `シナリオ「${translateScenarioName(m[1])}」を調査しました。` : detail;
  }
  if (type === 'governance.decision') {
    const m = detail.match(/^(\w+): ([\s\S]+)$/);
    return m ? `${m[1]}: ${translateGovernanceRationale(m[2])}` : detail;
  }
  if (type === 'human.approve' || type === 'human.reject') {
    const m = detail.match(/^(.+?) (approved|rejected) the recommended recovery action: ([\s\S]+)$/);
    if (m) {
      const [, actorName, verb, desc] = m;
      return `${actorName}さんが推奨された復旧アクションを${verb === 'approved' ? '承認' : '却下'}しました: ${translateRecoveryDescription(desc)}`;
    }
    return detail;
  }
  if (type === 'signal.completed') return translateSignalSummary(detail);
  if (type === 'diagnosis.completed') return translateCause(detail);
  if (type === 'revenue_impact.completed') return translateRevenueSummary(detail);
  if (type === 'recovery.completed') return translateRecoveryDescription(detail);
  if (type === 'governance.completed') return translateGovernanceSummary(detail);
  return detail;
}

const API_ERROR_JA: Record<string, string> = {
  'Invalid JSON body': 'リクエストの形式が正しくありません',
  'scenarioId is required': 'scenarioIdは必須です',
  'Investigation failed': '調査に失敗しました',
  'Incident not found': 'インシデントが見つかりません',
  'decision must be "approve" or "reject"': 'decisionは"approve"または"reject"を指定してください',
  'This incident was classified BLOCK by the Governance Agent and cannot be approved through this endpoint.':
    'このインシデントはGovernance AgentによりBLOCKと判定されているため、このエンドポイントから承認することはできません。',
};
function translateApiError(text: string): string {
  if (API_ERROR_JA[text]) return API_ERROR_JA[text];
  let m = text.match(/^Incident is not pending approval \(status: (.+)\)$/);
  if (m) return `インシデントは承認待ちの状態ではありません（ステータス: ${m[1]}）`;
  m = text.match(/^Unknown scenario: (.+)$/);
  if (m) return `不明なシナリオです: ${m[1]}`;
  return text;
}

// Diagnosis and Recovery are the only two agents that ever call the live
// Gemini API (see docs/ARCHITECTURE.md). Their system prompts now include an
// explicit output-language directive (lib/agents/diagnosis.ts,
// lib/agents/recovery.ts: "Write your response in natural Japanese ...")
// so a real Gemini response should come back in Japanese. That free-form
// text is rendered as-is here -- it is not one of the fixed rule-based
// templates this file pattern-matches, so no further display-layer
// rewriting is applied or needed. As a safety net for the rare case Gemini
// doesn't honor that instruction (or returns something with no Japanese
// characters at all, e.g. a purely numeric/English fragment), this shows one
// small, honest note next to it rather than silently passing off English
// text as if the screen were fully Japanese.
const JAPANESE_CHARS = /[぀-ヿ㐀-鿿]/;
function GeminiFreeTextNote({ reasoningMode, text }: { reasoningMode: string; text: string }) {
  if (reasoningMode !== 'gemini' || JAPANESE_CHARS.test(text)) return null;
  return (
    <div className="small" style={{ marginTop: 4, color: '#94a3b8' }}>
      （Geminiの生成文に日本語が含まれていないため、英語のまま表示されている可能性があります）
    </div>
  );
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
      .catch(() => setError('シナリオの読み込みに失敗しました。'));
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
      if (!res.ok) throw new Error(translateApiError(data.error || '調査に失敗しました'));
      setIncident(data.incident);
    } catch (e) {
      setError(e instanceof Error ? e.message : '調査に失敗しました');
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
      if (!res.ok) throw new Error(translateApiError(data.error || '判定に失敗しました'));
      setIncident(data.incident);
    } catch (e) {
      setError(e instanceof Error ? e.message : '判定に失敗しました');
    }
  }

  const stepsByAgent = new Map((incident?.steps || []).map((s) => [s.agent, s]));
  const activeScenario = scenarios.find((s) => s.id === selectedScenario);

  return (
    <main className="shell">
      <div className="top">
        <div className="brand"><span className="brand-mark">◈</span> Revenue Sentinel</div>
        <div className="pill">自律型決済 Control Tower</div>
      </div>

      <section className="hero">
        <div className="muted">自律型の売上回収とインシデント管理</div>
        <h1>
          決済のエラーを、
          <br />
          管理された売上回収に変える。
        </h1>
        <p className="muted">Signal → Diagnosis → Revenue Impact → Recovery → Governance → Observability</p>
      </section>

      <div className="grid">
        <section className="card">
          <div className="muted">合成インシデントシナリオを選択</div>
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
                {translateScenarioName(s.name)}
                {s.injectionAttempt ? '（セキュリティテスト）' : ''}
              </option>
            ))}
          </select>
          {activeScenario && (
            <p className="small" style={{ marginTop: 10 }}>
              {translateScenarioDescription(activeScenario.id, activeScenario.description)}
            </p>
          )}

          <div className="row" style={{ borderBottom: 'none', marginTop: 6 }}>
            <span className="small">推論モード</span>
            <div>
              <label className="small" style={{ marginRight: 12 }}>
                <input type="radio" checked={mode === 'mock'} onChange={() => setMode('mock')} /> Mock（決定論的）
              </label>
              <label className="small" title={geminiAvailable ? '' : '有効にするには GEMINI_API_KEY と AGENT_MODE=gemini を設定してください'}>
                <input
                  type="radio"
                  checked={mode === 'gemini'}
                  disabled={!geminiAvailable}
                  onChange={() => setMode('gemini')}
                />{' '}
                Gemini {geminiAvailable ? '' : '（未設定）'}
              </label>
            </div>
          </div>

          <button className="button" style={{ marginTop: 14 }} onClick={runInvestigation} disabled={running || !selectedScenario}>
            {running ? 'Agentが処理中…' : 'インシデント調査を実行'}
          </button>
          {error && <p className="small text-loss" style={{ marginTop: 10 }}>{error}</p>}

          {incident && (
            <div style={{ marginTop: 20 }}>
              <div className="row">
                <span>承認率</span>
                <strong>
                  {(incident.signal.baseline * 100).toFixed(1)}% → {(incident.signal.authRate * 100).toFixed(1)}%
                </strong>
              </div>
              <div className="row">
                <span>重大度</span>
                <span className={severityBadgeClass(incident.signal.severity)}>{incident.signal.severity}</span>
              </div>
              <div className="row">
                <span>{incident.signal.stateDriftDetected ? '推定リスク金額（対象期間）' : '推定回収可能額（対象期間）'}</span>
                <strong className={incident.signal.stateDriftDetected ? undefined : 'value-gold'}>
                  ¥{incident.revenueImpact.estimatedRecoverableAmount.toLocaleString()}
                </strong>
              </div>
              <div className="row">
                <span>月次換算の推定影響額</span>
                <strong className={incident.signal.stateDriftDetected ? undefined : 'value-gold'}>
                  ¥{incident.revenueImpact.estimatedMonthlyRunRateImpact.toLocaleString()}
                </strong>
              </div>
              <div className="row">
                <span>Governanceの判定</span>
                <span className={badgeClass(incident.governance.decision)}>{incident.governance.decision}</span>
              </div>
            </div>
          )}
        </section>

        <section className="card">
          <div className="muted">Agentの実行軌跡</div>
          <div className="timeline" style={{ marginTop: 18 }}>
            {AGENT_ORDER.map((agent, i) => {
              const step = stepsByAgent.get(agent);
              return (
                <div className="event" key={agent}>
                  <b>{step?.label ?? AGENT_LABELS[agent]}</b>
                  {step ? (
                    <>
                      <span className="small">{translateStepSummary(agent, step.summary)}</span>
                      <GeminiFreeTextNote reasoningMode={step.reasoningMode} text={translateStepSummary(agent, step.summary)} />
                      <div className="small" style={{ marginTop: 4 }}>
                        確信度 {(step.confidence * 100).toFixed(0)}% · {step.reasoningMode} ·{' '}
                        {new Date(step.finishedAt).toLocaleTimeString('ja-JP')}
                      </div>
                      {step.evidence.length > 0 && (
                        <ul style={{ margin: '6px 0 0', paddingLeft: 16 }}>
                          {step.evidence.map((e) => (
                            <li className="small" key={e} style={{ color: '#94a3b8' }}>
                              {translateStepEvidence(agent, e)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <span className="small">{running ? '実行待ち…' : '待機中 — インシデント調査を実行すると、このステップが表示されます。'}</span>
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
            <div className="muted">
              Diagnosisと根拠{' '}
              <span className="badge blue" style={{ marginLeft: 6 }}>
                入力: Signal Agent
              </span>{' '}
              <span className="badge blue">推論: {stepsByAgent.get('diagnosis')?.reasoningMode ?? 'mock'}</span>
            </div>
            <h2>{translateCause(incident.diagnosis.cause)}</h2>
            <GeminiFreeTextNote
              reasoningMode={stepsByAgent.get('diagnosis')?.reasoningMode ?? 'mock'}
              text={translateCause(incident.diagnosis.cause)}
            />
            {stepsByAgent.get('diagnosis')?.evidence.map((e) => (
              <div className="row" key={e}>
                ✓ {translateFactor(e)}
              </div>
            ))}
          </section>

          <section className="card">
            <div className="muted">
              推奨アクション{' '}
              <span className="badge blue" style={{ marginLeft: 6 }}>
                入力: Diagnosis + Revenue Impact
              </span>{' '}
              <span className="badge blue">推論: {stepsByAgent.get('recovery')?.reasoningMode ?? 'mock'}</span>
            </div>
            <h2>{translateRecoveryDescription(incident.recovery.description)}</h2>
            <GeminiFreeTextNote
              reasoningMode={stepsByAgent.get('recovery')?.reasoningMode ?? 'mock'}
              text={translateRecoveryDescription(incident.recovery.description)}
            />
            <p className="small">
              必要な承認: {incident.recovery.requiredApprovals.length ? incident.recovery.requiredApprovals.join('、') : 'なし'}
            </p>
            {stepsByAgent.get('recovery')?.evidence.map((e) => (
              <div className="row" key={e}>
                → {translateRecoveryEvidence(e)}
              </div>
            ))}
            <div style={{ marginTop: 10 }}>
              <span className={badgeClass(incident.governance.decision)}>{incident.governance.decision}</span>
            </div>
            <p className="small" style={{ marginTop: 10 }}>{translateGovernanceRationale(incident.governance.rationale)}</p>

            {incident.governance.securityFindings.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div className="small text-loss" style={{ fontWeight: 700 }}>セキュリティの検出結果（無効化済み・未実行）:</div>
                {incident.governance.securityFindings.map((f, i) => (
                  <div className="small text-loss" key={i}>
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
                  placeholder="承認者名"
                />
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="button" onClick={() => decide('approve')}>
                    承認
                  </button>
                  <button className="button secondary" onClick={() => decide('reject')}>
                    却下
                  </button>
                </div>
              </div>
            )}
            {incident.status !== 'pending_approval' && (
              <p className="small" style={{ marginTop: 12 }}>
                ステータス: <strong>{incident.status}</strong>。このMVPでは実際の決済操作は実行されません。
              </p>
            )}
          </section>
        </div>
      )}

      {incident && (
        <section className="card" style={{ marginTop: 18 }}>
          <div className="muted">Audit Trail (Observability Agent)</div>
          <div style={{ marginTop: 10 }}>
            {incident.auditLog.map((a) => (
              <div className="row" key={a.id}>
                <span className="small">
                  {new Date(a.timestamp).toLocaleTimeString('ja-JP')} · {a.actor} · {a.type}
                </span>
                <span className="small">{translateAuditDetail(a.type, a.detail)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="small" style={{ marginTop: 28 }}>
        Synthetic Data のみ・PAN/CVCの取得なし・資金移動なし・デモ環境・対象スタック: Cloud Run + Gemini API + Firestore/BigQuery + Cloud Logging
      </p>
    </main>
  );
}
