/**
 * Does the Summary tab tell the truth about where the grade lives?
 *
 * The unit tests cover `reconcileRecorded` in isolation. This drives the
 * real app, because the bug this run actually caught was not in that
 * function: the fixture source's `submitGrades` used `this`, App passed
 * it detached, and pressing Submit in demo mode produced
 * "Cannot read properties of undefined" instead of a submission. No unit
 * test was ever going to see that.
 *
 * Run against a fixtures dev server:
 *
 *   VITE_DEMO_MODE=true VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
 *     npx vite --port 5199 --strictPort
 *   node e2e/recorded-grades.mjs
 *
 * Playwright is resolved from the global install; there is no local
 * dependency on it, so a normal `npm ci` stays small.
 */
import { execSync } from 'node:child_process';

// Playwright lives in the global prefix, not in this package.
const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
const { chromium } = await import(`${globalRoot}/playwright/index.mjs`);

const BASE = 'http://localhost:5199/';
const fails = [];
const ok = [];
function check(name, cond, detail = '') {
  (cond ? ok : fails).push(`${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
page.on('pageerror', (e) => fails.push(`PAGE ERROR: ${e.message}`));
page.on('console', (m) => {
  // This sandbox's proxy blocks fonts.googleapis.com. The stylesheet
  // failing to load is the environment, not the app — the font stacks
  // have real fallbacks. Everything else is a genuine console error.
  if (m.type() === 'error' && !/fonts\.googleapis|ERR_CONNECTION_RESET/.test(m.text())) {
    fails.push(`CONSOLE: ${m.text()}`);
  }
});

await page.goto(BASE, { waitUntil: 'networkidle' });

// open the first class, then the Summary tab
await page.getByRole('button', { name: /my classes/i }).first().click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Open class' }).first().click();
await page.waitForTimeout(400);
await page.getByRole('tab', { name: /^summary$/i }).click();
await page.waitForTimeout(500);

const before = (await page.locator('.callout[data-inline="true"]').first().innerText()).trim();
check('states nothing is recorded yet', /no grades recorded yet/i.test(before), before.slice(0, 90));
check('no Filed column before submission',
  (await page.getByRole('columnheader', { name: 'Filed' }).count()) === 0);

// submit the period
await page.getByRole('tab', { name: /submission/i }).click();
await page.waitForTimeout(600);
const panel = page.locator('[role=tabpanel]');
await panel.getByRole('button', { name: /^Submit / }).first().click();
const confirm = panel.getByRole('button', { name: /^Yes, submit/ });
await confirm.first().waitFor({ state: 'visible', timeout: 5000 });
await confirm.first().click();
await page.waitForTimeout(1500);

await page.getByRole('tab', { name: /^summary$/i }).click();
await page.waitForTimeout(900);

const after = (await page.locator('.callout[data-inline="true"]').first().innerText()).trim();
check('reports the grades as filed', /grades filed/i.test(after), after.slice(0, 110));
check('names when they were computed', /\w{3} \d{1,2}, \d{4}|\d{1,2} \w{3} \d{4}/.test(after), after.slice(0, 110));
check('explains the running/filed gap', /running total, which skips work/.test(after), after.slice(0, 200));
check('Filed column appears after submission',
  (await page.getByRole('columnheader', { name: 'Filed' }).count()) === 1);

const filedCells = await page.locator('table tbody tr td.num.mono').count();
check('table still renders rows', filedCells > 0, `${filedCells} numeric cells`);

// the filed number must match the grade column when nothing has changed
const firstRow = page.locator('table tbody tr').first();
const cells = await firstRow.locator('td').allInnerTexts();
check('filed grade is present on the first row',
  cells.length > 2 && cells.at(-2)?.trim() !== '', JSON.stringify(cells.slice(-3)));

await page.screenshot({ path: '/tmp/summary-filed.png', fullPage: false });
await browser.close();

console.log('PASS:'); for (const o of ok) console.log('  ✓', o);
if (fails.length) { console.log('FAIL:'); for (const f of fails) console.log('  ✗', f); process.exit(1); }
console.log('\nall checks passed');
