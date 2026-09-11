# Revenue Sentinel — Submission Text

Google Cloud Japan Agentic AI Hackathon Vol.5.

## Project name

Revenue Sentinel

## One-line summary

An autonomous six-agent pipeline that turns a synthetic payment incident
into a governed, audited recovery decision — connecting technical signal to
business impact to a human-approved (or automatically blocked) action, with
a hard governance layer that a prompt-injection attempt cannot talk around.

## Problem

Payment incidents are usually detected in technical terms (a decline-rate
drop, a webhook delay, a reconciliation mismatch), while the business
impact and the recovery decision are worked out separately, later, by
different people. There is rarely a single, inspectable record of what was
observed, concluded, and approved.

## Why existing approaches are insufficient

- Dashboards and alerting surface the technical signal but don't
  investigate a cause, estimate revenue impact, or propose a next step.
- Manual runbooks connect signal to action, but the reasoning and evidence
  usually live in a person's head or a chat thread, not in a structured,
  auditable trail.
- An "AI agent" that proposes actions without a governance layer that can
  refuse to execute a risky or manipulated one is a liability for a
  payments use case specifically — an agent that could be talked into
  approving a refund via text embedded in incident data is not safe to
  ship.

## Solution

A six-agent pipeline investigates a payment incident end to end:

```
Signal -> Diagnosis -> Revenue Impact -> Recovery -> Governance -> Observability
```

Each agent's output feeds the next — Diagnosis's conclusion and Revenue
Impact's estimate both flow into Recovery's proposal, visible in the UI as
explicit "input: X Agent" badges, not six independent function calls.
Governance then classifies the proposed action `AUTO`, `APPROVAL`, or
`BLOCK` from a fixed policy table, and Observability assembles the full
evidence/decision/action trail into an audit log and structured logs.

## Why this is agentic, not just automation

- Each of the six steps observes, reasons over, and adds evidence to a
  shared incident context — not a fixed automation script with no
  branching. The same six agents produce different diagnoses, revenue
  framings, and recovery actions across the five scenarios, driven by what
  they actually observe in that scenario's data.
- Two agents (Diagnosis, Recovery) call the Gemini API for reasoning; both
  have a deterministic mock fallback, so a live demo degrades gracefully
  instead of breaking when a model call fails.
- The system makes an autonomous decision (`AUTO`) for low-risk actions
  and autonomously *defers* to a human for medium-risk ones (`APPROVAL`),
  and autonomously *refuses* high-risk or manipulated ones (`BLOCK`) —
  three distinct autonomous behaviors, not one fixed path.

## Google Cloud technologies used

- **Cloud Run** — application execution platform (`Dockerfile`, standalone
  Next.js output)
- **Gemini API** — Diagnosis and Recovery agent reasoning (`gemini-2.0-flash`
  by default; direct REST calls, no SDK)
- **Secret Manager** — `GEMINI_API_KEY` storage when Gemini mode is enabled
  (`deploy.sh`)
- **Cloud Logging** — every agent step is emitted as a structured JSON log
  line, ingested automatically from Cloud Run's stdout

No other Google Cloud service is used by the deployed application. (Firestore
and Pub/Sub are documented as a future upgrade path in
`docs/ARCHITECTURE.md` — they are not implemented and are not claimed as
in-use.)

## Governance / security

Governance is a hard policy table, not a model judgment:

- Fund-moving action types (`refund`, `fund_transfer`) are always `BLOCK`
  — moot in practice, since no code path in this repository can execute
  either one.
- Every other action type has a base classification; actions that touch
  payment routing/retry are `APPROVAL`, low-risk no-fund-movement actions
  are `AUTO`.
- A detected prompt-injection or control-bypass attempt in the incident's
  underlying data force-escalates the decision to `BLOCK`, regardless of
  the base classification.
- `POST /api/incidents/:id/approve` enforces this **server-side**: it
  refuses (HTTP 409) to approve an incident currently classified `BLOCK` —
  not just a UI-level check.
- Gemini never chooses the recovery action's *type* and never computes a
  number; it only phrases already-decided text. This closes off a specific
  attack: even a model successfully manipulated by injected text cannot
  change what Governance ultimately does, because the manipulable surface
  (free text) and the decision surface (the policy table) are structurally
  separate.

The "PSP-A decline spike + embedded prompt injection" scenario demonstrates
this end to end and is covered by automated tests
(`tests/security.test.ts`, `tests/governance.test.ts`).

## Business impact

The Revenue Impact Agent turns a technical signal into a number a
commerce/finance stakeholder can act on: estimated recoverable revenue (or,
for a reconciliation-drift incident, revenue *at risk*) plus a monthly
run-rate projection. Every figure is computed by plain arithmetic over the
(synthetic) event data — never generated by an LLM — and is labeled
**参考値 (reference value / estimate)**, explicitly as an AI/rule-estimated
figure from synthetic data, not a measured fact.

## Technical architecture

See `architecture.png` in this folder (also `docs/ARCHITECTURE.md` in the
main repo for the full write-up, including the Mermaid source). Next.js 16
App Router, TypeScript throughout, 37 automated tests (Vitest), Dockerfile
targeting Cloud Run with `output: 'standalone'`.

## Demo URL

https://revenue-sentinel-o7euplxxpq-an.a.run.app

Deployed on Cloud Run (`asia-northeast1`). Production smoke test
(`scripts/smoke-test.sh`): 13/13 checks passing against this URL.

## GitHub URL

https://github.com/asfsei3/revenue-sentinel

## Video URL

`<FILL IN AFTER YOUTUBE UPLOAD>` — `demo.mp4` in this folder plus a
pre-written title/description/thumbnail and 3-step upload guide are ready
in `VIDEO_UPLOAD.md`. Re-run `scripts/demo-video/produce.sh <deployed-url>`
against the real Cloud Run URL before uploading — the current `demo.mp4` is
a localhost dry run.

## Synthetic data & scope disclaimer

Every payment event in this project is synthetic and defined in code
(`lib/scenarios/index.ts`). No real PAN, CVC, cardholder PII, or PSP
credentials are ever requested, stored, or processed, and no code path
anywhere in this repository calls a real payment execution API. This is a
prototype/demo built for the hackathon, not a production payment
infrastructure product, and no claim is made otherwise.
