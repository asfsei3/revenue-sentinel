# YouTube upload — manual step

This session cannot upload to YouTube: doing so needs Google account
OAuth credentials, and it was explicitly told not to request or handle
those. What's prepared below gets you to a 3-step manual upload.

## Before uploading

Make sure `demo.mp4` in this folder was produced against the **deployed**
Cloud Run URL, not localhost — re-run
`scripts/demo-video/produce.sh <deployed-url>` first if not (see that
folder's README; takes about 5-10 minutes).

## Suggested title

Revenue Sentinel — Autonomous Payment Incident Control Tower (Google Cloud Japan Agentic AI Hackathon Vol.5)

## Suggested description

```
Revenue Sentinel is a six-agent pipeline that turns a payment incident into
a governed, audited recovery decision: Signal -> Diagnosis -> Revenue Impact
-> Recovery -> Governance -> Observability.

Two agents (Diagnosis, Recovery) reason with the Gemini API; a fixed
governance policy table -- not a model judgment -- classifies every
proposed action AUTO / APPROVAL / BLOCK, and a detected prompt-injection
attempt in incident data force-blocks the action server-side, even against
a direct approval-API call.

Built on Cloud Run, Gemini API, Secret Manager, and Cloud Logging.

Synthetic payment data only. No real cardholder data, no real payment
execution -- this is a hackathon prototype, not production payment
infrastructure.

GitHub: https://github.com/asfsei3/revenue-sentinel
```

## Suggested visibility

**Unlisted** or **Public** — check the hackathon's submission rules for
which is required (a private video is generally not accessible to judges).

## Suggested thumbnail

`thumbnail.png` in this folder (the video's own title card).

## 3-step manual upload

1. Go to https://studio.youtube.com/ → **Create** → **Upload videos**, and
   select `demo.mp4` from this folder.
2. Paste the title and description above, upload `thumbnail.png` as the
   custom thumbnail, and set visibility to Unlisted or Public per the
   hackathon's rules.
3. Once processing finishes, copy the video URL into `SUBMISSION_TEXT.md`'s
   "Video URL" field (and into the Zenn submission form).
