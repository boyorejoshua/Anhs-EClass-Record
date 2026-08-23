/**
 * Global Analytics and Global LOA Reports.
 *
 * The property that matters is NOT that these screens render. It is that
 * they render the SAME NUMBERS as the class-workspace tabs, because they
 * are the same component fed the same data. A second implementation
 * would be invisible until the day the two disagreed in front of a
 * division office.
 *
 *   VITE_DEMO_MODE=true VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
 *     npx vite --port 5199 --strictPort
 *   node e2e/global-reports.mjs
 */
import { execSync } from 'node:child_process';
const { chromium } = await import(
  `${execSync('npm root -g', { encoding: 'utf8' }).trim()}/playwright/index.mjs`
);

const fails = [], ok = [];
const check = (n, c, d = '') => (c ? ok : fails).push(`${n}${d ? ` — ${d}` : ''}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
page.on('pageerror', (e) => fails.push(`PAGE ERROR: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !/googleapis|ERR_CONNECTION_RESET/.test(m.text())) {
    fails.push(`CONSOLE: ${m.text()}`);
  }
});

/** Every number on the page, in order — the comparison surface. */
const numbers = async () =>
  (await page.locator('table.tbl td.num, table.tbl td.mono').allInnerTexts())
    .map((t) => t.trim()).filter(Boolean);

await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });

/* ---- 1. the entries exist and are separate from the class tabs ------- */
const nav = (await page.locator('nav button, aside button').allInnerTexts()).join(' | ');
check('Analytics is in the main navigation', /Analytics/.test(nav));
check('LOA Reports is in the main navigation', /LOA Reports/.test(nav));

/* ---- 2. the picker is data-driven ------------------------------------ */
await page.getByRole('button', { name: /^◔?\s*Analytics$/ }).first().click();
await page.waitForTimeout(800);
// The header's own period selector stands down on these routes, so
// there is exactly one control with this name.
check('the header period selector stands down here',
  (await page.locator('#period-select:visible').count()) === 0);
const periods = await page.getByLabel('Grading period').locator('option').allInnerTexts();
check('the period list comes from the year config, not a constant',
  periods.length === 3 && periods.every((p) => /^Term [123]$/.test(p)),
  periods.join(', '));
check('nothing renders until a class is chosen',
  /Choose a class/i.test(await page.locator('body').innerText()));

/* ---- 3. global Analytics renders ------------------------------------- */
//
// Pin BOTH paths to the same class. Picking by index compared two
// different classes and produced a mismatch that looked like a drifting
// calculation — the numbers were right, the test was asking the wrong
// question.
// "Mathematics 10" appears under BOTH Grade 10 – Pearl and Grade 10 –
// Diamond, so selecting by label alone picked a different class from the
// one My Classes opens. That looked like a drifting calculation and was
// nothing of the kind. Pin the exact option by its optgroup.
const THE_CLASS = 'Mathematics 10';
const THE_SECTION = 'Grade 10 – Pearl';
// Each option names its section AND subject, so the label is
// unambiguous even when the select is closed.
const THE_OPTION = `${THE_SECTION} · ${THE_CLASS}`;
const classValue = await page.getByLabel('Class').locator('option').evaluateAll(
  (os, want) => os.find((o) => o.textContent?.trim() === want)?.value ?? '', THE_OPTION,
);
check('the picker names each class unambiguously', classValue !== '', THE_OPTION);
await page.getByLabel('Class').selectOption(classValue);
await page.getByLabel('Grading period').selectOption({ label: 'Term 2' });
await page.waitForTimeout(1000);
check('global Analytics renders a report',
  (await page.locator('table.tbl').count()) > 0);
const globalNumbers = await numbers();
check('global Analytics produced figures', globalNumbers.length > 0,
  `${globalNumbers.length} values`);

/* ---- 4. the SAME numbers inside the class workspace ------------------ */
await page.getByRole('button', { name: /my classes/i }).first().click();
await page.waitForTimeout(500);
// The same class, by name, not by position.
await page.locator('tbody tr, .class-card')
  .filter({ hasText: THE_CLASS }).filter({ hasText: 'Pearl' }).first()
  .getByRole('button', { name: 'Open class' }).click();
await page.waitForTimeout(500);
// Match the period the global view used.
await page.getByRole('button', { name: 'Term 2', exact: true }).click();
await page.waitForTimeout(400);
await page.getByRole('tab', { name: /^analytics$/i }).click();
await page.waitForTimeout(900);
const tabNumbers = await numbers();
check('the class tab produced figures', tabNumbers.length > 0, `${tabNumbers.length} values`);
check('GLOBAL AND CONTEXTUAL ANALYTICS AGREE EXACTLY',
  JSON.stringify(globalNumbers) === JSON.stringify(tabNumbers),
  globalNumbers.length === tabNumbers.length
    ? 'same count, same values'
    : `global ${globalNumbers.length} vs tab ${tabNumbers.length}`);

/* ---- 5. LOA, the same way -------------------------------------------- */
await page.getByRole('tab', { name: /^loa$/i }).click();
await page.waitForTimeout(1100);
const tabLoa = await numbers();
check('the LOA tab produced figures', tabLoa.length > 0, `${tabLoa.length} values`);

await page.getByRole('button', { name: /LOA Reports/ }).first().click();
await page.waitForTimeout(800);
await page.getByLabel('Class').selectOption(classValue);
await page.getByLabel('Grading period').selectOption({ label: 'Term 2' });
await page.waitForTimeout(1100);
const globalLoa = await numbers();
check('global LOA renders a report', globalLoa.length > 0, `${globalLoa.length} values`);
check('GLOBAL AND CONTEXTUAL LOA AGREE EXACTLY',
  JSON.stringify(globalLoa) === JSON.stringify(tabLoa),
  globalLoa.length === tabLoa.length
    ? 'same count, same values'
    : `global ${globalLoa.length} vs tab ${tabLoa.length}`);

/* ---- 6. the class tabs are still there ------------------------------- */
await page.getByRole('button', { name: /my classes/i }).first().click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Open class' }).first().click();
await page.waitForTimeout(500);
const tabs = await page.getByRole('tab').allInnerTexts();
check('the class workspace still has its own Analytics tab',
  tabs.some((t) => /analytics/i.test(t)));
check('the class workspace still has its own LOA tab',
  tabs.some((t) => /^loa$/i.test(t.trim())));

await browser.close();
console.log('PASS:'); for (const o of ok) console.log('  ✓', o);
if (fails.length) { console.log('FAIL:'); for (const f of fails) console.log('  ✗', f); process.exit(1); }
console.log(`\nall ${ok.length} checks passed`);
