# Revenue Sentinel

Autonomous Payment Revenue Recovery & Incident Control Tower — an entry for
the 5th Agentic AI Hackathon with Google Cloud.

> **Synthetic data disclaimer**: every payment event in this project is
> synthetic and defined in code (`lib/scenarios/index.ts`). No real PAN,
> CVC, cardholder PII, or PSP credentials are ever requested, stored, or
> processed. No code path anywhere in this repository calls a real payment
> execution API — there is no `retryCharge`, `createRefund`,
> `initiateTransfer`, or equivalent. The human-approval endpoint only marks
> a recovery action as authorized in an audit log for demo purposes.

## Problem

When a payment incident happens — an authorization-rate drop, a webhook
pipeline falling out of sync with the internal ledger, a suspected-fraud
decline storm — the technical signal and the business consequence are
discovered by different people, at different times, through different
tools. Payment ops sees a dashboard number move. Finance finds out about
the revenue impact days later, from a report. Whoever proposes a fix
(retry, reroute, escalate) rarely has both the technical evidence and the
revenue estimate in front of them at the moment of decision, and there is
usually no single, inspectable record of what was observed, concluded, and
approved.

## Why existing approaches are insufficient

- **Dashboards and alerting** surface the technical signal (decline rate,
  latency) but stop there — they don't investigate a root cause, estimate
  revenue impact, or propose a next step.
- **Runbooks and manual triage** connect signal to action, but the
  reasoning and evidence usually live in someone's head or a Slack thread,
  not in a structured, auditable trail.
- **"AI agent" demos that skip governance** show an LLM proposing actions
  but not a system that can safely refuse to execute a risky or manipulated
  one. For payments specifically, that's a non-starter: an agent that can
  be talked into approving a refund via injected text in a webhook payload
  is a liability, not a feature.

Revenue Sentinel's bet is that the useful unit of work is not "detect an
anomaly" but the full chain: **signal → diagnosis → business impact →
recovery proposal → governance decision → auditable record** — with a hard
governance layer that no amount of clever prompting inside the incident
data can talk around.

## Solution

A six-agent pipeline investigates a payment incident end to end and
produces one auditable decision trail:

```
Signal → Diagnosis → Revenue Impact → Recovery → Governance → Observability
```

Each agent's output feeds the next (Diagnosis's conclusion and Revenue
Impact's estimate both flow into Recovery's proposal — visible in the UI as
explicit "input: X Agent" badges and "Based on Diagnosis Agent: ..." /
"Based on Revenue Impact Agent: ..." evidence lines, not six independent
function calls). Governance then classifies the proposed action as `AUTO`,
`APPROVAL`, or `BLOCK` using a fixed policy table, and Observability
assembles the full evidence/decision/action trail into an audit log and
structured logs.

## Agent architecture

| Agent | Does | Real Gemini reasoning? |
|---|---|---|
| **Signal** | Computes authorization-rate delta vs. baseline, dominant decline code, webhook latency stats, and payment/webhook state-drift count from the synthetic event window; flags an anomaly + severity | No — pure arithmetic, always deterministic |
| **Diagnosis** | Produces a likely root cause from Signal's output | **Yes** — Gemini phrases/augments a rule-based hypothesis; any failure falls back to the rule-based text unchanged |
| **Revenue Impact** | Estimates recoverable revenue (or, for state-drift incidents, revenue *at risk* from reconciliation error) and a monthly run-rate projection | No, deliberately — every number is plain arithmetic over the event data, so it stays reproducible and auditable, never a model-generated figure |
| **Recovery** | Proposes one action, given Diagnosis + Revenue Impact | **Yes** — Gemini phrases the operational description; the action *type* itself is always policy-decided, never model-chosen (see Governance below) |
| **Governance** | Classifies the proposed action `AUTO` / `APPROVAL` / `BLOCK` from a fixed policy table, and scans all incident data for prompt-injection attempts | No — deterministic policy, on purpose (see Security) |
| **Observability** | Assembles the full trace into an audit log and writes structured JSON logs (Cloud Logging-ready) | No |

