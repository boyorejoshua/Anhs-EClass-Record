/**
 * The Import Center can be resolved by the person looking at it.
 *
 * A teacher imported their real GMRC 9 Edison workbook — the official
 * DepEd Electronic Class Record — and got six red errors and no way
 * forward:
 *
 *   No grade level here is called "9". Choose one.
 *   No subject here matches "GMRC". Choose one.
 *   The grading scheme for this subject has no "ST1" component…
 *   …no "ST2" component…  …no "PT" component…  …no "WW" component…
 *
 * Three separate faults:
 *
 *   1. The official workbook writes the grade level as a BARE NUMBER.
 *      We matched only against "Grade 9" and "G9", so every official
 *      file failed at the first hurdle.
 *   2. The four component errors were not real. They fired because the
 *      SUBJECT was unresolved, so no grading scheme was found, so every
 *      component was reported missing — four consequences of one cause.
 *      The teacher spotted it: the workbook plainly has WW, PT and EX
 *      with their highest possible scores.
 *   3. "Choose one." was addressed at somebody with nothing to choose
 *      with. The server has always taken `overrides`; the client never
 *      sent any and rendered no picker.
 *
 *   VITE_DEMO_MODE=true VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
 *     npx vite --port 5199 --strictPort
 *   node e2e/import-choices.mjs
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
 * The OFFICIAL layout, shaped exactly like the teacher's file:
 * a bare 9 for the grade level, a section the demo does not have, and
 * a subject the school does not stock.
 * ------------------------------------------------------------------ */
const LEARNERS = ['Abad, Juan C.', 'Alvarez, Maria L.', 'Bautista, Pedro R.'];

const sheet = (cells, merges = []) => {
  const ws = {};
  for (const [addr, v] of Object.entries(cells)) {
    ws[addr] = { t: typeof v === 'number' ? 'n' : 's', v };
  }
  ws['!ref'] = 'A1:AD120';
  if (merges.length) ws['!merges'] = merges.map((r) => XLSX.utils.decode_range(r));
  return ws;
};

// The vertical label:value block, with the roster BESIDE it — the
// geometry that made a blank field read as a roster number.
const input = sheet({
  A1: 'Input Data Sheet for Electronic-Class Record (ECR)',
  B7: 'SCHOOL INFORMATION', I7: "LEARNERS' NAMES",
  C10: 'REGION', D10: ':', E10: 'IV-A CALABARZON', J10: 'MALE',
  C11: 'DIVISION', D11: ':', E11: 'Rizal',
  C13: 'SCHOOL ID', D13: ':', E13: '301417',
  C14: 'SCHOOL NAME', D14: ':', E14: 'Angono National High School',
  C15: 'SCHOOL YEAR', D15: ':', E15: '2026-2027',
  C16: 'SCHOOL HEAD', D16: ':', E16: 'Dr. Ramos',
  // SUBJECT TEACHER deliberately BLANK, as the real file had it.
  C23: 'SUBJECT TEACHER', D23: ':',
  C24: 'SUBJECT', D24: ':', E24: 'GMRC',
  C25: 'GRADE LEVEL', D25: ':', E25: 9,      // <- a NUMBER, not "Grade 9"
  C26: 'SECTION', D26: ':', E26: 'EDISON',
  ...Object.fromEntries(LEARNERS.flatMap((n, i) => [
    [`J${11 + i}`, i + 1], [`K${11 + i}`, n],
  ])),
}, ['E10:F10', 'E11:F11', 'E13:F13', 'E14:F14', 'E15:F15', 'E16:F16',
    'E23:F23', 'E24:F24', 'E25:F25', 'E26:F26']);

const term = (n) => {
  const cells = {
    B2: `CLASS RECORD - TERM ${n}`,
    B10: `TERM ${n}`, F10: 'GRADE LEVEL', J10: 9, N10: 'TEACHER',
    Y10: 'SUBJECT', AA10: 'GMRC',
    F11: 'SECTION', J11: 'EDISON',
    F12: 'WRITTEN / ORAL WORKS (WWs)',
    N12: 'PRODUCT / PERFORMANCE TASKS (PTs)',
    T12: 'EXAMINATIONS (EXs)',
    AB12: 'Initial Grade', AC12: 'Term Grade', AD12: 'Descriptor',
    F14: '1', G14: '2', K14: 'Total', L14: 'PS', M14: 'WS',
    N14: '1', Q14: 'Total', R14: 'PS', S14: 'WS',
    T14: 'ST1', U14: 'ST2', V14: 'TE',
    W14: 'WS ST1', X14: 'WS ST2', Y14: 'WS TE', Z14: 'PS', AA14: 'WS',
    B15: 'HIGHEST POSSIBLE SCORE',
    F15: 20, G15: 20, K15: 40, L15: 100, M15: 0.2,
    N15: 40, Q15: 40, R15: 100, S15: 0.5,
    T15: 25, U15: 25, W15: 30, X15: 30, Y15: 40, Z15: 100, AA15: 0.3,
    B16: "LEARNERS' NAMES", B17: 'MALE', B68: 'FEMALE',
  };
  LEARNERS.forEach((name, i) => {
    const r = 18 + i;
    cells[`B${r}`] = String(i + 1);
    cells[`C${r}`] = name;
    cells[`F${r}`] = 11 + i;
    cells[`G${r}`] = 12 + i;
    cells[`N${r}`] = 30 + i;
    cells[`T${r}`] = 19 + i;
    cells[`U${r}`] = 20 + i;
  });
  return sheet(cells, ['B10:E14', 'F12:M13', 'N12:S13', 'T12:AA13',
                       'AB12:AB15', 'AC12:AC15', 'AD12:AD15']);
};

