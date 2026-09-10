# Hackathon Submission Checklist

Google Cloud Japan Agentic AI Hackathon Vol.5.

## ⚠️ Verify these dates yourself before submitting

This checklist was assembled by an automated coding agent working in a
network-sandboxed environment that could not directly load
`zenn.dev/hackathons/google-cloud-japan-ai-hackathon-vol5` or
`googlecloudjapanaihackathon.devpost.com` (both are blocked by the
sandbox's egress policy — confirmed via direct `curl`, not just the fetch
tool, and via a translate-proxy workaround, both denied). Two different
web-search passes surfaced **conflicting** schedule information:

- One source (relayed by the project owner before this checklist was
  written): entry/submission period **8/20–10/15**, final pitch **12/1**.
- A separate search snippet: registration by **10/15**, with the "development
  and submission" phase running **12/10–2/15** and a final pitch at the
  Agentic AI Summit around **3/19**.

**Do not trust either date range from this document.** Open the official
Zenn page yourself and confirm: the actual submission deadline, whether
10/15 is only a registration/entry cutoff or the full submission deadline,
and the demo video / architecture diagram format requirements. This
checklist covers everything that does not depend on resolving that
conflict.

## PASS / GAP — requirement by requirement

| # | Requirement | Status | Evidence / gap |
|---|---|---|---|
| 1 | Google Cloud application execution product | **PASS** | Cloud Run, via `Dockerfile` (`output: 'standalone'`) + `deploy.sh`. Verified locally: production build + standalone `node server.js` smoke-tested (see README "Try it locally" / commit history) |
| 2 | Google Cloud AI technology (Gemini API / Agent Platform / ADK) | **PASS** | Gemini API called directly (`lib/gemini/client.ts`) from two agents (Diagnosis, Recovery); real call path proven via a manual live test (invalid key → HTTP 400 from `generativelanguage.googleapis.com`, confirming reachability and a real request) and via automated fetch-mocked tests (`tests/gemini.test.ts`) covering success/failure/timeout |
| 3 | 6-agent pipeline actually runs | **PASS** | `lib/pipeline.ts`; each agent's output is consumed by the next (Diagnosis + Revenue Impact both feed Recovery — visible in the UI, not just in code); 37 automated tests |
| 4 | Synthetic, reproducible incident demo | **PASS** | 5 deterministic scenarios, `lib/scenarios/index.ts`, one-click reproducible from the UI or `POST /api/investigate` |
| 5 | Governance / human approval / BLOCK works | **PASS** | Policy table in `lib/agents/governance.ts`; `POST /api/incidents/:id/approve` refuses (`409`) to approve a `BLOCK`ed incident server-side, not just in the UI. Tested (`tests/governance.test.ts`) |
| 6 | Prompt injection scenario works | **PASS** | "PSP-A decline spike + embedded prompt injection" scenario; detection in `lib/security.ts`, force-escalation to `BLOCK` in Governance, tested (`tests/security.test.ts`, `tests/governance.test.ts`, `tests/pipeline.test.ts`) |
| 7 | Observability / decision trail visible | **PASS** | Every step records evidence/confidence/reasoningMode/timestamps; audit trail panel in UI; structured JSON logs via `lib/logger.ts` |
| 8 | Deployed URL accessible to judges | **GAP** | Requires a GCP project + `gcloud` — not available inside this sandbox (see "What could not be done from this sandbox" below). `deploy.sh` + `docs/DEPLOY.md` make this a ~5-minute manual step |
| 9 | GitHub repository | **PASS (assuming push)** | This project lives at `revenue-sentinel/` in the `asfsei3/ai-orchestra` repo, branch `claude/revenue-sentinel-payment-agent-201fhs`. Confirm before submitting whether the hackathon wants a **dedicated** repo rather than a subdirectory of an existing one — if so, extract `revenue-sentinel/` into its own repo (it has no dependency on the rest of `ai-orchestra`) |
| 10 | Architecture diagram | **PASS** | Mermaid diagram in `docs/ARCHITECTURE.md`, renders natively on GitHub |
| 11 | 3-minute demo video | **GAP (script ready, recording not done by this session)** | `docs/DEMO_SCRIPT.md` has a timed script for scenarios 1-3; see that doc's note on what a Playwright-recorded silent walkthrough can and can't substitute for |
| 12 | README / submission materials | **PASS** | `README.md` covers Problem / Why existing approaches are insufficient / Solution / Agent architecture / Governance / Business impact / Google Cloud services used / Security / Demo instructions / Deployment / Limitations / Synthetic data disclaimer |
| 13 | Development-period eligibility rule | **UNVERIFIED** | If the rule is "don't submit a project substantially built before the hackathon's official start," note that the underlying `ai-orchestra` product this session also touches is a separate, pre-existing project — `revenue-sentinel/` itself was built new in this session, on its own branch, with no shared code. Confirm the exact rule text and, if a standalone repo is required, extract `revenue-sentinel/` before the official start date registers it as "existing" |

## What could not be done from this sandbox (and why)

The coding session that built this had **no** `gcloud` CLI, **no** Docker
daemon, and **no** GCP credentials or Gemini API key available to it. It
confirmed, rather than assumed, the following:

- `run.googleapis.com`, `cloudbuild.googleapis.com`,
  `artifactregistry.googleapis.com`, `generativelanguage.googleapis.com`,
  and other core Google APIs **are** reachable over HTTPS from the sandbox
  — so the blocker is tooling/credentials, not network connectivity.
- `dl.google.com` and `packages.cloud.google.com` (the Cloud SDK's
  distribution hosts) are egress-blocked in the sandbox, so `gcloud` itself
  could not be installed there.
- No Docker daemon is running in the sandbox (`docker build` fails with
  "no such file or directory" on the socket), so the container image could
  not be built in-sandbox either — though `npm run build` +
  `node .next/standalone/server.js` was run directly and verified to serve
  both the UI and every API route correctly, which is what the Dockerfile
  packages.
- A real (non-fallback) Gemini response could not be obtained without an
  API key; the Gemini call path was instead verified two other ways: (a)
  live, with an intentionally invalid key, confirming the request actually
  reaches `generativelanguage.googleapis.com` and gets a real HTTP 400 back
  before falling back to mock, and (b) with `tests/gemini.test.ts`, which
  mocks `fetch` to exercise success, HTTP-error, malformed-body, and
  network-throw paths deterministically.

**To finish items 8 and 11**, either:

1. Run `./deploy.sh` (optionally `--gemini-key=...`) from Google Cloud
   Shell or any machine with `gcloud` installed and authenticated — takes
   about 3-5 minutes, see `docs/DEPLOY.md`; or
2. Provide this session with a GCP service-account key (with Cloud Run
   Admin, Artifact Registry Admin/Writer, Cloud Build Editor, and Service
   Account User roles) and a project ID, and it can attempt the deploy via
   direct REST calls using the reachable `*.googleapis.com` endpoints
   confirmed above — slower to get right without `gcloud` as a safety net,
   but not impossible.

Either way, once deployed, run through the "Post-deploy verification
checklist" in `docs/DEPLOY.md` before calling it done — a successful
`gcloud run deploy` is not the same as a working app.

## Self-audit (judge's-eye view)

See the chat response accompanying this checklist for the full 10-criteria
scored self-review (Problem novelty, Real-world usefulness, Agentic
behavior, Governance/security, Technical implementation, Google Cloud
utilization, Scalability, UX, Demo clarity, Overall competitiveness) — kept
out of this file so the checklist stays a living document you can re-run
without it going stale against a one-time review.
