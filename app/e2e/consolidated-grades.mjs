/**
 * Consolidated Grades — the adviser's cross-subject view of one section.
 *
 * This is the regression test for a bug that live database testing caught
 * and code review did not: `rds.consolidated_grades` was implicitly
 * SECURITY INVOKER, so an adviser who does not personally teach a subject
 * had no RLS grant to read that subject's `class_enrollments`, and the
 * function silently returned no grades for that column — no error, just
 * a blank cell that looked like "not filed yet" instead of "broken".
 *
 * The fixture source can't reproduce an RLS bug (there is no RLS in a
 * plain object), but it CAN reproduce the observable shape the screen
 * must get right: one subject the adviser teaches (grades present) next
 * to one subject a colleague teaches ("MAPEH" in this fixture, taught by
 * the same demo user but not yet submitted for this period, standing in
 * for "someone else's subject"), read from the exact same persisted-grade
 * store the class's own Submission/Summary tabs read.
 *
 *   VITE_DEMO_MODE=true VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
 *     npx vite --port 5199 --strictPort
 *   node e2e/consolidated-grades.mjs
 */
import { execSync } from 'node:child_process';
const { chromium } = await import(
  `${execSync('npm root -g', { encoding: 'utf8' }).trim()}/playwright/index.mjs`
);

const fails = [], ok = [];
const check = (name, cond, detail = '') =>
  (cond ? ok : fails).push(`${name}${detail ? ` — ${detail}` : ''}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
page.on('pageerror', (e) => fails.push(`PAGE ERROR: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !/googleapis|ERR_CONNECTION_RESET/.test(m.text())) {
    fails.push(`CONSOLE: ${m.text()}`);
  }
});

const asRole = async (role) => {
  await page.getByRole('button', { name: role, exact: true }).click();
  await page.waitForTimeout(400);
};

await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });

/* ---- 1. as the subject teacher, submit Term 2 for Mathematics 10 ----- */
// Leaves a real, computed grade in the fixtures' persisted-grade store —
// the same one `getConsolidatedGrades` must read from, not recompute.
await page.getByRole('button', { name: /my classes/i }).first().click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'Open class' }).first().click();
await page.waitForTimeout(400);
await page.getByRole('tab', { name: /submission/i }).click();
await page.waitForTimeout(500);
const panel = page.locator('[role=tabpanel]');
await panel.getByRole('button', { name: /^Submit / }).first().click();
await panel.getByRole('button', { name: /^Yes, submit/ }).first().waitFor({ state: 'visible' });
await panel.getByRole('button', { name: /^Yes, submit/ }).first().click();
await page.waitForTimeout(1000);

/* ---- 2. switch to the adviser and open Consolidated Grades ----------- */
await asRole('Advisory');
const nav = (await page.locator('nav button, aside button').allInnerTexts()).join(' | ');
check('Consolidated Grades is in the adviser nav', /Consolidated Grades/.test(nav));

await page.getByRole('button', { name: /Consolidated Grades/i }).first().click();
await page.waitForTimeout(700);

check('the screen does not blank-screen or error', fails.length === 0,
  fails.join(' | '));
check('the header period selector stands down here',
  (await page.locator('#period-select:visible').count()) === 0);

const sectionOptions = await page.getByLabel('Section').locator('option').allInnerTexts();
const realSections = sectionOptions.filter((s) => !/^choose/i.test(s));
check('the only advisory section is offered',
  realSections.join(', ') === 'Grade 10 – Pearl',
  sectionOptions.join(', '));

await page.getByLabel('Grading period').selectOption({ label: 'Term 2' });
await page.waitForTimeout(700);

/* ---- 3. both subjects appear as columns ------------------------------ */
// thead th is styled uppercase via CSS; innerText reflects the rendered
// case, not the source text, so compare case-insensitively.
const headers = (await page.locator('table.tbl thead th').allInnerTexts())
  .map((h) => h.trim());
const headersLower = headers.map((h) => h.toLowerCase());
check('Mathematics 10 is a column', headersLower.includes('mathematics 10'), headers.join(', '));
check('MAPEH 10 is a column', headersLower.includes('mapeh 10'), headers.join(', '));

/* ---- 4. the submitted subject shows real grades, the other shows --- - */
const mathCol = headersLower.indexOf('mathematics 10');
const mapehCol = headersLower.indexOf('mapeh 10');
const firstDataRow = page.locator('table.tbl tbody tr').first();
const mathCell = (await firstDataRow.locator('td').nth(mathCol - 1).innerText()).trim();
const mapehCell = (await firstDataRow.locator('td').nth(mapehCol - 1).innerText()).trim();

check('the subject the teacher just submitted shows a numeric grade',
  /^\d+$/.test(mathCell), `"${mathCell}"`);
check('the subject nobody has submitted for this period shows a dash, not an error',
  mapehCell === '—', `"${mapehCell}"`);

// The core regression: an adviser reading a subject they do NOT
// personally teach in their own section must still see its grade once
// filed. Since this fixture user teaches every class, the true
// cross-teacher case is only provable against the live database (see the
// migration 0030 verification notes) — this asserts the fixture-visible
// half: the screen renders every subject as its own column and reads
// each one from the shared persisted-grade store, not from "classes this
// viewer happens to teach".
check('every active class in the section is its own column, not just one',
  headersLower.filter((h) => h === 'mathematics 10' || h === 'mapeh 10').length === 2);

await browser.close();
console.log('PASS:'); for (const o of ok) console.log('  ✓', o);
if (fails.length) { console.log('FAIL:'); for (const f of fails) console.log('  ✗', f); process.exit(1); }
console.log(`\nall ${ok.length} checks passed`);
