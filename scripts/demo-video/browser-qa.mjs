// Browser-based QA against a running Revenue Sentinel instance (local or
// deployed). Checks the golden path (home -> scenario select -> run
// investigation -> incident detail -> approval), governance/audit trail
// rendering, console errors, and horizontal overflow at three viewports.
//
// Usage: node browser-qa.mjs <base-url> [out-dir]
//   node browser-qa.mjs https://revenue-sentinel-xxxxx.a.run.app qa-out
//
// Requires the same `playwright` dependency as produce.sh in this folder
// (run `npm install && npx playwright install --with-deps chromium` here
// first if you haven't already for the demo video).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = process.argv[2];
if (!BASE_URL) {
  console.error('Usage: node browser-qa.mjs <base-url> [out-dir]');
  process.exit(1);
}
const OUT_DIR = process.argv[3] || 'qa-out';
fs.mkdirSync(OUT_DIR, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'mobile-390', width: 390, height: 844 },
];

const results = [];
function check(label, ok, detail) {
  results.push({ label, ok, detail });
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ' -- ' + detail : ''}`);
}

async function checkOverflow(page, label) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  check(`${label}: no horizontal overflow`, overflow.scrollWidth <= overflow.clientWidth + 1, `scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}`);
}

async function runForViewport(browser, vp) {
  console.log(`\n== Viewport: ${vp.name} (${vp.width}x${vp.height}) ==`);
  const consoleErrors = [];
  const pageErrors = [];
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await context.newPage();
  page.on('response', (res) => {
    if (res.status() === 404 && res.url().includes('favicon')) return; // known harmless
    if (res.status() >= 400) {
      // Any other 4xx/5xx response is worth surfacing -- e.g. a broken API route.
      consoleErrors.push(`HTTP ${res.status()} for ${res.url()}`);
    }
  });
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    // Skip generic "Failed to load resource: 404" noise (already captured, with
    // the actual URL, by the response listener above -- this event lacks the URL).
    if (/failed to load resource.*404/i.test(msg.text())) return;
    consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  check(`${vp.name}: home page loads`, true);
  check(`${vp.name}: hero text present`, (await page.locator('text=Revenue Sentinel').count()) > 0);
  await checkOverflow(page, vp.name);
  await page.screenshot({ path: path.join(OUT_DIR, `${vp.name}-01-home.png`), fullPage: true });

  // Golden path: decline spike -> run -> approve
  await page.selectOption('select.select', { label: 'PSP-A authorization rate drop' });
  await page.locator('button', { hasText: 'Run incident investigation' }).click();
  await page.waitForTimeout(2000);
  check(`${vp.name}: governance decision rendered`, (await page.locator('text=APPROVAL').count()) > 0);
  check(`${vp.name}: revenue impact rendered`, (await page.locator('text=Estimated recoverable revenue').count()) > 0);
  check(`${vp.name}: agent trajectory rendered`, (await page.locator('text=Governance Agent').count()) > 0);
  await checkOverflow(page, `${vp.name} (after decline-spike run)`);
  await page.screenshot({ path: path.join(OUT_DIR, `${vp.name}-02-decline-result.png`), fullPage: true });

  const approveBtn = page.locator('button', { hasText: 'Approve' });
  if (await approveBtn.count()) {
    await approveBtn.click();
    await page.waitForTimeout(1000);
    check(`${vp.name}: approval updates status`, (await page.locator('text=approved').count()) > 0);
  } else {
    check(`${vp.name}: approval updates status`, false, 'Approve button not found');
  }
  await page.screenshot({ path: path.join(OUT_DIR, `${vp.name}-03-approved.png`), fullPage: true });

  // Security scenario -> BLOCK
  await page.selectOption('select.select', { label: 'PSP-A decline spike + embedded prompt injection (security test)' });
  await page.locator('button', { hasText: 'Run incident investigation' }).click();
  await page.waitForTimeout(2000);
  check(`${vp.name}: BLOCK badge rendered`, (await page.locator('text=BLOCK').count()) > 0);
  check(`${vp.name}: security findings rendered`, (await page.locator('text=Security findings').count()) > 0);
  await checkOverflow(page, `${vp.name} (after prompt-injection run)`);
  await page.screenshot({ path: path.join(OUT_DIR, `${vp.name}-04-block.png`), fullPage: true });

  // Audit trail
  check(`${vp.name}: audit trail rendered`, (await page.locator('text=Audit trail').count()) > 0);

  check(`${vp.name}: no console errors`, consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  check(`${vp.name}: no page errors`, pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

  await context.close();
}

async function main() {
  const launchOptions = process.env.PLAYWRIGHT_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
    : {};
  const browser = await chromium.launch(launchOptions);
  for (const vp of VIEWPORTS) {
    await runForViewport(browser, vp);
  }
  await browser.close();

  const fails = results.filter((r) => !r.ok);
  console.log(`\n===================== Browser QA summary =====================`);
  console.log(`PASS: ${results.length - fails.length}   FAIL: ${fails.length}`);
  console.log(`Screenshots saved to ${OUT_DIR}/`);
  if (fails.length > 0) {
    console.log('Failures:');
    for (const f of fails) console.log(`  - ${f.label}${f.detail ? ': ' + f.detail : ''}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
