#!/usr/bin/env bash
# Generates one WAV narration clip per segment in segments.json using
# espeak-ng (offline, no API key / no network dependency). Falls back to the
# default en-us voice if the mbrola voices aren't installed.
set -euo pipefail
cd "$(dirname "$0")"

mkdir -p audio
VOICE="mb-us1"
if ! espeak-ng --voices="$VOICE" >/dev/null 2>&1; then
  echo "mbrola voice mb-us1 not found, falling back to en-us (install 'mbrola mbrola-us1' via apt for better quality)" >&2
  VOICE="en-us"
fi
echo "Using voice: $VOICE"

echo '{}' > durations.json
node -e "
const segs = require('./segments.json');
console.log(segs.map(s => s.id).join('\n'));
" | while read -r id; do
  TEXT="$(node -e "console.log(require('./segments.json').find(s => s.id === '$id').text)")"
  espeak-ng -v "$VOICE" -s 158 -w "audio/$id.wav" "$TEXT"
  DUR="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "audio/$id.wav")"
  echo "  $id -> ${DUR}s"
  node -e "
    const fs = require('fs');
    const d = JSON.parse(fs.readFileSync('durations.json','utf8'));
    d['$id'] = $DUR;
    fs.writeFileSync('durations.json', JSON.stringify(d, null, 2));
  "
done
