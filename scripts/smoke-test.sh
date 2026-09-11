#!/usr/bin/env bash
# Production smoke test for a deployed Revenue Sentinel instance.
#
# Usage: ./scripts/smoke-test.sh https://revenue-sentinel-xxxxx.a.run.app
#
# Verifies the *actual agent pipeline* is running in production, not just
# that the server responds: runs three real incidents (decline spike, state
# drift, prompt injection) through POST /api/investigate and asserts on the
# governance decision, agent step count, and audit trail each produces, then
# exercises the human-approval endpoint's BLOCK-cannot-be-approved guarantee.
set -euo pipefail

URL="${1:-}"
if [ -z "$URL" ]; then
  echo "Usage: $0 <deployed-url>" >&2
  exit 1
fi
URL="${URL%/}"

PASS=0
FAIL=0

check() {
  local name="$1"
  local result="$2"
  if [ "$result" = "true" ]; then
    echo "  [PASS] $name"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] $name"
    FAIL=$((FAIL + 1))
  fi
}

echo "== A. Application loads =="
HOME_STATUS="$(curl -s -o /tmp/rs-home.html -w '%{http_code}' --max-time 15 "$URL/")"
check "GET / returns 200" "$([ "$HOME_STATUS" = "200" ] && echo true || echo false)"
check "Home page mentions Revenue Sentinel" "$(grep -q "Revenue Sentinel" /tmp/rs-home.html && echo true || echo false)"

echo "== B. Scenario list loads =="
SCENARIOS_JSON="$(curl -s --max-time 15 "$URL/api/scenarios")"
echo "$SCENARIOS_JSON" > /tmp/rs-scenarios.json
SCENARIO_COUNT="$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/rs-scenarios.json','utf8')).scenarios.length)" 2>/dev/null || echo 0)"
check "At least 3 scenarios returned (got $SCENARIO_COUNT)" "$([ "$SCENARIO_COUNT" -ge 3 ] && echo true || echo false)"
GEMINI_AVAILABLE="$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/rs-scenarios.json','utf8')).geminiAvailable)" 2>/dev/null || echo false)"
echo "     geminiAvailable: $GEMINI_AVAILABLE"

run_scenario() {
  local id="$1"
  curl -s --max-time 30 -X POST "$URL/api/investigate" -H 'Content-Type: application/json' -d "{\"scenarioId\":\"$id\"}"
}

echo "== C. Decline spike scenario =="
DECLINE_JSON="$(run_scenario psp-a-decline-spike)"
echo "$DECLINE_JSON" > /tmp/rs-decline.json
DECLINE_DECISION="$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/rs-decline.json','utf8')).incident.governance.decision)" 2>/dev/null || echo ERROR)"
DECLINE_STEPS="$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/rs-decline.json','utf8')).incident.steps.length)" 2>/dev/null || echo 0)"
DECLINE_ID="$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/rs-decline.json','utf8')).incident.id)" 2>/dev/null || echo "")"
check "Governance decision is APPROVAL (got $DECLINE_DECISION)" "$([ "$DECLINE_DECISION" = "APPROVAL" ] && echo true || echo false)"
check "All 6 agent steps ran (got $DECLINE_STEPS)" "$([ "$DECLINE_STEPS" = "6" ] && echo true || echo false)"

echo "== D. Webhook/state drift scenario =="
DRIFT_JSON="$(run_scenario payment-state-drift)"
echo "$DRIFT_JSON" > /tmp/rs-drift.json
DRIFT_DETECTED="$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/rs-drift.json','utf8')).incident.signal.stateDriftDetected)" 2>/dev/null || echo false)"
DRIFT_DECISION="$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/rs-drift.json','utf8')).incident.governance.decision)" 2>/dev/null || echo ERROR)"
check "State drift detected" "$([ "$DRIFT_DETECTED" = "true" ] && echo true || echo false)"
check "Governance decision is AUTO (got $DRIFT_DECISION)" "$([ "$DRIFT_DECISION" = "AUTO" ] && echo true || echo false)"

