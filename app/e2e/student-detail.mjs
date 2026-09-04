/**
 * Student Detail — the legacy screen's picker and year strip.
 *
 * Two things are asserted, and only one of them is the new feature.
 *
 * THE NEW FEATURE: a quarter picker, a learner picker, and a
 * Q1/Q2/Q3/FINAL strip, so a teacher chasing missing marks moves
 * through the class without returning to Summary between names.
 *
 * THE BUG IT UNCOVERED: `detail` used to hold a SummaryRow snapshot
 * taken from whichever period was loaded when the name was clicked, and
 * only the TAB buttons cleared it. Switching period therefore rendered
 * Term 1's marks under a "Term 2" heading — silently, with no error.
 * The row is now derived from the current period's gradebook by
 * classEnrollmentId, so check 4 is the regression test for that.
 *
 *   VITE_DEMO_MODE=true VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
 *     npx vite --port 5199 --strictPort
 *   node e2e/student-detail.mjs
 */
import { execSync } from 'node:child_process';
const { chromium } = await import(
  `${execSync('npm root -g', { encoding: 'utf8' }).trim()}/playwright/index.mjs`
);

const fails = [], ok = [];
const check = (n, c, d = '') => (c ? ok : fails).push(`${n}${d ? ` — ${d}` : ''}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
page.on('pageerror', (e) => fails.push(`PAGE ERROR: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !/googleapis|ERR_CONNECTION_RESET/.test(m.text())) {
    fails.push(`CONSOLE: ${m.text()}`);
  }
});

// The header and the workspace both carry a "Grading period" control,
// so every lookup below is scoped to the detail screen's own picker bar.
const picker = page.locator('.detail-picker');

await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });

/* ---- open a class, Summary, then a learner --------------------------- */
await page.getByRole('button', { name: /my classes/i }).first().click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Open class' }).first().click();
await page.waitForTimeout(500);
await page.getByRole('tab', { name: /^summary$/i }).click();
await page.waitForTimeout(700);

const firstName = (await page.locator('table.tbl tbody tr th button.link').first().innerText()).trim();
await page.locator('table.tbl tbody tr th button.link').first().click();
await page.waitForTimeout(900);

let t = await page.locator('body').innerText();
check('1. the detail opens for the learner clicked', t.includes(firstName), firstName);

/* ---- the picker bar --------------------------------------------------- */
check('2. a grading-period picker is offered',
  (await picker.getByLabel('Grading period').count()) === 1);
check('2b. a learner picker is offered',
  (await picker.getByLabel('Learner').count()) === 1);
check('2c. Go to row and Print / PDF are offered, as in the legacy screen',
  (await picker.getByRole('button', { name: /^Go to row$/ }).count()) === 1
  && (await picker.getByRole('button', { name: /Print . PDF/ }).count()) === 1);

const learnerOptions = await picker.getByLabel('Learner').locator('option').allInnerTexts();
check('2d. the learner picker lists the whole class',
  learnerOptions.length >= 6, `${learnerOptions.length} learners`);

/* ---- the year strip --------------------------------------------------- */
await page.waitForTimeout(800);
const tiles = await page.locator('.year-strip .stat, .year-strip .stat-btn').allInnerTexts();
check('3. the strip shows every period of the year plus Final',
  tiles.length === 4, tiles.map((x) => x.replace(/\n/g, ':')).join(' | '));
check('3b. the current period is marked',
  (await page.locator('.year-strip .stat-btn[aria-current="true"]').count()) === 1);
