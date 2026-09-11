// Builds captions.srt from timeline.json (actual recorded segment
// start/end times) and durations.json (actual narration audio length per
// segment) so each caption is on screen for roughly the length of its
// narration, not the whole (longer) visual dwell time.
const fs = require('fs');
const path = require('path');

const OUT_DIR = __dirname;
const timeline = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'timeline.json'), 'utf8'));
const durations = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'durations.json'), 'utf8'));
const TITLE_CARD_SECONDS = 3.0;

// Short on-screen headlines -- deliberately shorter than the spoken
// narration in segments.json, since a verbatim transcript is too much text
// to read while also watching the UI.
const CAPTIONS = {
  '01-problem': 'Problem: technical signal, fragmented business decision',
  '02-decline-spike': 'Signal -> Diagnosis -> Revenue Impact (AI-estimated, synthetic data)',
  '03-governance': 'Recovery -> Governance: APPROVAL (human approves, nothing executes for real)',
  '04-security': 'Prompt injection detected -> Governance: BLOCK (server-enforced)',
  '05-observability': 'Full audit trail + structured Cloud Logging',
  '06-closing': 'Signal -> Diagnosis -> Impact -> Recovery -> Governance -> Observability',
};

function fmt(sec) {
  const ms = Math.round((sec % 1) * 1000);
  const s = Math.floor(sec) % 60;
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

let srt = '';
let i = 1;
for (const id of Object.keys(timeline)) {
  const start = timeline[id].start + TITLE_CARD_SECONDS;
  const naturalEnd = start + (durations[id] || 4) + 0.4;
  const end = Math.min(naturalEnd, timeline[id].end + TITLE_CARD_SECONDS);
  srt += `${i}\n${fmt(start)} --> ${fmt(end)}\n${CAPTIONS[id]}\n\n`;
  i++;
}

fs.writeFileSync(path.join(OUT_DIR, 'captions.srt'), srt);
console.log(srt);
