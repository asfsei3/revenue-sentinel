# Deploying to Google Cloud Run

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