const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, input, 'INPUT DATA');
XLSX.utils.book_append_sheet(book, term(1), 'TERM 1');
XLSX.utils.book_append_sheet(book, term(2), 'TERM 2');
XLSX.utils.book_append_sheet(book, term(3), 'TERM 3');
XLSX.utils.book_append_sheet(book, sheet({ B2: 'CLASS RECORD - FINAL' }), 'FINAL GRADES');
XLSX.utils.book_append_sheet(book, sheet({ B2: 'HELPER' }), 'HELPER');

const dir = mkdtempSync(join(tmpdir(), 'import-choices-'));
const FILE = join(dir, '3Term-E-Class-Record-GMRC-VE-G9-EDISON.xlsx');
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

await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /^Import$/ }).first().click();
await page.waitForTimeout(500);
await page.getByLabel('Choose a workbook to import').setInputFiles(FILE);
await page.waitForTimeout(1200);

let body = await page.locator('body').innerText();

/* ---- 1. the picker exists at all ------------------------------------ */
check('1. an unresolved workbook offers a way to resolve it',
  /Which class is this\?/.test(body),
  'the errors said "Choose one" and there was no chooser on the page');

/* ---- 2. the four phantom component errors are gone ------------------ */
check('2. no phantom "scheme has no WW component" error',
  !/has no "WW" component/.test(body)
  && !/has no "PT" component/.test(body)
  && !/has no "ST1" component/.test(body),
  'those fired only because the subject was unresolved — one cause, four errors');

/* ---- 3. the workbook's own words are shown beside each choice -------- */
check('3. each picker says what the workbook claimed',
  /The workbook says/.test(body) && /GMRC/.test(body) && /EDISON/.test(body),
  'so choosing something else is a visible decision, not a silent one');

/* ---- 4. the misleading label warning is gone ------------------------ */
check('4. a blank SUBJECT TEACHER is not reported as a missing label',
  !/has no "TEACHER" label/.test(body),
  'the label was there and empty; saying it was absent made the page untrustworthy');

/* ---- 5-7. resolve it, the way a teacher would ------------------------ */
const pick = async (label, rx) => {
  const sel = page.getByLabel(label, { exact: true });
  const value = await sel.locator('option').evaluateAll(
    (os, pattern) => os.find((o) => new RegExp(pattern).test(o.textContent))?.value ?? '',
    rx.source);
  await sel.selectOption(value);
  await page.waitForTimeout(900);
};

await pick('Grade level', /Grade 10/);
body = await page.locator('body').innerText();
check('5. choosing a grade level narrows the sections to that grade',
  /Pearl/.test(body),
  'offering every section in the school invites Grade 9 marks in a Grade 7 register');

await pick('Section', /Pearl/);
await pick('Subject', /Mathematics 10/);
body = await page.locator('body').innerText();

check('6. the class resolves once the three choices are made',
  /Grade 10 – Pearl · Mathematics 10/.test(body),
  'the whole point — a workbook the file could not place, placed by hand');

check('7. and the import is no longer a no-op',
  !/this import will do nothing/.test(body));

/* ---- 8. the choice is shown as a departure from the file ------------- */
check('8. choosing against the workbook is called out',
  /you have chosen something else/.test(body),
  'the file says GMRC and Mathematics 10 was chosen; that must not be silent');

/* ---- 9. components come back once there is a scheme ------------------ */
check('9. with a subject chosen, the components resolve',
  !/component, so there is nothing to attach/.test(body));

/* ---- 10. the import can actually be run ------------------------------ */
const importBtn = page.getByRole('button', { name: /^Import \d+ marks$/ });
check('10. the Import button is enabled',
  (await importBtn.count()) === 1 && await importBtn.isEnabled(),
  'six errors and a dead end is where this started');

await browser.close();
console.log('PASS:'); for (const o of ok) console.log('  ✓', o);
if (fails.length) { console.log('FAIL:'); for (const f of fails) console.log('  ✗', f); process.exit(1); }
console.log(`\nall ${ok.length} checks passed`);
