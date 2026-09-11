# Submission Package — Revenue Sentinel

Google Cloud Japan Agentic AI Hackathon Vol.5. This folder is a snapshot of
the materials needed to submit, copied from the main repo's `docs/` (source
of truth — if these ever look out of sync, `docs/` in the repo root wins).

| File | Purpose |
|---|---|
| `SUBMISSION_TEXT.md` | Project name, summary, problem/solution, Google Cloud technologies, governance, business impact, URLs — the text for the submission form |
| `architecture.png` | Architecture diagram, matches the current implementation exactly (no unused services shown) |
| `DEMO_SCRIPT.md` | Timed ~3-minute script the demo video follows |
| `demo.mp4` | The demo video — see status note below (currently a **localhost dry run**, not final) |
| `CHECKLIST.md` | Requirement-by-requirement PASS/GAP tracking for this submission |

Produced by `scripts/demo-video/produce.sh` — narration (offline TTS),
Playwright browser recording, title card, captions, and final MP4 muxing,
fully automated. See that folder's README for how to re-run it.

## Status

- [x] GitHub repository — https://github.com/asfsei3/revenue-sentinel
- [ ] Cloud Run deployment — pending (`./deploy.sh` from Cloud Shell)
- [x] Architecture diagram
- [x] Submission text drafted (URLs need filling in after deploy + video upload)
- [x] Demo video pipeline built and verified (narration + recording + captions
      + muxing, ~2:58 total) — **but `demo.mp4` here is a localhost dry run**.
      Re-run `scripts/demo-video/produce.sh <deployed-url>` once Cloud Run is
      live to get the real submission video (same command, ~5-10 minutes,
      output lands right back in this file)
- [ ] YouTube upload — this session has no way to authenticate to YouTube and
      was told not to ask for those credentials; upload `demo.mp4` manually
      (see `SUBMISSION_TEXT.md` for the suggested title/description)

Fill in `SUBMISSION_TEXT.md`'s "Demo URL" and "Video URL" fields once those
exist, then this folder is ready to hand to the Zenn submission form.
