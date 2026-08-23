/**
 * The Import Center.
 *
 * Three properties are worth an end-to-end test, and none of them is
 * "the screen renders":
 *
 *   1. NOTHING IS WRITTEN BEFORE CONFIRMATION. Reading a workbook and
 *      reviewing it must leave the gradebook exactly as it was.
 *   2. A BLANK IS NOT A ZERO. A score the teacher has not given must
 *      still be blank in the grid afterwards. Importing it as zero
 *      would fail a learner who has not sat the test.
 *   3. A NAME THAT MATCHES TWO LEARNERS IS NOT GUESSED, and skipping a
 *      row leaves that row's marks out with it rather than shifting
 *      them onto the learner below.
 *
 *   VITE_DEMO_MODE=true VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
 *     npx vite --port 5199 --strictPort
 *   node e2e/import-center.mjs
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import XLSX from 'xlsx';

const { chromium } = await import(
  `${execSync('npm root -g', { encoding: 'utf8' }).trim()}/playwright/index.mjs`
);

const fails = [], ok = [];
const check = (n, c, d = '') => (c ? ok : fails).push(`${n}${d ? ` — ${d}` : ''}`);

/* ------------------------------------------------------------------ *
 * A workbook for a class the demo actually has.
 *
 * Built here rather than committed, because it has to agree with the
 * fixture roster: the first three learners by name, so they match, and
 * one invented name, so the "not on record" path is exercised too.
 * ------------------------------------------------------------------ */
const LEARNERS = [
  // Exactly as the fixture roster holds them, middle initial and all.
  // An earlier version of this file wrote "Abad, Juan P." and every row
  // fell through to "not on record" — the suite still went green,
  // because the marks landed on four learners the import had just
  // created and the assertions were reading the originals' seeded
  // values. Matching is the thing under test; it has to be real.
  'Abad, Juan C.',
  'Alvarez, Maria L.',
  'Bautista, Pedro R.',
  'Nonesuch, Someone',  // genuinely not on record
];

function sheet(cells, merges = []) {
  const ws = {};
  for (const [addr, v] of Object.entries(cells)) {
    ws[addr] = { t: typeof v === 'number' ? 'n' : 's', v };
  }
  ws['!ref'] = 'A1:AB70';
  if (merges.length) ws['!merges'] = merges.map((r) => XLSX.utils.decode_range(r));
  return ws;
}

const input = {
  A1: 'Class Record ',
  B4: 'REGION', G4: 'IV-A CALABARZON', I4: 'DIVISION', L4: 'Rizal',
  B5: 'SCHOOL NAME', G5: 'Angono National High School',
  Q5: 'SCHOOL ID', S5: '301417', V5: 'SCHOOL YEAR', Y5: '2026-2027',
  F7: 'GRADE & SECTION: ', J7: 'Grade 10 - Pearl',
  N7: 'TEACHER:', Q7: 'Santos, Maria',
  W7: 'SUBJECT:', Y7: 'MAPEH 10',
  B8: "LEARNERS' NAMES", B11: 'MALE ',
};
LEARNERS.forEach((name, i) => { input[`A${12 + i}`] = i + 1; input[`B${12 + i}`] = name; });
input.B62 = 'FEMALE ';

/** One WW item and one Term Exam, so the blank is easy to point at. */
function term(n, withBlank) {
  const cells = {
    [`A7`]: `TERM ${n}`,
    B8: "LEARNERS' NAMES",
    F8: 'WRITTEN / ORAL WORKS (20%)',
    N8: 'PRODUCT / PERFORMANCE TASKS (60%)',
    T8: 'SUMMATIVE TESTS AND TERM EXAMINATIONS (20%)',
    F9: 1, G9: 2, K9: 'Total', L9: 'PS', M9: 'WS',
    N9: 1, Q9: 'Total', R9: 'PS', S9: 'WS',
    T9: 'ST1', U9: 'ST2', V9: 'TE', W9: 'Total', X9: 'PS', Y9: 'WS',
    F10: 20, G10: 20, M10: 0.2,
    N10: 40, S10: 0.6,
    T10: 40, U10: 40, V10: 60, Y10: 0.2,
    B11: 'MALE ', B62: 'FEMALE ',
  };
  LEARNERS.forEach((_, i) => {
    const r = 12 + i;
    cells[`F${r}`] = 11 + i;
    cells[`G${r}`] = 12 + i;
    cells[`N${r}`] = 30 + i;
    cells[`T${r}`] = 31 + i;
    cells[`U${r}`] = 32 + i;
    // Row 12's exam is deliberately EMPTY in one term.
    if (!(withBlank && r === 12)) cells[`V${r}`] = 40 + i;
  });
  return sheet(cells, ['F8:M8', 'N8:S8', 'T8:Y8']);
}