// Term 3 is UNSTARTED in the fixtures, matching the demonstration
// dataset, so this is the partial case: Final must be the mean of the
// terms that actually have a grade, and must SAY it is provisional.
// Averaging in a zero for the unstarted term, or presenting the
// half-year figure as settled, are the two ways this goes wrong.
//
// Read the tiles as label+value pairs; a bare /\d+/ over the whole
// tile picks the 3 out of "Term 3" and silently invents a grade.
const gradeOf = (tile) => {
  const m = tile.match(/(?:^|\D)(\d{2,3})(?:\D|$)/);
  return m ? Number(m[1]) : null;
};
const termGrades = tiles.slice(0, 3).map(gradeOf);
const shownFinal = gradeOf(tiles[3] ?? '');
const graded = termGrades.filter((g) => g !== null);

check('3c. the unstarted term carries no grade at all',
  termGrades[2] === null,
  `tiles: ${tiles.map((x) => x.replace(/\n/g, ':')).join(' | ')}`);

const expectedFinal = Math.round(graded.reduce((a, b) => a + b, 0) / graded.length);
check('3d. Final is the mean of the GRADED terms, not of three',
  shownFinal === expectedFinal,
  `${graded.join(' + ')} / ${graded.length} -> expected ${expectedFinal}, shown ${shownFinal}`);

check('3e. and a half-finished year is labelled provisional',
  /Provisional/i.test(await page.locator('body').innerText()),
  'presenting a partial mean as a settled final grade is the failure here');

/* ---- 4. THE REGRESSION: switching period must not show stale marks ---- */
// Term 1 is fully scored in the fixtures; Term 2 is deliberately partial
// and Term 3 is empty. So the SAME learner must read differently across
// them — if the numbers do not move, the old snapshot bug is back.
const gradeNow = await page.locator('.stat-row').nth(1).innerText();
await picker.getByLabel('Grading period').selectOption({ label: 'Term 3' });
await page.waitForTimeout(1100);

t = await page.locator('body').innerText();
check('4. the learner is KEPT when the period changes', t.includes(firstName), firstName);
check('4b. the heading now names the new period',
  /Term 3/.test(t) && !/· Term 1 ·/.test(t));
const gradeAfter = await page.locator('.stat-row').nth(1).innerText();
check('4c. THE MARKS CHANGED WITH THE PERIOD — no stale snapshot',
  gradeNow !== gradeAfter,
  `${gradeNow.replace(/\n/g, ':')} -> ${gradeAfter.replace(/\n/g, ':')}`);
// Term 2 is the deliberately-partial one in the fixtures, so it is
// where the missing-score count must be non-zero and Term 3's zero.
check('4d. the missing-score count moved with the period too',
  /0\nMISSING SCORES/i.test(gradeAfter) && /3\nMISSING SCORES/i.test(gradeNow),
  `${gradeNow.replace(/\n/g, ':')} -> ${gradeAfter.replace(/\n/g, ':')}`);

/* ---- 5. switching learner keeps the period --------------------------- */
const second = learnerOptions[1];
await picker.getByLabel('Learner').selectOption({ label: second });
await page.waitForTimeout(900);
t = await page.locator('body').innerText();
check('5. the learner changed', t.includes(second.trim()), second);
check('5b. and the period was kept', /Term 3/.test(t));

/* ---- 6. Summary on an unstarted term explains itself ------------------ */
await page.getByRole('button', { name: /← Summary/ }).click();
await page.waitForTimeout(600);
check('6. Summary says why an unstarted term has nothing to show',
  /nothing to summarise/i.test(await page.locator('[role=tabpanel]').innerText()),
  'Term 3 is still selected, and a bare empty table reads as a fault');

/* ---- 7. and a graded term still renders the table --------------------- */
await page.getByRole('button', { name: 'Term 1', exact: true }).first().click();
await page.waitForTimeout(900);
check('7. Back returns to the Summary table for a term that has grades',
  (await page.locator('table.tbl tbody tr th button.link').count()) > 0);

await browser.close();
console.log('PASS:'); for (const o of ok) console.log('  ✓', o);
if (fails.length) { console.log('FAIL:'); for (const f of fails) console.log('  ✗', f); process.exit(1); }
console.log(`\nall ${ok.length} checks passed`);
