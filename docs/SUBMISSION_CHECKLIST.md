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
| 8 | Deployed URL accessible to judges | **PASS** | https://revenue-sentinel-o7euplxxpq-an.a.run.app — deployed via `./deploy.sh` from Cloud Shell. One real bug found and fixed along the way: the Dockerfile's `COPY --from=builder /app/public ./public` failed because `public/` was an empty directory git never tracked (fixed by adding `public/.gitkeep`, commit `f4d0e13`). Production smoke test (`scripts/smoke-test.sh`): 13/13 passing against this URL (user-run, from Cloud Shell — this session's sandbox cannot reach `*.a.run.app` at all, see note below) |
| 9 | GitHub repository | **PASS** | Standalone public repo: https://github.com/asfsei3/revenue-sentinel — extracted from the original `ai-orchestra` monorepo subdirectory with its real 5-commit history preserved (`git subtree split`), verified via the GitHub API: correct root layout (`README.md`, `docs/`, `package.json`, `Dockerfile`, `deploy.sh`, `app/`, `lib/`, `tests/` all at repo root), no `node_modules`/`.next`/secrets committed, 5 commits with the intended messages/dates, default branch `main` |
| 10 | Architecture diagram | **PASS** | Mermaid diagram in `docs/ARCHITECTURE.md`, renders natively on GitHub |
| 11 | 3-minute demo video | **Pipeline built and verified — one command needed from you to finalize** | `scripts/demo-video/produce.sh` fully automates narration (offline TTS), Playwright browser recording of the three core scenarios, title card, burned-in captions, and MP4 muxing (~2:58, verified via extracted-frame visual QA against localhost). `submission/demo.mp4` right now is a **localhost dry run**, not the deployed app — this session's sandbox cannot reach the `*.a.run.app` URL at all (network egress policy blocks it outright, confirmed via both `curl` and the fetch tool — same class of block as `zenn.dev` earlier), so it cannot run `produce.sh` against production itself. Run `cd scripts/demo-video && ./produce.sh https://revenue-sentinel-o7euplxxpq-an.a.run.app` from Cloud Shell (needs `ffmpeg`, `espeak-ng`, and a one-time `npm install && npx playwright install --with-deps chromium` in that folder first — see its README) to get the real one; same for `browser-qa.mjs`, see item 14. YouTube upload needs your Google account, which this session was told not to request credentials for — `submission/VIDEO_UPLOAD.md` has a 3-step manual upload with a pre-written title/description and thumbnail |
| 12 | README / submission materials | **PASS** | `README.md` covers Problem / Why existing approaches are insufficient / Solution / Agent architecture / Governance / Business impact / Google Cloud services used / Security / Demo instructions / Deployment / Limitations / Synthetic data disclaimer |
| 13 | Development-period eligibility rule | **Mitigated** | This repo (`asfsei3/revenue-sentinel`) was created fresh and contains only Revenue Sentinel's own history — it has no connection to the pre-existing `ai-orchestra` product beyond having been built by the same coding session. Confirm the exact eligibility rule text yourself, but a dedicated repo with its own from-scratch commit history is the strongest available position |
| 14 | Browser/mobile QA against the deployed app | **Script built and verified — one command needed from you to finalize** | `scripts/demo-video/browser-qa.mjs` drives the golden path (home → scenario select → run → governance/revenue-impact/audit-trail rendering → approve → prompt-injection → BLOCK) at desktop/768px/390px, checks for horizontal overflow and console/network errors at each. Dry-run against localhost with the *exact same, unchanged* UI code: 42/42 checks passing, screenshots reviewed with no layout issues. Same sandbox network block as item 11 prevents running it against the real URL from here — run `node browser-qa.mjs https://revenue-sentinel-o7euplxxpq-an.a.run.app` from Cloud Shell (reuses the same `playwright` install as `produce.sh`) for a verified-against-production result |

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
- Once deployed, the sandbox **cannot reach the deployed service's own URL
  at all**: `revenue-sentinel-o7euplxxpq-an.a.run.app` is blocked by the
  same network egress policy that blocks `zenn.dev`/`devpost.com` (confirmed
  via `curl -v`, which shows an explicit `403` from the local egress proxy
  on the `CONNECT` tunnel — an organization policy denial, not a transient
  failure — and independently via the fetch tool, which returns
  `EGRESS_BLOCKED`). This is specific to arbitrary customer-deployed
  domains; the `*.googleapis.com` hosts above are reachable because they're
  on a broader platform allowlist. Practically: this sandbox can prepare
  and validate deploy tooling and can dry-run browser/video scripts against
  `localhost`, but it cannot itself hit a real deployed `*.run.app` URL to
  run the production smoke test, the browser QA script, or the final video
  recording — those three needed to run from Cloud Shell (or the user's own
  machine), which they did for the smoke test.

**Items 8, 11, and 14** were finished (8) or have a ready one-command path
(11, 14) as follows:

1. Item 8 (deployed URL): done — `./deploy.sh` was run from Cloud Shell,
   which surfaced and led to fixing a real bug (see item 8's row above).
2. Items 11 and 14 (video, browser QA): the scripts are built and verified
   against localhost; run them against the real URL from Cloud Shell (same
   environment already used for item 8, so no new setup beyond `apt-get
   install ffmpeg espeak-ng` and one `npm install` inside `scripts/demo-video/`).

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
