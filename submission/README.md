# Submission Package — Revenue Sentinel

Google Cloud Japan Agentic AI Hackathon Vol.5. This folder is a snapshot of
the materials needed to submit, copied from the main repo's `docs/` (source
of truth — if these ever look out of sync, `docs/` in the repo root wins).

| File | Purpose |
|---|---|
| `SUBMISSION_TEXT.md` | Project name, summary, problem/solution, Google Cloud technologies, governance, business impact, URLs — the text for the submission form |
| `architecture.png` | Architecture diagram, matches the current implementation exactly (no unused services shown) |
| `DEMO_SCRIPT.md` | Timed ~3-minute script the demo video follows |
| `demo.mp4` | The demo video, once produced — see status note below |
| `CHECKLIST.md` | Requirement-by-requirement PASS/GAP tracking for this submission |

## Status

- [x] GitHub repository — https://github.com/asfsei3/revenue-sentinel
- [ ] Cloud Run deployment — pending (`./deploy.sh` from Cloud Shell)
- [x] Architecture diagram
- [x] Submission text drafted (URLs need filling in after deploy + video upload)
- [ ] Demo video — pending production deployment (needs the real URL to record against)

Fill in `SUBMISSION_TEXT.md`'s "Demo URL" and "Video URL" fields once those
exist, then this folder is ready to hand to the Zenn submission form.
