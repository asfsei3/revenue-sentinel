// Builds captions.srt (Japanese, for the silent submission video) from
// timeline.json (the actual recorded segment start/end times written by
// record.js). This is the flow produce.sh uses. For the English narrated
// backup flow (produce-en-narrated.sh), see make-captions-en.js instead --
// that one sizes each caption to spoken narration length; this one has no
// narration to size against, so each caption simply spans its full
// recorded segment, which gives ample reading time.
//
// Product/UI/technical terms are kept in English by design: Signal,
// Diagnosis, Revenue Impact, Recovery, Governance, Observability,
// APPROVAL, BLOCK, AUTO, Audit Trail, Cloud Logging, Cloud Run, Gemini,
// Webhook, Synthetic Data, Control Tower, Agent. Everything else is
// natural Japanese aimed at a Japanese hackathon judge watching with the
// sound off.
const fs = require('fs');
const path = require('path');

const OUT_DIR = __dirname;
const timeline = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'timeline.json'), 'utf8'));

// Must match the title card duration produce.sh actually rendered (passed
// via env var so the two files can't drift out of sync).
const TITLE_CARD_SECONDS = Number(process.env.TITLE_CARD_SECONDS || 2);

// Each segment maps to one or more caption cues, spread evenly across that
// segment's own recorded window (we only subdivide existing segment time,
// never add to it, so total video duration is unaffected). Splitting the
// longer segments (02/03/04) into two cues each lets us name what each
// agent actually did and WHY Governance reached APPROVAL or BLOCK, instead
// of one thin summary line per segment -- while still giving each cue 12s+
// of screen time, well above a comfortable reading pace.
const CAPTIONS = {
  '01-problem': ['課題：決済異常の検知と、\nビジネス判断（対応要否）が分断されている'],
  '02-decline-spike': [
    'Signalが異常を検知（確信度90%）。\nDiagnosisが原因をPSP側の障害と推定',
    'Revenue Impactが影響額を試算\n（この期間で¥24,045、月次換算は参考値）',
  ],
  '03-governance': [
    'Recoveryがトラフィック切替による復旧案を提案。\n決済ルーティングに影響するため人の承認が必須',
    'GovernanceがAPPROVALと判定し、承認後に反映\n（実際の決済操作は行われないデモ環境）',
  ],
  '04-security': [
    '同じシナリオに不正な指示（プロンプトインジェクション）を混入。\nGovernanceが6件の不正な指示を検知',
    '資金移動や承認回避を狙う指示を無効化し、\nGovernanceがBLOCKと判定（人の承認でも上書き不可）',
  ],
  '05-observability': [
    'SignalからGovernanceまでの判断根拠・確信度・時刻を\nAudit Trailに記録し、Cloud Loggingで可観測性を確保',
  ],
  '06-closing': [
    'Signal・Diagnosis・Revenue Impact・Recovery・\nGovernance・Observabilityを1つのControl Towerに統合',
  ],
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
  const texts = CAPTIONS[id];
  if (!texts) continue;
  const segStart = timeline[id].start + TITLE_CARD_SECONDS;
  const segEnd = timeline[id].end + TITLE_CARD_SECONDS;
  const slice = (segEnd - segStart) / texts.length;
  texts.forEach((text, idx) => {
    const start = segStart + idx * slice;
    const end = segStart + (idx + 1) * slice;
    srt += `${i}\n${fmt(start)} --> ${fmt(end)}\n${text}\n\n`;
    i++;
  });
}

fs.writeFileSync(path.join(OUT_DIR, 'captions.srt'), srt, 'utf8');
console.log(srt);