const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, sheet(input), 'INPUT');
XLSX.utils.book_append_sheet(book, term(1, false), 'TERM1');
XLSX.utils.book_append_sheet(book, term(2, false), 'TERM2');
// The blank goes in TERM 3, because Term 1 of this class is already
// PUBLISHED in the fixtures and an import must refuse to touch it — so
// a blank placed there would never reach the grid to be checked.
XLSX.utils.book_append_sheet(book, term(3, true), 'TERM3');
XLSX.utils.book_append_sheet(book, sheet({ A1: 'SUMMARY OF GRADES' }), 'SUMMARY OF GRADES');

const dir = mkdtempSync(join(tmpdir(), 'import-e2e-'));
const FILE = join(dir, 'MAPEH10_Pearl.xlsx');
writeFileSync(FILE, XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));

/* ------------------------------------------------------------------ */

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
page.on('pageerror', (e) => fails.push(`PAGE ERROR: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !/googleapis|ERR_CONNECTION_RESET/.test(m.text())) {
    fails.push(`CONSOLE: ${m.text()}`);
  }
});

const body = () => page.locator('body').innerText();

/**
 * The header's period options read "SY 2026-2027 · Term 3", so match on
 * the term rather than on the whole label — the year prefix is not what
 * this suite is about and would break every June.
 */
async function selectPeriod(term) {
  const select = page.locator('#period-select');
  const labels = await select.locator('option').allInnerTexts();
  const wanted = labels.find((l) => l.trim().endsWith(term));
  if (!wanted) throw new Error(`no period option ending in "${term}": ${labels.join(', ')}`);
  await select.selectOption({ label: wanted });
}

await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });

/* ---- 0. what Term 3 of MAPEH looks like BEFORE anything -------------- */
async function openMapehTerm3() {
  await page.getByRole('button', { name: /my classes/i }).first().click();
  await page.waitForTimeout(400);
  // By CARD, not by index. Picking the nth "Open class" button once
  // opened a different class than the one under test in another suite,
  // and the mismatch looked like a calculation bug for an hour.
  const card = page.locator('.class-card', { hasText: 'MAPEH 10' }).first();
  await card.getByRole('button', { name: /open class/i }).click();
  await page.waitForTimeout(400);
  await page.getByRole('tab', { name: /grade entry/i }).click();
  await page.waitForTimeout(400);
  await selectPeriod('Term 3');
  await page.waitForTimeout(600);
}

await openMapehTerm3();
const columnsBefore = await page.locator('table thead th').count();
await page.getByRole('button', { name: /^▤?\s*Dashboard$/ }).first().click();
await page.waitForTimeout(300);

/* ---- 1. the screen is reachable and reads a workbook ----------------- */
const nav = (await page.locator('nav button, aside button').allInnerTexts()).join(' | ');
check('Import is in the main navigation', /Import/.test(nav));

await page.getByRole('button', { name: /^⇥?\s*Import$/ }).first().click();
await page.waitForTimeout(400);
check('the upload panel says nothing is written yet',
  /nothing is written until you confirm/i.test(await body()));

await page.getByLabel('Choose a workbook to import').setInputFiles(FILE);
await page.waitForTimeout(1500);

const review = await body();
check('the workbook resolved to the right class', /Grade 10 – Pearl · MAPEH 10/.test(review), review.slice(0, 200));
check('it says it will update, not create', /update an existing class/i.test(review));
check('it warns that matches are BY NAME', /matched BY NAME/i.test(review));

/* ---- 2. the preview wrote nothing ------------------------------------ */
await openMapehTerm3();
check('REVIEWING WROTE NOTHING — the gradebook is untouched',
  (await page.locator('table thead th').count()) === columnsBefore,
  `${columnsBefore} columns before, ${await page.locator('table thead th').count()} after`);

/* ---- 3. an unmatched learner is not invented ------------------------- */
await page.getByRole('button', { name: /^⇥?\s*Import$/ }).first().click();
await page.waitForTimeout(300);
await page.getByLabel('Choose a workbook to import').setInputFiles(FILE);
await page.waitForTimeout(1500);

const unmatched = page.getByLabel('What to do with Nonesuch, Someone');
check('a learner not on record is offered as a choice, not assumed',
  (await unmatched.count()) === 1);

// Leave that row out entirely, marks included.
await unmatched.selectOption('skip');
await page.waitForTimeout(300);

/* ---- 3b. a period already out of the teacher's hands is refused ------ */
//
// Term 1 of this class is PUBLISHED in the fixtures. The import must
// leave it alone entirely rather than partially overwrite it, and must
// say so before anything runs.
const terms = await page.locator('table', { hasText: 'Will be imported' }).innerText();
check('a published term is excluded, and the preview says why',
  /Term 1[\s\S]*?no —/.test(terms), terms.replace(/\s+/g, ' ').slice(0, 200));
check('the editable terms are included',
  /Term 2\s*\n?\s*yes/.test(terms) && /Term 3\s*\n?\s*yes/.test(terms),
  terms.replace(/\s+/g, ' ').slice(0, 200));

const marksLabel = await page.getByRole('button', { name: /^Import \d+ marks$/ }).innerText();
const marksToImport = Number(marksLabel.match(/\d+/)[0]);
// 3 learners kept x 6 items x 2 importable terms. The skipped learner
// contributes nothing, and neither does the published term.
check('the count reflects both the skipped learner and the refused term',
  marksToImport === 3 * 6 * 2,
  `${marksToImport} marks, expected ${3 * 6 * 2}`);

/* ---- 4. confirm ------------------------------------------------------ */
await page.getByRole('button', { name: /^Import \d+ marks$/ }).click();
await page.waitForTimeout(1500);
const done = await body();
check('the import reports what it did', /Imported/.test(done), done.slice(0, 160));
check('it says no grades were imported', /No grades were imported/i.test(done));
check('the history now lists the file', /MAPEH10_Pearl\.xlsx/.test(done));

/* ---- 5. the marks landed, and the blank is still blank --------------- */
//
// Every assessment this workbook declares already exists in the fixture
// class, so no COLUMN is added — which is the point of matching on the
// natural key. What must change is the marks inside them.
await openMapehTerm3();
await page.waitForTimeout(700);

/** The value in one learner's row, by column heading. */
async function cellFor(learner, heading) {
  const hs = await page.locator('table thead th').allInnerTexts();
  const col = hs.findIndex((h) => h.replace(/\s+/g, ' ').trim() === heading);
  if (col < 0) return null;
  const row = page.locator('table tbody tr', { hasText: learner }).first();
  const input = row.locator('td').nth(col - 1).locator('input');
  return (await input.count()) ? input.inputValue() : row.locator('td').nth(col - 1).innerText();
}

const headings = (await page.locator('table thead th').allInnerTexts())
  .map((h) => h.replace(/\s+/g, ' ').trim());

const ww1 = await cellFor('Abad, Juan', headings.find((h) => /^WW/.test(h)));
check('an imported mark is in the grid', ww1 === '11', `${ww1} (headings: ${headings.join(',')})`);

const te = await cellFor('Abad, Juan', headings.find((h) => /^TE/.test(h)));
check('A BLANK STAYED BLANK — it was not imported as zero',
  te === '', JSON.stringify(te));

// …and the learner below did NOT inherit it.
const teNext = await cellFor('Alvarez, Maria', headings.find((h) => /^TE/.test(h)));
check('the next learner still has their own exam mark, unshifted',
  teNext === '41', String(teNext));

await browser.close();
console.log('PASS:'); for (const o of ok) console.log('  ✓', o);
if (fails.length) { console.log('FAIL:'); for (const f of fails) console.log('  ✗', f); process.exit(1); }
console.log(`\nall ${ok.length} checks passed`);
