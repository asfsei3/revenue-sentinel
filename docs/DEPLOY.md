# Deploying to Google Cloud Run

## Fastest path: Google Cloud Shell + deploy.sh

[Cloud Shell](https://shell.cloud.google.com/) has `gcloud` preinstalled and
already authenticated as you — no local setup at all. From a Cloud Shell
terminal:

```bash
git clone https://github.com/<owner>/<repo>.git
cd <repo>/revenue-sentinel
gcloud config set project YOUR_PROJECT_ID   # if not already set
./deploy.sh                                  # mock mode
# or, to also wire up real Gemini reasoning:
./deploy.sh --gemini-key=YOUR_GEMINI_API_KEY
```

This runs `gcloud services enable`, then `gcloud run deploy --source .`
(Cloud Build builds the included `Dockerfile`, no local Docker needed), and
prints the deployed service URL plus a one-line smoke test. Takes about
3-5 minutes end to end. See below for what it does under the hood, or to
run the steps manually.

## Prerequisites

- `gcloud` CLI installed and authenticated (`gcloud auth login`)
- A Google Cloud project with billing enabled and the Cloud Run and Cloud
  Build (or Artifact Registry) APIs enabled:

  ```bash
  gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
  ```

## One-command deploy (builds from source, no local Docker needed)

From the `revenue-sentinel/` directory:

```bash
gcloud run deploy revenue-sentinel \
  --source . \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --set-env-vars AGENT_MODE=mock
```

`--source .` uses Cloud Build to build the included `Dockerfile` and push it
to Artifact Registry automatically — no local Docker daemon required.

## Enabling Gemini reasoning

By default the app runs in deterministic `AGENT_MODE=mock` — no external
calls, so the demo never depends on network access during a live
presentation. To let the Diagnosis Agent call Gemini:

```bash
gcloud run deploy revenue-sentinel \
  --source . \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --set-env-vars AGENT_MODE=gemini,GEMINI_MODEL=gemini-2.0-flash \
  --set-secrets GEMINI_API_KEY=revenue-sentinel-gemini-key:latest
```

This assumes the API key was stored in Secret Manager first:

```bash
printf '%s' "$YOUR_GEMINI_API_KEY" | gcloud secrets create revenue-sentinel-gemini-key --data-file=-
gcloud secrets add-iam-policy-binding revenue-sentinel-gemini-key \
  --member="serviceAccount:$(gcloud projects describe "$(gcloud config get-value project)" --format='value(projectNumber)')-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

Even with `AGENT_MODE=gemini`, any Gemini call failure (network error,
timeout, malformed response) falls back to the deterministic mock result
for that step — see `lib/gemini/client.ts` — so enabling Gemini never makes
the demo less reliable.

## Local Docker build (optional, if you want to build the image yourself)

```bash
docker build -t revenue-sentinel .
docker run -p 8080:8080 -e AGENT_MODE=mock revenue-sentinel
```

## Environment variables

See `.env.example` for the full list. Cloud Run injects `PORT` automatically
— do not set it manually in `--set-env-vars`.

## Post-deploy verification checklist

A successful `gcloud run deploy` is not the finish line — confirm the
deployed app actually works before calling it done:

```bash
SERVICE_URL="$(gcloud run services describe revenue-sentinel --region asia-northeast1 --format='value(status.url)')"

# 1. Scenarios load
curl -s "$SERVICE_URL/api/scenarios" | head -c 500; echo

# 2. Agent pipeline executes end to end (decline-spike scenario)
curl -s -X POST "$SERVICE_URL/api/investigate" -H 'Content-Type: application/json' \
  -d '{"scenarioId":"psp-a-decline-spike"}' | head -c 800; echo

# 3. Governance BLOCK + prompt-injection defense
curl -s -X POST "$SERVICE_URL/api/investigate" -H 'Content-Type: application/json' \
  -d '{"scenarioId":"prompt-injection-attempt"}' | grep -o '"decision":"[A-Z]*"'
```

Then open `$SERVICE_URL` in a browser (desktop and a phone or narrow
window) and actually click through: pick each of the three core scenarios,
run an investigation, approve/reject where applicable, and check the audit
trail panel populates. Cloud Logging (`gcloud run services logs read
revenue-sentinel --region asia-northeast1`) should show the structured
`agent_step_completed` / `incident_finalized` JSON lines from
`lib/logger.ts`.

If Gemini mode was enabled, confirm at least one step's `reasoningMode` in
the JSON response reads `"gemini"` (not just `"mock"`) — that's the proof
Gemini was actually called, not merely configured.

## Note on this repository's own deployment status

This Dockerfile, `deploy.sh`, and the steps above were all built and
verified locally (production build, standalone server smoke test — see
README.md) from inside an automated coding-agent sandbox that does not have
`gcloud` installed and cannot install it (its distribution domains are
network-egress-blocked in that sandbox, and it has no Docker daemon either).
That sandbox could reach the Cloud Run/Cloud Build/Artifact Registry APIs
directly over HTTPS, so deployment is not blocked by connectivity — only by
the sandbox lacking a GCP project, credentials, and the `gcloud` binary
itself. Running `./deploy.sh` from Cloud Shell or a normal developer machine
is the expected path and takes a few minutes.
