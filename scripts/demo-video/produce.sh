#!/usr/bin/env bash
# Produces the hackathon SUBMISSION demo video: Japanese captions only, NO
# audio track, <=180s, 1280x720. The browser recording itself (record.js)
# is unchanged from the English version -- only the title card duration,
# caption language/timing, and final mux (no narration, no audio) differ.
#
# The original English-narrated, audio-included pipeline is preserved as
# produce-en-narrated.sh (not deleted) in case that version is needed
# again -- this script no longer generates or depends on it.
#
# Usage:
#   cd scripts/demo-video
#   npm install && npx playwright install --with-deps chromium   # one-time
#   apt-get install -y ffmpeg fonts-noto-cjk                     # one-time
#   ./produce.sh https://revenue-sentinel-xxxxx.a.run.app          # deployed
#   ./produce.sh http://localhost:3000                             # dry run
#
# Requires: node, ffmpeg, fonts-noto-cjk. No espeak-ng/TTS dependency in
# this flow -- there is no narration to generate.
# Output: revenue-sentinel-demo-ja-silent.mp4 in this directory, copied to
# ../../submission/demo.mp4.
set -euo pipefail
cd "$(dirname "$0")"

BASE_URL="${1:-}"
if [ -z "$BASE_URL" ]; then
  echo "Usage: $0 <base-url>" >&2
  exit 1
fi

# Trimmed from the English version's 3s to help keep the total under 180s;
# record.js's own recorded-segment timings are untouched.
TITLE_CARD_SECONDS=2
# Hard safety cap: whatever the real recorded timing comes out to (browser/
# network timing is never perfectly reproducible across environments), the
# final output is truncated here so "<=180s" holds unconditionally. In
# practice the recorded content (title + segments) comes in under this, so
# the cap is a safety net, not the normal path.
MAX_DURATION=179

for cmd in node ffmpeg; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: $cmd not found. See the prerequisites in this script's header comment." >&2
    exit 1
  fi
done
FC_LIST_OUTPUT="$(fc-list)"
if ! echo "$FC_LIST_OUTPUT" | grep -qi "Noto Sans CJK JP"; then
  echo "ERROR: Noto Sans CJK JP font not found. Install with: apt-get install -y fonts-noto-cjk" >&2
  exit 1
fi

if [ ! -d node_modules/playwright ]; then
  echo "==> Installing Playwright (one-time)..."
  npm install
  npx playwright install --with-deps chromium
fi

echo "==> 1/4 Recording browser walkthrough against $BASE_URL (record.js, unchanged)..."
node record.js "$BASE_URL"

echo "==> 2/4 Building a ${TITLE_CARD_SECONDS}s title card and concatenating with the recording..."
node -e "
const { chromium } = require('playwright');
(async () => {
  const launchOptions = process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {};
  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto('file://' + require('path').resolve('title-card.html'));
  await page.screenshot({ path: 'title-card.png' });
  await browser.close();
})();
"
ffmpeg -y -loop 1 -i title-card.png -t "$TITLE_CARD_SECONDS" -vf "fps=25,format=yuv420p" -c:v libx264 title-card.mp4 -loglevel error
RAW_VIDEO="$(cat video-filename.txt)"
ffmpeg -y -i "raw-video/$RAW_VIDEO" -vf "fps=25,format=yuv420p" -c:v libx264 -an recorded.mp4 -loglevel error
cat > concat_video_list.txt <<'EOF'
file 'title-card.mp4'
file 'recorded.mp4'
EOF
ffmpeg -y -f concat -safe 0 -i concat_video_list.txt -c copy video_only.mp4 -loglevel error

echo "==> 3/4 Generating Japanese captions (make-captions.js)..."
TITLE_CARD_SECONDS="$TITLE_CARD_SECONDS" node make-captions.js

echo "==> 4/4 Burning captions (Noto Sans CJK JP) into a silent video, capped at ${MAX_DURATION}s..."
ffmpeg -y -i video_only.mp4 \
  -vf "subtitles=captions.srt:force_style='FontName=Noto Sans CJK JP,FontSize=22,PrimaryColour=&H00FFFFFF,BackColour=&H99000000,BorderStyle=4,Outline=0,Shadow=0,MarginV=48'" \
  -an -c:v libx264 -pix_fmt yuv420p -t "$MAX_DURATION" \
  revenue-sentinel-demo-ja-silent.mp4 -loglevel error

DURATION="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 revenue-sentinel-demo-ja-silent.mp4)"
echo "==> Done. Duration: ${DURATION}s"

mkdir -p ../../submission
cp revenue-sentinel-demo-ja-silent.mp4 ../../submission/demo.mp4
echo "Copied to submission/demo.mp4"
echo
echo "Recommended: extract a few frames and eyeball them before submitting:"
echo "    ffmpeg -ss 30 -i revenue-sentinel-demo-ja-silent.mp4 -frames:v 1 check.png"
