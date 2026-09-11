// Records a browser walkthrough of Revenue Sentinel for the hackathon demo
// video, and writes timeline.json with the *actual* per-segment start/end
// times so the narration audio (see generate-narration.sh) can be padded to
// match exactly, rather than guessing fixed durations up front.
//
// Usage: node record.js <base-url>
//   e.g. node record.js https://revenue-sentinel-xxxxx.a.run.app
//        node record.js http://localhost:3000   (local dry run)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.argv[2];
if (!BASE_URL) {
  console.error('Usage: node record.js <base-url>');
  process.exit(1);
}

const OUT_DIR = __dirname;
const VIDEO_DIR = path.join(OUT_DIR, 'raw-video');
fs.rmSync(VIDEO_DIR, { recursive: true, force: true });
fs.mkdirSync(VIDEO_DIR, { recursive: true });

// Target dwell time (seconds) per segment -- includes narration length plus
// time for the viewer to actually read the UI. Tuned so total stays under
// 3:00 once the 3s title card (see produce.sh) is added. If you change the
// narration text in segments.json a lot, sanity-check these against the
// new narration durations printed by generate-narration.sh.
const TARGETS = {
  '01-problem': 18,
  '02-decline-spike': 46,
  '03-governance': 36,
  '04-security': 36,
  '05-observability': 24,
  '06-closing': 15,
};

// Optional: point at a pre-installed Chromium binary instead of the one
// `npx playwright install` downloads (e.g. if your environment already has
// one). Leave unset to use Playwright's normal managed browser.
const launchOptions = process.env.PLAYWRIGHT_EXECUTABLE_PATH
  ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
  : {};

async function main() {
  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: VIDEO_DIR, size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();
  page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));

  const timeline = [];
  const t0 = Date.now();
  function mark(id, note) {
    timeline.push({ id, t: (Date.now() - t0) / 1000, note });
    console.log(`[${((Date.now() - t0) / 1000).toFixed(2)}s] ${id} ${note || ''}`);
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function dwellRemainder(id, segStart) {
    const elapsed = (Date.now() - t0) / 1000 - segStart;
    const remain = TARGETS[id] - elapsed;
    if (remain > 0) await wait(remain * 1000);
  }

  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });

  // --- Segment 1: Problem (hero visible, no action) ---
  let segStart = (Date.now() - t0) / 1000;
  mark('01-problem', 'start');
  await page.evaluate(() => window.scrollTo({ top: 0 }));
  await dwellRemainder('01-problem', segStart);

  // --- Segment 2: decline spike ---
  segStart = (Date.now() - t0) / 1000;
  mark('02-decline-spike', 'start');
  await page.selectOption('select.select', { label: 'PSP-A authorization rate drop' });
  await wait(400);
  await page.locator('button', { hasText: 'Run incident investigation' }).click();
  await wait(1800);
  await page.evaluate(() => window.scrollTo({ top: 250, behavior: 'smooth' }));
  await wait(2500);
  await page.evaluate(() => window.scrollTo({ top: 700, behavior: 'smooth' }));
  await dwellRemainder('02-decline-spike', segStart);

  // --- Segment 3: governance / approve ---
  // Scroll target found by measuring the "Approve" button's actual position
  // (see docs comment in the repo's session history) -- re-check with
  // page.evaluate + getBoundingClientRect if the UI layout changes.
  segStart = (Date.now() - t0) / 1000;
  mark('03-governance', 'start');
  await page.evaluate(() => window.scrollTo({ top: 1870, behavior: 'smooth' }));
  await wait(2200);
  const approveBtn = page.locator('button', { hasText: 'Approve' });
  if (await approveBtn.count()) {
    await approveBtn.click();
    await wait(1500);
  }
  await dwellRemainder('03-governance', segStart);

  // --- Segment 4: security / prompt injection -> BLOCK ---
  segStart = (Date.now() - t0) / 1000;
  mark('04-security', 'start');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await wait(600);
  await page.selectOption('select.select', { label: 'PSP-A decline spike + embedded prompt injection (security test)' });
  await wait(400);
  await page.locator('button', { hasText: 'Run incident investigation' }).click();
  await wait(1800);
  await page.evaluate(() => window.scrollTo({ top: 1300, behavior: 'smooth' }));
  await wait(2500);
  await page.evaluate(() => window.scrollTo({ top: 1900, behavior: 'smooth' }));
  await dwellRemainder('04-security', segStart);

  // --- Segment 5: observability / audit trail ---
  segStart = (Date.now() - t0) / 1000;
  mark('05-observability', 'start');
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
  await dwellRemainder('05-observability', segStart);

  // --- Segment 6: closing ---
  segStart = (Date.now() - t0) / 1000;
  mark('06-closing', 'start');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await dwellRemainder('06-closing', segStart);

  mark('end', 'recording done');

  await context.close();
  await browser.close();

  const ids = Object.keys(TARGETS);
  const segTimes = {};
  for (let i = 0; i < ids.length; i++) {
    const start = timeline.find((m) => m.id === ids[i]).t;
    const end = timeline[timeline.findIndex((m) => m.id === ids[i]) + 1].t;
    segTimes[ids[i]] = { start, end, duration: end - start };
  }

  fs.writeFileSync(path.join(OUT_DIR, 'timeline.json'), JSON.stringify(segTimes, null, 2));
  console.log('Timeline written:', JSON.stringify(segTimes, null, 2));

  const files = fs.readdirSync(VIDEO_DIR).filter((f) => f.endsWith('.webm'));
  console.log('Recorded video file(s):', files);
  fs.writeFileSync(path.join(OUT_DIR, 'video-filename.txt'), files[0]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
