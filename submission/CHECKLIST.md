# Hackathon Submission Checklist

Google Cloud Japan Agentic AI Hackathon Vol.5.

## Deadline — confirmed by the project owner

**Submission deadline: 2026-10-15 (Thu) 23:59 JST.** The project owner
checked the official Zenn page directly (this session's sandbox could not
— `zenn.dev` is egress-blocked there) and confirmed: registration +
project submission both close 10/15 23:59, and submission materials are
GitHub repo + deployed URL + description + architecture diagram + a
~3-minute YouTube demo video. Earlier drafts of this checklist flagged a
date conflict from web-search snippets — resolved, ignore those.

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
| 8 | Deployed URL accessible to judges | **GAP — action needed from you** | Requires a GCP project + `gcloud`, not available inside the build sandbox (see "What could not be done from this sandbox" below). Run `./deploy.sh` from Cloud Shell — ~3-5 minutes, see `docs/DEPLOY.md` |
| 9 | GitHub repository | **PASS** | Standalone public repo: https://github.com/asfsei3/revenue-sentinel — extracted from the original `ai-orchestra` monorepo subdirectory with its real 5-commit history preserved (`git subtree split`), verified via the GitHub API: correct root layout (`README.md`, `docs/`, `package.json`, `Dockerfile`, `deploy.sh`, `app/`, `lib/`, `tests/` all at repo root), no `node_modules`/`.next`/secrets committed, 5 commits with the intended messages/dates, default branch `main` |
| 10 | Architecture diagram | **PASS** | Mermaid diagram in `docs/ARCHITECTURE.md`, renders natively on GitHub |
| 11 | 3-minute demo video | **GAP — action needed from you** | `docs/DEMO_SCRIPT.md` has a timed script for scenarios 1-3 and a recording checklist. A silent Playwright walkthrough exists as a base/reference only (recorded against localhost, no narration) — the actual submission needs a real recording against the **deployed** URL, narrated, uploaded to YouTube per the official rules |
| 12 | README / submission materials | **PASS** | `README.md` covers Problem / Why existing approaches are insufficient / Solution / Agent architecture / Governance / Business impact / Google Cloud services used / Security / Demo instructions / Deployment / Limitations / Synthetic data disclaimer |
| 13 | Development-period eligibility rule | **Mitigated** | This repo (`asfsei3/revenue-sentinel`) was created fresh and contains only Revenue Sentinel's own history — it has no connection to the pre-existing `ai-orchestra` product beyond having been built by the same coding session. Confirm the exact eligibility rule text yourself, but a dedicated repo with its own from-scratch commit history is the strongest available position |

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