echo "== E/F. Prompt injection scenario -> Governance BLOCK =="
INJECT_JSON="$(run_scenario prompt-injection-attempt)"
echo "$INJECT_JSON" > /tmp/rs-inject.json
INJECT_DECISION="$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/rs-inject.json','utf8')).incident.governance.decision)" 2>/dev/null || echo ERROR)"
INJECT_FINDINGS="$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/rs-inject.json','utf8')).incident.governance.securityFindings.length)" 2>/dev/null || echo 0)"
INJECT_ID="$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/rs-inject.json','utf8')).incident.id)" 2>/dev/null || echo "")"
check "Governance decision is BLOCK (got $INJECT_DECISION)" "$([ "$INJECT_DECISION" = "BLOCK" ] && echo true || echo false)"
check "Security findings recorded (got $INJECT_FINDINGS)" "$([ "$INJECT_FINDINGS" -ge 1 ] && echo true || echo false)"

if [ -n "$INJECT_ID" ]; then
  BLOCK_APPROVE_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -X POST "$URL/api/incidents/$INJECT_ID/approve" -H 'Content-Type: application/json' -d '{"decision":"approve","actor":"smoke-test"}')"
  check "Approving a BLOCKed incident is refused (HTTP 409, got $BLOCK_APPROVE_CODE)" "$([ "$BLOCK_APPROVE_CODE" = "409" ] && echo true || echo false)"
fi

echo "== G. Recovery / human approval flow =="
if [ -n "$DECLINE_ID" ]; then
  APPROVE_JSON="$(curl -s --max-time 15 -X POST "$URL/api/incidents/$DECLINE_ID/approve" -H 'Content-Type: application/json' -d '{"decision":"approve","actor":"smoke-test"}')"
  echo "$APPROVE_JSON" > /tmp/rs-approve.json
  APPROVE_STATUS="$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/rs-approve.json','utf8')).incident.status)" 2>/dev/null || echo ERROR)"
  check "APPROVAL incident can be approved (status -> $APPROVE_STATUS)" "$([ "$APPROVE_STATUS" = "approved" ] && echo true || echo false)"
fi

echo "== H. Observability / decision trail =="
AUDIT_JSON="$(curl -s --max-time 15 "$URL/api/audit")"
echo "$AUDIT_JSON" > /tmp/rs-audit.json
AUDIT_COUNT="$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/rs-audit.json','utf8')).auditLog.length)" 2>/dev/null || echo 0)"
check "Audit trail has entries across incidents (got $AUDIT_COUNT)" "$([ "$AUDIT_COUNT" -ge 1 ] && echo true || echo false)"

echo "== I. Gemini reasoningMode =="
DECLINE_DIAG_MODE="$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/rs-decline.json','utf8')).incident.steps.find(s=>s.agent==='diagnosis').reasoningMode)" 2>/dev/null || echo unknown)"
echo "     diagnosis reasoningMode: $DECLINE_DIAG_MODE"
if [ "$GEMINI_AVAILABLE" = "true" ]; then
  GEMINI_JSON="$(curl -s --max-time 30 -X POST "$URL/api/investigate" -H 'Content-Type: application/json' -d '{"scenarioId":"psp-a-decline-spike","mode":"gemini"}')"
  echo "$GEMINI_JSON" > /tmp/rs-gemini.json
  GEMINI_MODE="$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/rs-gemini.json','utf8')).incident.mode)" 2>/dev/null || echo unknown)"
  check "Gemini-mode request actually used gemini (got $GEMINI_MODE)" "$([ "$GEMINI_MODE" = "gemini" ] && echo true || echo false)"
else
  echo "  [SKIP] geminiAvailable=false on this deployment (AGENT_MODE=mock or no GEMINI_API_KEY) -- expected unless deployed with --gemini-key"
fi

echo
echo "== J. Mobile viewport =="
echo "  [MANUAL/SEPARATE] Not covered by this curl-only script -- run the"
echo "  Playwright-based browser check (desktop + 390px + 768px) separately;"
echo "  see docs/DEPLOY.md."

echo
echo "===================== Smoke test summary ====================="
echo "PASS: $PASS   FAIL: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo "Some checks failed -- see above. Do not consider the deployment done."
  exit 1
fi
echo "All automated checks passed."