Two agents (Diagnosis, Recovery) call the real Gemini API
(`lib/gemini/client.ts`, plain REST, no SDK) when `AGENT_MODE=gemini` and
`GEMINI_API_KEY` is set; both always have a deterministic mock fallback, so
a network failure during a live demo degrades gracefully instead of
breaking it. See `tests/gemini.test.ts` for automated coverage of the
success/failure/timeout paths, and `docs/ARCHITECTURE.md` for why Signal,
Revenue Impact, and Governance are intentionally kept LLM-free.

## Governance

Governance is a **hard policy table**, not a model judgment:

1. Action types that would move funds directly (`refund`, `fund_transfer`)
   are **always** `BLOCK` — moot in practice, since no code path in this
   repository can execute either one anyway.
2. Every other action type has a base classification: low-risk,
   no-fund-movement actions (`notify_ops`, `open_psp_incident`,
   `escalate_to_psp_risk_team`) are `AUTO`; actions that touch payment
   routing or retry behavior (`traffic_shift`) are `APPROVAL`.
3. A detected prompt-injection or control-bypass attempt **force-escalates
   to `BLOCK`**, regardless of what the base classification would have
   been — a security finding can only ever escalate a decision, never
   soften one.
4. `POST /api/incidents/:id/approve` enforces rule 3 **server-side**: it
   refuses (HTTP 409) to approve an incident currently classified `BLOCK`.
   This is defense in depth — a compromised or careless client cannot talk
   the backend into executing a blocked action.

## Security: prompt-injection defense

Any free-text field that could plausibly originate from outside the system
(currently `PaymentEvent.customerNote`, modeling a customer-supplied
descriptor or webhook note) is treated as **untrusted data**, never as an
instruction:

- `lib/security.ts#detectInjection` scans it for instruction-override,
  role-override, fake-system-turn, fund-movement-request, and
  control-bypass patterns.
- `lib/security.ts#sanitizeForPrompt` wraps any such text in explicit
  delimiters and strips code-fence/angle-bracket/control-character
  breakout characters before it can ever reach a Gemini prompt.
- Governance — not the LLM — makes the final call, so even a future model
  talked into an unsafe suggestion still can't bypass the policy table.

The **"PSP-A decline spike + embedded prompt injection"** scenario
exercises this end to end: one event's `customerNote` contains an embedded
instruction asking the pipeline to auto-approve a refund and disable
logging. The pipeline detects it, never follows it, force-blocks the
incident, and records the neutralized attempt in the audit trail. See
`tests/security.test.ts` and `tests/governance.test.ts`.

## Business impact

The Revenue Impact Agent turns a technical signal into a number a
commerce/finance stakeholder can act on:

- **Decline-driven incidents**: estimated recoverable revenue in the
  observed window + a monthly run-rate projection, assuming a stated
  recoverable fraction of declined volume (suspected-fraud declines are
  explicitly excluded — they shouldn't be retried).
- **State-drift incidents**: reframed as revenue *at risk* of duplicate
  billing or under-recording until reconciled, not "recoverable declined
  revenue" — a different business question with a different number.

Every figure is labeled **参考値 (reference value / estimate)** and stated
as AI/rule-estimated from synthetic data — never presented as a measured
fact.

## Demo scenarios

Five deterministic scenarios (`lib/scenarios/index.ts`), reproducible with
one click each:

1. **PSP-A authorization rate drop** — concentrated decline code + elevated
   latency → traffic-shift proposal → `APPROVAL`.
2. **Payment/webhook state drift (reconciliation gap)** — webhook status
   disagrees with the internal ledger for several transactions while auth
   rate/latency look normal → reconciliation-incident proposal → `AUTO`.
3. **PSP-A decline spike + embedded prompt injection** — the security
   scenario above → `BLOCK`.
4. **Webhook latency spike** — no authorization impact → `AUTO`.
5. **PSP-B suspected-fraud decline storm** — escalation instead of
   auto-retry → `AUTO`, with revenue impact explicitly excluding the
   fraud-flagged amount.

See `docs/DEMO_SCRIPT.md` for a timed 3-minute walkthrough of scenarios 1-3.

## Try it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000, pick a scenario, and click **Run incident
investigation**. Everything runs in deterministic `mock` reasoning mode by
default — no external network calls, no API key needed.

## Gemini integration

Set `AGENT_MODE=gemini` and `GEMINI_API_KEY` (see `.env.example`) to let
Diagnosis and Recovery call the Gemini API directly (plain REST, no SDK).
Any network error, timeout, or malformed response falls back to the
deterministic rule-based result for that step — see
`lib/gemini/client.ts` — so enabling Gemini never makes a live demo less
reliable. The UI's reasoning-mode toggle and each agent's `reasoning:`
badge make it visible, live, which mode actually served a given run.

## Tests

```bash
npm test
```

37 tests cover the Signal Agent's anomaly thresholds (including state
drift), the Governance Agent's policy table (including the
prompt-injection escalation rule and the "action type is never
model-chosen" guarantee), the prompt-injection detector/sanitizer, the
real Gemini call path (success/HTTP-error/malformed-body/network-throw/no-
key, via a mocked `fetch`), and the full pipeline for all five scenarios.

