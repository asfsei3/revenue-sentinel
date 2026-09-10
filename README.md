# Revenue Sentinel

Autonomous Payment Revenue Recovery & Incident Control Tower — an entry for
the 5th Agentic AI Hackathon with Google Cloud.

## Concept

Revenue Sentinel runs a six-agent pipeline over a synthetic payment
incident: it detects the anomaly, investigates the likely root cause,
estimates the business impact, proposes a recovery action, classifies that
action's risk (`AUTO` / `APPROVAL` / `BLOCK`), and records a full,
inspectable decision trail — evidence, confidence, and timestamps for every
step.

```
Signal → Diagnosis → Revenue Impact → Recovery → Governance → Observability
```

Governance is a hard policy table, not a model judgment: fund-moving action
types are always blocked, and any detected prompt-injection / control-bypass
attempt in the incident's underlying data force-escalates the decision to
`BLOCK` — enforced server-side, not just in the UI. See
`docs/ARCHITECTURE.md` for the full design and `docs/DEMO_SCRIPT.md` for a
3-minute walkthrough.

## Try it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000, pick a scenario, and click **Run incident
investigation**. Everything runs in deterministic `mock` reasoning mode by
default — no external network calls, no API key needed.

## Scenarios

Four deterministic synthetic scenarios (`lib/scenarios/index.ts`):

1. **PSP-A authorization rate drop** — concentrated decline code + elevated
   latency → recommends a traffic shift, classified `APPROVAL`.
2. **Webhook latency spike** — no authorization impact → recommends opening
   a delivery-pipeline incident, classified `AUTO`.
3. **PSP-B suspected-fraud decline storm** — recommends escalation instead
   of auto-retry (retrying a fraud block would be unsafe), classified
   `AUTO` for the escalation itself; the Revenue Impact Agent explicitly
   excludes these declines from the recoverable estimate.
4. **PSP-A decline spike + embedded prompt injection** — a customer-note
   field contains an embedded instruction trying to get the pipeline to
   auto-approve a refund and disable logging. The Governance Agent detects
   it, never follows it, and force-blocks the incident.

## Gemini integration

Set `AGENT_MODE=gemini` and `GEMINI_API_KEY` (see `.env.example`) to let the
Diagnosis Agent call the Gemini API directly (plain REST, no SDK). Any
network error or malformed response falls back to the deterministic
rule-based result for that step — see `lib/gemini/client.ts` — so enabling
Gemini never makes a live demo less reliable.

## Tests

```bash
npm test
```

20 tests cover the Signal Agent's anomaly thresholds, the Governance
Agent's policy table (including the prompt-injection escalation rule), the
prompt-injection detector/sanitizer, and the full pipeline for all four
scenarios (`tests/`).

## Deploying to Cloud Run

See `docs/DEPLOY.md`. Short version:

```bash
gcloud run deploy revenue-sentinel --source . --region asia-northeast1 --allow-unauthenticated
```

## Google Cloud target architecture

- **Cloud Run** — web app + API (this repo's `Dockerfile`, `output:
  'standalone'` in `next.config.mjs`)
- **Gemini API** — Diagnosis Agent reasoning (optional; mock fallback
  always available)
- **Firestore or BigQuery** — documented upgrade path for incident
  persistence (currently in-memory, see `docs/ARCHITECTURE.md`)
- **Pub/Sub** — documented post-MVP step for real PSP webhook ingestion
- **Cloud Logging** — every agent step is written as a structured JSON log
  line (`lib/logger.ts`), ingested automatically on Cloud Run
- **Secret Manager** — recommended storage for `GEMINI_API_KEY` in
  production (see `docs/DEPLOY.md`)

## Important

This project uses **synthetic payment data only**. It does not move funds,
store PAN/CVC or any real cardholder data, and no code path anywhere in
this repository calls a real payment execution API (no `retryCharge`,
`createRefund`, `initiateTransfer`, etc.). The human-approval endpoint only
marks a recovery action as authorized in the audit trail for demo purposes.

## Project layout

```
app/                  Next.js App Router UI + API route handlers
lib/agents/           The six agents (signal, diagnosis, revenue impact,
                       recovery, governance, observability)
lib/gemini/           Gemini provider abstraction (mock/gemini modes)
lib/scenarios/         Deterministic synthetic incident scenarios
lib/security.ts        Prompt-injection detection + prompt sanitization
lib/pipeline.ts         Orchestrates the six agents end to end
lib/store.ts            In-memory incident/audit store (Firestore upgrade
                        path documented in docs/ARCHITECTURE.md)
tests/                  Vitest suite
docs/                   PRD, architecture, deploy guide, demo script
```
