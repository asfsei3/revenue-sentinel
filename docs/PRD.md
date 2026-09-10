# Revenue Sentinel — MVP PRD

## Problem
Payment incidents are often discussed in technical terms (decline rate, error codes, webhook latency) while the business impact—lost revenue and customer friction—appears later. Operations teams must correlate signals, identify root causes, estimate impact, decide what can safely be automated, and coordinate recovery.

## User
Payment / commerce operations leader, PSP relationship owner, payment product manager, or enterprise payments team.

## Agent behavior
- Signal: detect anomaly from synthetic events.
- Diagnosis: correlate PSP, error code, timing, latency.
- Revenue Impact: estimate recoverable revenue and confidence.
- Recovery: generate a recovery plan and required approvals.
- Governance: classify actions into AUTO / APPROVAL / BLOCK.
- Observability: preserve evidence and decision trail.

## MVP scope
Must-have (status):
- Anomaly scenario — **done**, 5 synthetic scenarios (`lib/scenarios`),
  covering decline spike, payment/webhook state drift, prompt injection,
  latency-only, and suspected-fraud storm
- Multi-step agent trajectory — **done**, 6 agents (`lib/agents`,
  `lib/pipeline.ts`); Recovery visibly consumes Diagnosis + Revenue Impact
  output, not independent function calls
- Business impact — **done**, Revenue Impact Agent, labeled as an estimate,
  never calls an LLM (numbers stay plain arithmetic)
- Governance gate — **done**, hard policy table + human-approval endpoint that
  refuses to override a BLOCK (`lib/agents/governance.ts`,
  `app/api/incidents/[id]/approve/route.ts`)
- Visible audit trail — **done**, Observability Agent + audit log UI panel
- Synthetic dataset — **done**, deterministic, no real payment data
- Google Cloud deployment — **prepared, not yet executed**: `Dockerfile`
  (standalone build verified locally), `deploy.sh`, and `docs/DEPLOY.md`
  are ready; the actual `gcloud run deploy` needs to be run by someone with
  a GCP project and the `gcloud` CLI (not available in the sandbox this was
  built in — see `docs/SUBMISSION_CHECKLIST.md`)
- Real Gemini reasoning — **done**, Diagnosis and Recovery agents call the
  Gemini API directly (`lib/gemini/client.ts`), verified live (network
  reachability + real HTTP response) and via automated fetch-mocked tests
  (`tests/gemini.test.ts`)
- Prompt-injection test suite — **done**, `tests/security.test.ts`,
  `tests/governance.test.ts`, and the `prompt-injection-attempt` scenario

Later: Pub/Sub ingestion, Firestore/BigQuery persistence (currently
in-memory, see `docs/ARCHITECTURE.md`), Gemini tool/function calling
(currently plain text generation), Slack/Jira simulation, learned routing
recommendations.

## 3-minute demo
0:00 problem
0:25 trigger PSP-A anomaly
0:50 agents investigate
1:35 show revenue impact
2:00 governance gate
2:25 show audit trail
2:45 explain Google Cloud architecture + next step