## Deploying to Cloud Run

See `docs/DEPLOY.md` for full instructions, or from Google Cloud Shell:

```bash
cd revenue-sentinel
gcloud config set project YOUR_PROJECT_ID
./deploy.sh                                  # mock mode
./deploy.sh --gemini-key=YOUR_GEMINI_API_KEY # + real Gemini reasoning
```

`deploy.sh` wraps `gcloud run deploy --source .` (Cloud Build builds the
included `Dockerfile`, no local Docker needed) and, when a Gemini key is
passed, stores it in Secret Manager rather than as a plain env var.

## Google Cloud services used

- **Cloud Run** — application execution platform (this repo's `Dockerfile`,
  `output: 'standalone'` in `next.config.mjs`)
- **Gemini API** — Diagnosis and Recovery agent reasoning (optional; mock
  fallback always available)
- **Secret Manager** — `GEMINI_API_KEY` storage in production (`deploy.sh`)
- **Cloud Logging** — every agent step is written as a structured JSON log
  line (`lib/logger.ts`), ingested automatically on Cloud Run
- **Firestore or BigQuery** — documented upgrade path for incident
  persistence (currently in-memory — see Limitations)

## Limitations

- **Persistence is in-memory** (`lib/store.ts`): sufficient for a live demo
  on a single Cloud Run instance, but state resets on cold start / restart
  and is not shared across scaled replicas. Firestore is the documented
  upgrade path (`docs/ARCHITECTURE.md`) — a small change, since
  `IncidentTrace` is already a plain JSON-serializable object.
- **No Pub/Sub ingestion yet**: incidents are triggered synchronously from
  the UI/API, not from real PSP webhooks. Documented as the next step once
  the synchronous demo is stable, per the original build brief.
- **Revenue figures are estimates from synthetic data**, not measured
  figures from a real payment processor — always labeled as such.
- **Gemini is used for narrative text only**, never for numbers or for
  choosing an action type — an intentional scope limit, not an oversight
  (see Governance and Agent architecture above).

## Project layout

```
app/                    Next.js App Router UI + API route handlers
lib/agents/             The six agents (signal, diagnosis, revenue impact,
                         recovery, governance, observability)
lib/gemini/             Gemini provider abstraction (mock/gemini modes)
lib/scenarios/          Deterministic synthetic incident scenarios
lib/security.ts         Prompt-injection detection + prompt sanitization
lib/pipeline.ts         Orchestrates the six agents end to end
lib/store.ts            In-memory incident/audit store (Firestore upgrade
                         path documented in docs/ARCHITECTURE.md)
tests/                  Vitest suite (37 tests)
deploy.sh               One-shot Cloud Run deploy script
docs/                   PRD, architecture, deploy guide, demo script,
                         submission checklist
```
