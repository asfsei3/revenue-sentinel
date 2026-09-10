#!/usr/bin/env bash
# One-shot Cloud Run deploy for Revenue Sentinel.
#
# Usage:
#   ./deploy.sh                          # mock mode, no Gemini
#   ./deploy.sh --gemini-key=AIza...      # also configures Gemini reasoning
#     via Secret Manager and sets AGENT_MODE=gemini
#
# Run this from Google Cloud Shell (recommended — gcloud is preinstalled and
# already authenticated) or any machine with the gcloud CLI installed and
# `gcloud auth login` already done. See docs/DEPLOY.md for details and
# manual step-by-step commands if you'd rather not use this script.
set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-revenue-sentinel}"
REGION="${REGION:-asia-northeast1}"
GEMINI_KEY=""

for arg in "$@"; do
  case "$arg" in
    --gemini-key=*) GEMINI_KEY="${arg#*=}" ;;
    --region=*) REGION="${arg#*=}" ;;
    --service=*) SERVICE_NAME="${arg#*=}" ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: $0 [--gemini-key=API_KEY] [--region=asia-northeast1] [--service=revenue-sentinel]" >&2
      exit 1
      ;;
  esac
done

if ! command -v gcloud >/dev/null 2>&1; then
  echo "ERROR: gcloud CLI not found. Run this from Google Cloud Shell (https://shell.cloud.google.com/)" >&2
  echo "or install the SDK: https://cloud.google.com/sdk/docs/install" >&2
  exit 1
fi

PROJECT_ID="$(gcloud config get-value project 2>/dev/null || true)"
if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "(unset)" ]; then
  echo "ERROR: no active gcloud project. Run: gcloud config set project YOUR_PROJECT_ID" >&2
  exit 1
fi

echo "==> Project:  $PROJECT_ID"
echo "==> Region:   $REGION"
echo "==> Service:  $SERVICE_NAME"
echo "==> Gemini:   $([ -n "$GEMINI_KEY" ] && echo enabled || echo "disabled (mock mode only)")"
echo

echo "==> Enabling required APIs (no-op if already enabled)..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  $([ -n "$GEMINI_KEY" ] && echo secretmanager.googleapis.com) --project "$PROJECT_ID"

DEPLOY_ARGS=(
  run deploy "$SERVICE_NAME"
  --source .
  --region "$REGION"
  --project "$PROJECT_ID"
  --allow-unauthenticated
)

if [ -n "$GEMINI_KEY" ]; then
  SECRET_NAME="${SERVICE_NAME}-gemini-key"
  echo "==> Storing Gemini API key in Secret Manager as '$SECRET_NAME'..."
  if gcloud secrets describe "$SECRET_NAME" --project "$PROJECT_ID" >/dev/null 2>&1; then
    printf '%s' "$GEMINI_KEY" | gcloud secrets versions add "$SECRET_NAME" --project "$PROJECT_ID" --data-file=-
  else
    printf '%s' "$GEMINI_KEY" | gcloud secrets create "$SECRET_NAME" --project "$PROJECT_ID" --data-file=-
  fi

  PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
  gcloud secrets add-iam-policy-binding "$SECRET_NAME" \
    --project "$PROJECT_ID" \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor" >/dev/null

  DEPLOY_ARGS+=(
    --set-env-vars "AGENT_MODE=gemini,GEMINI_MODEL=gemini-2.0-flash"
    --set-secrets "GEMINI_API_KEY=${SECRET_NAME}:latest"
  )
else
  DEPLOY_ARGS+=(--set-env-vars "AGENT_MODE=mock")
fi

echo "==> Deploying (this builds the Dockerfile via Cloud Build, no local Docker needed)..."
gcloud "${DEPLOY_ARGS[@]}"

echo
SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')"
echo "==> Deployed: $SERVICE_URL"
echo "==> Smoke test:"
echo "    curl -s ${SERVICE_URL}/api/scenarios | head -c 300; echo"
