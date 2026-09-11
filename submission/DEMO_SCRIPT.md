# Revenue Sentinel — 3-minute demo script

## Setup

- Have the **deployed Cloud Run URL** open (not localhost — judges should
  see it's actually running on Google Cloud), scenario selector set to
  **"PSP-A authorization rate drop"**.
- Reasoning mode toggle visible (Mock / Gemini) so the audience sees the
  provider abstraction is real, not just a label.
- Know the deployed URL will show `AGENT_MODE=gemini` if you configured it
  — if so, let at least one run actually use Gemini so a `reasoning:
  gemini` badge is visible on screen at some point.

## Script

**0:00–0:20 — Problem**
"Payment incidents are usually detected as a technical number — a decline
rate, a webhook delay. The business impact and the recovery decision stay
fragmented, discovered by different people later. Revenue Sentinel connects
signal to a governed decision, autonomously, in one pipeline."

**0:20–1:10 — Normal incident: decline spike**
Select **"PSP-A authorization rate drop"**, click **Run incident
investigation**. Narrate over the Agent trajectory panel as Signal,
Diagnosis, and Revenue Impact complete in sequence: "Signal detects the
authorization-rate drop. Diagnosis explains the likely cause — notice it's
using Signal's output, not guessing independently. Revenue Impact turns
that into a number: estimated recoverable revenue this window, and a
monthly run-rate estimate — labeled clearly as an AI-estimated figure from
synthetic data, not a measured fact." Point at the "input: Signal Agent"
badge to make the chaining explicit.

**1:10–1:50 — Autonomous recovery: proposal → governance**
Point at the Recovery card: "Recovery proposes one action, using both
Diagnosis and Revenue Impact as input" (point at the "input: Diagnosis +
Revenue Impact" badge and the "Based on..." evidence lines). "Governance
classifies it — here, `APPROVAL`, because it touches payment routing. Low-
risk actions in other scenarios get `AUTO`. Nothing is ever executed for
real in this MVP — no code path here can call a real payment API."

**1:50–2:20 — Security: prompt injection**
Switch to **"PSP-A decline spike + embedded prompt injection"**, run it.
Point at the security findings panel and the **BLOCK** badge: "One event's
customer-note field contains an embedded instruction trying to get the
pipeline to auto-approve a refund and disable logging. Governance detects
it, never follows it, and force-blocks the action — and the human-approval
API itself refuses to override a BLOCK server-side, so this isn't just a UI
check."

**2:20–2:50 — Observability**
Scroll to the audit trail panel: "Every step — evidence, confidence,
reasoning mode, timestamp — is recorded here, and as structured logs
Cloud Logging picks up automatically. Nothing about this incident's
handling is a black box." *(Optional, if time allows: mention the third
scenario, "payment/webhook state drift," which catches a webhook-vs-ledger
reconciliation gap that a decline-rate dashboard wouldn't even flag.)*

**2:50–3:00 — Closing**
"Revenue Sentinel connects payment signals, AI investigation, revenue
impact, recovery, and governance into one autonomous control loop — running
on Cloud Run, reasoning with Gemini, and never executing anything risky
without a human in the loop."

## Fallback plan

If Gemini mode is toggled on and the network is unreliable during the live
demo, switch back to **Mock** reasoning mode — the entire pipeline is
deterministic in that mode and requires no external network access.

## Recording checklist

- [ ] Recorded against the **deployed Cloud Run URL**, not localhost
- [ ] At least one run shows a `reasoning: gemini` badge (if Gemini was
      configured for the deploy)
- [ ] All three core scenarios are shown or explicitly mentioned: decline
      spike, prompt injection, state drift
- [ ] The `BLOCK` badge and the security-findings list are clearly visible
      and readable at video resolution
- [ ] Total runtime at or under 3:00
