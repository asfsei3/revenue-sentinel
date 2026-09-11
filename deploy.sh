#!/usr/bin/env bash
# One-shot Cloud Run deploy for Revenue Sentinel.
#
# Usage (recommended — key never touches shell history or a command-line arg):
#   ./deploy.sh
#   -> prompts silently for a Gemini API key (press Enter to skip and deploy
#      in mock-only mode instead).
#
# Non-interactive usage (CI, scripted runs):
#   GEMINI_API_KEY=AIza... ./deploy.sh --non-interactive
#   -> still avoids shell history if the caller exports the var from a file
#      (e.g. `export GEMINI_API_KEY=$(cat key.txt)`) rather than typing it
#      inline. `--gemini-key=...` is also accepted but is the least safe
#      option (ends up in shell history and `ps`) — prefer the env var or
#      the interactive prompt.
#
# Run this from Google Cloud Shell (recommended — gcloud is preinstalled and
# already authenticated) or any machine with the gcloud CLI installed and
# `gcloud auth login` already done. See docs/DEPLOY.md for manual
# step-by-step commands if you'd rather not use this script.
#
# Required inputs (all account-specific — this script never guesses them):
#   - An active gcloud project with billing enabled
#     (`gcloud config set project YOUR_PROJECT_ID` first if not already set)
#   - Optionally, a Gemini API key (from https://aistudio.google.com/apikey)
#     to enable real Gemini reasoning instead of mock-only mode
set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-revenue-sentinel}"
REGION="${REGION:-asia-northeast1}"
GEMINI_KEY="${GEMINI_API_KEY:-}"
NON_INTERACTIVE=false

for arg in "$@"; do
  case "$arg" in
    --gemini-key=*) GEMINI_KEY="${arg#*=}" ;;
    --region=*) REGION="${arg#*=}" ;;
    --service=*) SERVICE_NAME="${arg#*=}" ;;
    --non-interactive) NON_INTERACTIVE=true ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: $0 [--gemini-key=API_KEY] [--region=asia-northeast1] [--service=revenue-sentinel] [--non-interactive]" >&2
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

# Interactive, silent prompt for the Gemini key if one wasn't already supplied
# via --gemini-key or the GEMINI_API_KEY env var. Nothing typed here is ever
# echoed, logged, or written to shell history.
if [ -z "$GEMINI_KEY" ] && [ "$NON_INTERACTIVE" = false ] && [ -t 0 ]; then
  echo "Gemini API key (from https://aistudio.google.com/apikey)."
  echo "Press Enter to skip and deploy in mock-only mode instead."
  read -r -s -p "Gemini API key: " GEMINI_KEY
  echo
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
  unset GEMINI_KEY

  PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
  gcloud secrets add-iam-policy-binding "$SECRET_NAME" \
    --project "$PROJECT_ID" \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor" >/dev/null

  DEPLOY_ARGS+=(
    --set-env-vars "AGENT_MODE=gemini,GEMINI_MODEL=gemini-2.0-flash"
    --set-secrets "GEMINI_API_KEY=${SECRET_NAME}:latest"
  )
  GEMINI_ENABLED=true
else
  DEPLOY_ARGS+=(--set-env-vars "AGENT_MODE=mock")
  GEMINI_ENABLED=false
fi

echo "==> Deploying (this builds the Dockerfile via Cloud Build, no local Docker needed)..."
gcloud "${DEPLOY_ARGS[@]}"

echo
SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')"
REVISION="$(gcloud run services describe "$SERVICE_NAME" --project "$PROJECT_ID" --region "$REGION" --format='value(status.latestReadyRevisionName)')"

echo "==> Checking health (GET /api/scenarios)..."
HEALTH_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "${SERVICE_URL}/api/scenarios" || echo "000")"

cat <<SUMMARY

===================== Deployment summary =====================
Service URL:  ${SERVICE_URL}
Revision:     ${REVISION}
Region:       ${REGION}
Project:      ${PROJECT_ID}
Gemini mode:  $([ "$GEMINI_ENABLED" = true ] && echo "enabled (AGENT_MODE=gemini)" || echo "disabled (AGENT_MODE=mock)")
Health check: $([ "$HEALTH_CODE" = "200" ] && echo "OK (HTTP 200)" || echo "FAILED (HTTP ${HEALTH_CODE}) -- check: gcloud run services logs read ${SERVICE_NAME} --region ${REGION}")
================================================================

Next: run the production smoke test against this URL:
    ./scripts/smoke-test.sh "${SERVICE_URL}"
SUMMARY
