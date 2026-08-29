/**
 * Phase 1.5 — the learner's own schedule, through the real portal.
 *
 * The database has NO timetable model. `classes.schedule_note` is a
 * free-typed string ('MWF 8:00-9:00' by convention, nothing by
 * constraint) and `classes.room` is free text. There is no day, no
 * start time, no end time.
 *
 * So this screen shows what the school actually recorded, verbatim, and
 * says plainly when a field is absent. A learner shown a confidently
 * wrong "Monday 08:00" parsed out of an unvalidated string is worse
 * served than one shown the note their teacher wrote.
 *
 *   VITE_DEMO_MODE=true VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
 *     npx vite --port 5199 --strictPort
 *   node e2e/student-schedule.mjs
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
page.on('console', (m) => {
  if (m.type() === 'error' && !/googleapis|ERR_CONNECTION_RESET/.test(m.text())) {
    fails.push(`CONSOLE: ${m.text()}`);
  }
});

const body = () => page.locator('body').innerText();
const menu = () => page.locator('.side-nav').innerText();

await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });

/* ---- 1-2. only the student has it ----------------------------------- */
for (const role of ['Registrar', 'Administrator', 'Subject']) {
  await page.getByRole('button', { name: role, exact: true }).click();
  await page.waitForTimeout(400);
  check(`1. ${role} has no My Schedule entry`, !(await menu()).includes('My Schedule'),
    'a timetable belongs to the learner it is for');
}

await page.getByRole('button', { name: 'Student', exact: true }).click();
await page.waitForTimeout(600);
check('2. the student does', (await menu()).includes('My Schedule'));

/* ---- 3-7. the schedule itself --------------------------------------- */
await page.getByRole('button', { name: /^My Schedule$/ }).first().click();
await page.waitForTimeout(900);
let t = await body();

check('3. it opens a real screen, not "not available"',
  !/not available/i.test(t) && /My Schedule/.test(t));

check('4. it names the enrolment the schedule belongs to',
  /Grade 10/.test(t) && /Pearl/.test(t),
  'derived from the current enrolment, never chosen by the learner');

// innerText returns text-transform: uppercase headers as uppercase.
check('5. and lists subject, teacher, when and room',
  /Subject/i.test(t) && /Teacher/i.test(t) && /When/i.test(t) && /Room/i.test(t));

check('6. the schedule note is shown VERBATIM',
  /MWF 8:00-9:00/.test(t),
  'not parsed into a day and a time the database does not hold');

const rows = await page.locator('.tbl tbody tr').count();
check('7. one row per class the learner is actually in', rows >= 2, `${rows} rows`);

/* ---- 8-9. absent fields say so -------------------------------------- */
const mapeh = page.locator('tr', { hasText: 'MAPEH' }).first();
const mapehText = await mapeh.innerText();
check('8. a class with no teacher says so rather than showing a blank',
  /not assigned yet/.test(mapehText), mapehText.replace(/\n/g, ' | '));

check('9. and a class with no room does not invent one',
  /—/.test(mapehText));

/* ---- 10. the honest note -------------------------------------------- */
check('10. it says the page reflects the school\'s records',
  /exactly as your school recorded them/i.test(t),
  'a learner who spots an error is told who to tell');

/* ---- 11-12. the rest of the portal still works ---------------------- */
await page.getByRole('button', { name: /^My Grades$/ }).first().click();
await page.waitForTimeout(700);
check('11. My Grades still works', !/not available/i.test(await body()));

await page.getByRole('button', { name: /^Academic History$/ }).first().click();
await page.waitForTimeout(700);
check('12. Academic History still works', !/not available/i.test(await body()));

await browser.close();
console.log('PASS:'); for (const o of ok) console.log('  ✓', o);
if (fails.length) { console.log('FAIL:'); for (const f of fails) console.log('  ✗', f); process.exit(1); }
console.log(`\nall ${ok.length} checks passed`);
