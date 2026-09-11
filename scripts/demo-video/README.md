# Demo video production toolkit

Produces the ~3-minute hackathon demo video referenced in
`docs/DEMO_SCRIPT.md`, fully automated: narration (offline TTS), browser
recording (Playwright, against a real running instance — local or
deployed), title card, captions, and final MP4 muxing. Not part of the
app itself — this is a one-off production tool, kept here for
reproducibility.

## Prerequisites

```bash
apt-get install -y ffmpeg espeak-ng          # required
apt-get install -y mbrola mbrola-us1          # optional, less robotic voice
cd scripts/demo-video
npm install
npx playwright install --with-deps chromium   # downloads a matching browser
```

## Usage

```bash
./produce.sh https://revenue-sentinel-xxxxx.a.run.app   # against the deployed app
./produce.sh http://localhost:3000                        # local dry run
```

Output: `revenue-sentinel-demo.mp4` in this directory, also copied to
`../../submission/demo.mp4`.

## How it works

1. `generate-narration.sh` — turns each entry in `segments.json` into a WAV
   clip via `espeak-ng` (offline, no API key, no network dependency) and
   records each clip's actual duration in `durations.json`.
2. `record.js` — drives a real browser through the three core scenarios
   (decline spike, human approval, prompt injection → BLOCK) plus the
   problem/observability/closing beats, recording video the whole time.
   Each segment's on-screen dwell time is a fixed target (tuned to fit
   under 3 minutes total); the *actual* achieved start/end times are
   written to `timeline.json`, since real page-load/animation timing never
   matches a plan exactly.
3. `produce.sh` pads each narration clip to match its actual recorded
   segment duration (`timeline.json`), builds a 3-second title card,
   concatenates everything, generates burned-in captions
   (`make-captions.js`, timed to each clip's *un-padded* narration length
   so a caption doesn't sit on screen for the whole padded segment), and
   muxes audio + video + captions into the final MP4.

## Adjusting the script

- Edit `segments.json` to change narration wording. If a segment's new
  narration runs much longer, bump that segment's number in `TARGETS`
  inside `record.js` so it doesn't get cut short.
- Edit the UI actions/scroll targets directly in `record.js` if the app's
  layout changes enough that a scroll position no longer lands on the
  right element — re-measure with something like:

  ```js
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Approve'));
    return el.getBoundingClientRect().top + window.scrollY;
  });
  ```

## Always re-run against the deployed URL before submitting

A video recorded against `localhost` is a dry run only — the hackathon
wants judges to see the actual Cloud Run deployment working. Re-run
`./produce.sh <deployed-url>` once deployed, then visually spot-check a few
frames (see the tip at the end of `produce.sh`'s output) before uploading.
