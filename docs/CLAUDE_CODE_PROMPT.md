# Claude Code build prompt

You are the lead engineer for Revenue Sentinel, an entry for the 5th Agentic AI Hackathon with Google Cloud.

Goal: evolve this local MVP into a production-like hackathon demo using Google Cloud and Gemini.

Non-negotiable:
1. Use Cloud Run for deployment.
2. Use Gemini API or Gemini Enterprise Agent Platform / ADK for agent reasoning.
3. Keep payment data synthetic only. Never request/store PAN/CVC or real payment credentials.
4. No real fund movement or real payment API execution.
5. Every agent decision must expose evidence, confidence, proposed action, governance classification, and timestamp.
6. Risky actions must require human approval; high-risk actions must be blocked.
7. Add prompt-injection defense to the governance layer.
8. Keep the demo reliable and visually clear over architectural complexity.

Build order:
A. Add Gemini provider abstraction with MOCK and GEMINI modes.
B. Implement tool-calling agents: Signal, Diagnosis, Revenue Impact, Recovery, Governance, Observability.
C. Add a deterministic synthetic incident dataset and replay endpoint.
D. Add Firestore or BigQuery persistence only if it improves the demo without destabilizing it.
E. Add Pub/Sub only after the synchronous demo is stable.
F. Add Cloud Logging-friendly structured logs.
G. Add Docker/Cloud Run deployment instructions and environment variable documentation.
H. Add tests for governance rules and prompt-injection scenarios.
I. Add architecture diagram source (Mermaid) and a 3-minute demo script.

Before changing code, inspect the repository and preserve the working local demo. Do not over-engineer. At each step run tests/build and report what changed, what is verified, and what remains.
