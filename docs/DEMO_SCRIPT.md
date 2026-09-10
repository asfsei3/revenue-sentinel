# Revenue Sentinel — 3-minute demo script

## Setup

- Have the deployed Cloud Run URL open, scenario selector set to
  **"PSP-A authorization rate drop"**.
- Reasoning mode toggle visible (Mock / Gemini) so the audience sees the
  provider abstraction is real, not just a label.

## Script

**0:00 – The problem (20s)**
"When a payment incident happens, the technical signal (decline rate,
webhook latency) and the business impact (lost revenue) are discovered by
different teams, at different times. Revenue Sentinel is an agent pipeline
that goes from raw payment signal to a governed, audited recovery decision
autonomously — but never executes anything risky without a human in the
loop."

**0:20 – Trigger the anomaly (15s)**
Select "PSP-A authorization rate drop" and click **Run incident
investigation**. Narrate: "This is synthetic data — no real cardholder
information, no real PSP connection."

**0:35 – Agents investigate (30s)**
Point at the Agent trajectory panel as each of the six agents completes:
Signal detects the drop, Diagnosis explains the likely cause with evidence,
each step showing a confidence score, a reasoning mode badge, and a
timestamp — "this is the full decision trail, not a black box."

**1:05 – Revenue impact (20s)**
Point at the estimated recoverable revenue and monthly run-rate figures:
"This turns a technical decline-rate number into a number a CFO or a
commerce leader will actually act on — clearly labeled as an estimate, not
a guarantee."

**1:25 – Recovery + Governance (30s)**
Show the recommended action (traffic shift + retry) and the **APPROVAL**
badge: "This action touches payment routing, so Governance requires a
human before anything happens. Nothing here calls a real payment API — the
MVP only ever proposes."

**1:55 – Security scenario (35s)**
Switch to the **"PSP-A decline spike + embedded prompt injection"**
scenario and run it. Point at the security findings panel and the **BLOCK**
badge: "One of the incoming events contains text trying to get the pipeline
to auto-approve a refund and disable logging. The Governance Agent detects
it, never follows it, and hard-blocks the action — and the human-approval
API itself refuses to override a BLOCK, so this isn't just a UI-level
check."

**2:30 – Human approval (15s)**
Go back to the APPROVAL-classified incident and click **Approve**: "A human
makes the actual call, and that decision — who, when, what — is written to
the audit trail."

**2:45 – Architecture + next step (15s)**
"This runs on Cloud Run, uses the Gemini API for the diagnosis step with a
deterministic mock fallback for demo reliability, and the next steps are
Firestore-backed persistence and Pub/Sub ingestion from real PSP webhooks."

## Fallback plan

If Gemini mode is toggled on and the network is unreliable during the live
demo, switch back to **Mock** reasoning mode — the entire pipeline is
deterministic in that mode and requires no external network access.
