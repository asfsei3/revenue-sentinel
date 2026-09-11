#!/usr/bin/env bash
# Produces the ~3-minute hackathon demo video end to end:
#   narration (espeak-ng) -> browser recording (Playwright) -> pad audio to
#   the actual recorded segment durations -> title card -> captions -> mux.
#
# Usage:
#   cd scripts/demo-video
#   npm install && npx playwright install --with-deps chromium   # one-time
#   ./produce.sh https://revenue-sentinel-xxxxx.a.run.app          # deployed
#   ./produce.sh http://localhost:3000                             # dry run
#
# Requires: node, ffmpeg, espeak-ng (mbrola + mbrola-us1 optional, for a
# less robotic voice: `apt-get install -y ffmpeg espeak-ng mbrola mbrola-us1`).
# Output: revenue-sentinel-demo.mp4 in this directory, and copied to
# ../../submission/demo.mp4.
set -euo pipefail
cd "$(dirname "$0")"

BASE_URL="${1:-}"
if [ -z "$BASE_URL" ]; then
  echo "Usage: $0 <base-url>" >&2
  exit 1
fi

for cmd in node ffmpeg espeak-ng; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: $cmd not found. See the prerequisites in this script's header comment." >&2
    exit 1
  fi
done

if [ ! -d node_modules/playwright ]; then
  echo "==> Installing Playwright (one-time)..."
  npm install
  npx playwright install --with-deps chromium
fi

echo "==> 1/6 Generating narration audio (espeak-ng)..."
./generate-narration.sh

echo "==> 2/6 Recording browser walkthrough against $BASE_URL ..."
node record.js "$BASE_URL"

echo "==> 3/6 Padding narration to actual recorded segment durations..."
mkdir -p padded
for id in 01-problem 02-decline-spike 03-governance 04-security 05-observability 06-closing; do
  DUR="$(node -e "console.log(require('./timeline.json')['$id'].duration)")"
  ffmpeg -y -i "audio/$id.wav" -af "apad" -t "$DUR" -ar 44100 -ac 1 "padded/$id.wav" -loglevel error
done
ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=mono -t 3 padded/00-title-silence.wav -loglevel error

cat > concat_audio_list.txt <<'EOF'
file 'padded/00-title-silence.wav'
file 'padded/01-problem.wav'
file 'padded/02-decline-spike.wav'
file 'padded/03-governance.wav'
file 'padded/04-security.wav'
file 'padded/05-observability.wav'
file 'padded/06-closing.wav'
EOF
ffmpeg -y -f concat -safe 0 -i concat_audio_list.txt -c copy full_audio.wav -loglevel error

echo "==> 4/6 Building title card + concatenating with the recording..."
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
ffmpeg -y -loop 1 -i title-card.png -t 3 -vf "fps=25,format=yuv420p" -c:v libx264 title-card.mp4 -loglevel error
RAW_VIDEO="$(cat video-filename.txt)"
ffmpeg -y -i "raw-video/$RAW_VIDEO" -vf "fps=25,format=yuv420p" -c:v libx264 -an recorded.mp4 -loglevel error
cat > concat_video_list.txt <<'EOF'
file 'title-card.mp4'
file 'recorded.mp4'
EOF
ffmpeg -y -f concat -safe 0 -i concat_video_list.txt -c copy video_only.mp4 -loglevel error

echo "==> 5/6 Generating captions and muxing final video..."
node make-captions.js
ffmpeg -y -i video_only.mp4 -i full_audio.wav \
  -vf "subtitles=captions.srt:force_style='FontName=DejaVu Sans,FontSize=16,PrimaryColour=&H00FFFFFF,BackColour=&H99000000,BorderStyle=4,Outline=0,Shadow=0,MarginV=40'" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 128k -shortest \
  revenue-sentinel-demo.mp4 -loglevel error

DURATION="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 revenue-sentinel-demo.mp4)"
echo "==> 6/6 Done. Duration: ${DURATION}s"

mkdir -p ../../submission
cp revenue-sentinel-demo.mp4 ../../submission/demo.mp4
echo "Copied to submission/demo.mp4"
echo
echo "Recommended: extract a few frames and eyeball them before submitting:"
echo "    ffmpeg -ss 30 -i revenue-sentinel-demo.mp4 -frames:v 1 check.png"
