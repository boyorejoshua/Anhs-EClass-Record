/**
 * Grade level, then section — as actually rendered.
 *
 * The 2026-09-04 role walkthrough reported nine screens listing classes
 * and learners in an order that made no sense to a school. The cause was
 * not "unsorted": `my_classes` orders server-side on
 * `c ->> 'gradeLevel'`, and `ReportPicker` sorted the assembled label —
 * both of which are TEXT compares, and `'Grade 10' < 'Grade 7'` as text.
 *
 * A unit test on the comparator cannot catch a screen that forgets to
 * call it, so this drives the real app and reads the real DOM order.
 *
 *   VITE_DEMO_MODE=true VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
 *     npx vite --port 5199 --strictPort
 *   node e2e/grade-section-ordering.mjs
 */
import { execSync } from 'node:child_process';
const { chromium } = await import(
  `${execSync('npm root -g', { encoding: 'utf8' }).trim()}/playwright/index.mjs`
);

const fails = [], ok = [];
const check = (n, c, d = '') => (c ? ok : fails).push(`${n}${d ? ` — ${d}` : ''}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1150 } });
page.on('pageerror', (e) => fails.push(`PAGE ERROR: ${e.message}`));

const asRole = async (r) => {
  await page.getByRole('button', { name: r, exact: true }).click();
  await page.waitForTimeout(450);
};
const openNav = async (label) => {
  await page.getByRole('button', { name: new RegExp(`^.?\\s*${label}$`) }).first().click();
  await page.waitForTimeout(700);
};

/** Rank each line that names a grade, in the order the DOM lists them. */
const gradeSequence = (text) =>
  [...text.matchAll(/Grade\s+(\d+)/g)].map((m) => Number(m[1]));

/** Is `seq` non-decreasing? That is the whole contract. */
const nonDecreasing = (seq) => seq.every((n, i) => i === 0 || seq[i - 1] <= n);

await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });

/* ---- 1-3. My Classes — the four-in-one picker component ------------- */
await asRole('Subject');
await openNav('My Classes');
const myClasses = await page.locator('.grid-cards, .tbl').first().innerText();
const seq1 = gradeSequence(myClasses);

check('1. My Classes lists more than one grade level, so order is observable',
  new Set(seq1).size > 1, `saw ${JSON.stringify(seq1)}`);
check('2. My Classes runs low grade to high, numerically',
  nonDecreasing(seq1), `saw ${JSON.stringify(seq1)}`);
// The regression in one assertion: text order would put 10 before 9.
check('3. Grade 9 precedes Grade 10 — the lexical order would not',
  seq1.indexOf(9) !== -1 && seq1.indexOf(10) !== -1
    ? seq1.indexOf(9) < seq1.indexOf(10) : false,
  `saw ${JSON.stringify(seq1)}`);

/* ---- 4-5. Attendance is the same component, used as a picker -------- */
await openNav('Attendance');
const attendance = await page.locator('.grid-cards, .tbl').first().innerText();
const seq2 = gradeSequence(attendance);
check('4. Attendance — the class picker is ordered too',
  nonDecreasing(seq2), `saw ${JSON.stringify(seq2)}`);
check('5. Attendance shows the same order as My Classes',
  JSON.stringify(seq2) === JSON.stringify(seq1),
  `${JSON.stringify(seq2)} vs ${JSON.stringify(seq1)}`);

/* ---- 6-7. Analytics — a different component, ReportPicker ----------- */
await openNav('Analytics');
const optionText = await page.locator('select option').allInnerTexts();
const seq3 = gradeSequence(optionText.join('\n'));
check('6. Analytics — the class chooser is ordered numerically',
  seq3.length > 0 && nonDecreasing(seq3), `saw ${JSON.stringify(seq3)}`);
check('7. Analytics agrees with My Classes on order',
  JSON.stringify(seq3) === JSON.stringify(seq1),
  `${JSON.stringify(seq3)} vs ${JSON.stringify(seq1)}`);

/* ---- 8-9. Academic Records — the registrar's whole-school directory - */
await asRole('Registrar');
await openNav('Academic Records');
const records = await page.locator('.tbl').first().innerText();
const seq4 = gradeSequence(records);
check('8. Academic Records lists learners low grade to high',
  seq4.length > 0 && nonDecreasing(seq4), `saw ${JSON.stringify(seq4)}`);
check('9. and spans more than one grade, so that means something',
  new Set(seq4).size > 1, `saw ${JSON.stringify(seq4)}`);

await browser.close();
console.log('PASS:'); for (const o of ok) console.log('  ✓', o);
if (fails.length) {
  console.log('FAIL:'); for (const f of fails) console.log('  ✗', f);
  process.exit(1);
}
