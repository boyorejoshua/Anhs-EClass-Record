/**
 * Student Management, driven in the real app.
 *
 * The property under test is the one the schema exists to protect: a
 * learner is a PERSON, and moving them between sections or grade levels
 * must never produce a second one. A unit test can assert that about a
 * function; only this can assert it about the screens a registrar
 * actually uses.
 *
 *   VITE_DEMO_MODE=true VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
 *     npx vite --port 5199 --strictPort
 *   node e2e/student-management.mjs
 */
import { execSync } from 'node:child_process';
const { chromium } = await import(
  `${execSync('npm root -g', { encoding: 'utf8' }).trim()}/playwright/index.mjs`
);

const fails = [], ok = [];
const check = (n, c, d = '') => (c ? ok : fails).push(`${n}${d ? ` — ${d}` : ''}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
page.on('pageerror', (e) => fails.push(`PAGE ERROR: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !/googleapis|ERR_CONNECTION_RESET/.test(m.text())) {
    fails.push(`CONSOLE: ${m.text()}`);
  }
});

// The directory no longer opens on a list — it opens on the school's
// grade levels and asks which one. Every count below is therefore a
// count WITHIN a level, which is what a registrar is ever actually
// looking at.
// Idempotent on purpose: clicking the chip that is already chosen
// deselects it, which is right for a person and wrong for a helper.
const pickGrade = async (name = 'Grade 10') => {
  const chip = page.locator('.level-bar')
    .getByRole('button', { name: new RegExp(`^${name}\\b`) });
  if (await chip.getAttribute('aria-pressed') === 'true') return;
  await chip.click();
  await page.waitForTimeout(700);
};
const openStudents = async (grade = 'Grade 10') => {
  await page.getByRole('button', { name: /Students/ }).first().click();
  await page.waitForTimeout(700);
  if (grade) await pickGrade(grade);
};
const rowCount = () => page.locator('tbody tr').count();

await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });

/* ---- 1. the registrar can add; a teacher cannot ---------------------- */
await page.getByRole('button', { name: 'Subject', exact: true }).click();
await page.waitForTimeout(400);
await openStudents();
check('a teacher sees the directory once they choose a grade level',
  (await rowCount()) > 0, `${await rowCount()} learners`);
check('a teacher is NOT offered Add student',
  (await page.getByRole('button', { name: /Add student/i }).count()) === 0);

await page.getByRole('button', { name: 'Registrar', exact: true }).click();
await page.waitForTimeout(400);
await openStudents();
const before = await rowCount();
check('the registrar IS offered Add student',
  (await page.getByRole('button', { name: /Add student/i }).count()) === 1);

/* ---- 2. add a learner ------------------------------------------------ */
await page.getByRole('button', { name: /Add student/i }).click();
await page.waitForTimeout(600);
check('the form separates learner from enrolment',
  /Learner/.test(await page.locator('body').innerText())
  && /Enrolment/.test(await page.locator('body').innerText()));

const submit = page.getByRole('button', { name: 'Add student', exact: true });
check('submit is disabled until the required fields are filled',
  await submit.isDisabled());

// Required fields render their label with a trailing "*", which lands in
// the accessible name — so match by prefix, not exactly.
const field = (name) => page.getByLabel(new RegExp(`^${name}`));
await field('Last name').fill('Verification');
await field('First name').fill('Test');
await field('LRN').fill('112233445566');
await field('Grade level').selectOption({ label: 'Grade 10' });
await page.waitForTimeout(200);
await field('Section').selectOption({ label: 'Pearl' });
check('submit enables once the record is valid', !(await submit.isDisabled()));
await submit.click();
await page.waitForTimeout(900);

/* ---- 3. it lands on the profile -------------------------------------- */
let body = await page.locator('body').innerText();
check('lands on the new learner\'s record',
  /Verification, Test/.test(body), body.slice(0, 90).replace(/\n/g, ' '));
check('the record shows the LRN', /112233445566/.test(body));
check('the record shows the current enrolment',
  /Current enrolment/.test(body) && /Grade 10/.test(body) && /Pearl/.test(body));
check('a first-year learner has no earlier years',
  /first year on record/i.test(body), 'the empty state must say why, not just be empty');

/* ---- 4. the directory grew by exactly one ---------------------------- */
await page.getByRole('button', { name: /← Students/ }).click();
await page.waitForTimeout(800);
await pickGrade();
check('the directory grew by exactly one',
  (await rowCount()) === before + 1, `${before} → ${await rowCount()}`);

/* ---- 5. a duplicate LRN is refused, in words ------------------------- */
await page.getByRole('button', { name: /Add student/i }).click();
await page.waitForTimeout(500);
await field('Last name').fill('Duplicate');
await field('First name').fill('Attempt');
await field('LRN').fill('112233445566');
await field('Grade level').selectOption({ label: 'Grade 10' });
await page.getByRole('button', { name: 'Add student', exact: true }).click();
await page.waitForTimeout(700);
body = await page.locator('body').innerText();
check('a duplicate LRN is refused',
  /already exists/i.test(body), body.match(/A learner with[^\n]*/)?.[0] ?? '(no message)');
check('the refusal names the learner it clashes with',
  /Verification, Test/.test(body.match(/A learner with[^\n]*/)?.[0] ?? ''));

await page.getByRole('button', { name: /Cancel/ }).click();
await page.waitForTimeout(600);
await pickGrade();
check('the refused attempt created nothing',
  (await rowCount()) === before + 1, `still ${await rowCount()}`);

await page.screenshot({ path: '/tmp/students-final.png', fullPage: true });
await browser.close();

console.log('PASS:'); for (const o of ok) console.log('  ✓', o);
if (fails.length) { console.log('FAIL:'); for (const f of fails) console.log('  ✗', f); process.exit(1); }
console.log(`\nall ${ok.length} checks passed`);
