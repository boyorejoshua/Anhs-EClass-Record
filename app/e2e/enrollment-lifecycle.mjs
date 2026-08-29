/**
 * Phase 1 — the student, enrolment and portal-account lifecycle.
 *
 * Three things the Phase 0 audit found and this phase closes:
 *
 *   · `enrollment_events` had been in the schema since migration 0005
 *     and was READ BY NOTHING. A learner's history began and ended at
 *     "where are they now".
 *   · A namesake was accepted silently. An LRN clash was refused; two
 *     "Juan Dela Cruz" with no LRN between them were not.
 *   · No learner could be given a portal account. `portal_user_id` was
 *     the link and nothing in the product could set it — an entire role
 *     with no door.
 *
 *   VITE_DEMO_MODE=true VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
 *     npx vite --port 5199 --strictPort
 *   node e2e/enrollment-lifecycle.mjs
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

const asRole = async (role) => {
  await page.getByRole('button', { name: role, exact: true }).click();
  await page.waitForTimeout(500);
};
const body = () => page.locator('body').innerText();
const menu = () => page.locator('.side-nav').innerText();

await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await asRole('Registrar');

/* ---- 1-2. the Enrollments route is no longer "planned" -------------- */
check('1. the registrar has an Enrollments entry', (await menu()).includes('Enrollments'));

await page.getByRole('button', { name: /^Enrollments$/ }).first().click();
await page.waitForTimeout(700);
let t = await body();
check('2. and it opens a real screen, not "not available"',
  !/not available/i.test(t) && /Pick a section/i.test(t),
  'nav.ts carried this as planned for the whole build');

/* ---- 3-5. a section at a time --------------------------------------- */
check('3. nothing is listed before a section is chosen',
  !/no account|Give access/.test(t),
  'a school year is too many learners to list at once');

await page.getByLabel('Section').selectOption({ label: 'Grade 10 – Pearl' });
await page.waitForTimeout(700);
t = await body();
check('4. choosing a section lists who is in it', /Pearl/.test(t) && /enrolled/.test(t));
check('5. and says how many cannot sign in yet',
  /without a portal account|every learner can sign in/.test(t),
  t.match(/\d+ enrolled[^\n]*/)?.[0] ?? '(no summary)');

/* ---- 6-8. give one learner access ----------------------------------- */
const firstRow = page.locator('tr', { hasText: 'no account' }).first();
const learnerName = (await firstRow.innerText()).split('\t')[0].trim();
await firstRow.getByRole('button', { name: 'Give access' }).click();
await page.waitForTimeout(400);

const form = page.locator('.tbl-editor');
await form.getByLabel(`Email address for ${learnerName}`).fill('learner@example.test');
await form.getByLabel(`Temporary password for ${learnerName}`).fill('short');
check('6. a password the auth provider would reject blocks the button',
  await form.getByRole('button', { name: 'Create account' }).isDisabled(),
  'refused here rather than after an account is half-made');

await form.getByLabel(`Temporary password for ${learnerName}`).fill('temporary1');
await form.getByRole('button', { name: 'Create account' }).click();
await page.waitForTimeout(900);
t = await body();
check('7. the account is created and the learner can sign in',
  /can now sign in/.test(t) && /learner@example.test/.test(t),
  t.match(/[^\n]*can now sign in[^\n]*/)?.[0] ?? '(no confirmation)');

check('8. and the row now shows the address rather than "no account"',
  /learner@example\.test/.test(
    await page.locator('tr', { hasText: learnerName }).first().innerText()));

/* ---- 9-12. the namesake warning ------------------------------------- */
await page.getByRole('button', { name: /^Students$/ }).first().click();
await page.waitForTimeout(700);
await page.getByRole('button', { name: /\+ Add student/ }).first().click();
await page.waitForTimeout(600);

// NOT exact: the required marker lives inside the label element, so the
// accessible name is "Last name *".
const fill = async (label, value) => {
  await page.getByLabel(label, { exact: false }).first().fill(value);
};
// Exactly the name of a learner already on the roll — the real
// scenario, a registrar re-typing somebody who is already here.
await fill('Last name', 'abad');
await fill('First name', 'JUAN C.');
await page.getByLabel('Grade level', { exact: false }).first().selectOption({ label: 'Grade 10' });
await page.getByRole('button', { name: /^Add student$/ }).click();
await page.waitForTimeout(800);
t = await body();

check('9. a learner already on file by that name raises a QUESTION, not an error',
  /already has a learner by that name/i.test(t),
  'an LRN clash is a certainty and throws; a name clash is a suspicion');

check('10. and the matching record is shown so a person can compare',
  /Abad, Juan C\./.test(t) && /Date of birth/i.test(t),
  'matched case-insensitively, the way the server normalises a name');

check('11. it is not styled as a failure',
  (await page.locator('.err-banner').count()) === 0
  || !/already has a learner by that name/i.test(
    await page.locator('.err-banner').first().innerText().catch(() => '')));

await page.getByRole('button', { name: /different person/i }).click();
await page.waitForTimeout(900);
t = await body();
check('12. confirming creates the second learner — namesakes are real',
  /Enrolment actions|Current enrolment/i.test(t),
  'refusing would leave a registrar unable to admit a real learner');

/* ---- 13-18. the enrolment lifecycle on the record ------------------- */
check('13. the record offers the acts a registrar performs',
  /Transfer section/.test(t) && /Withdraw/.test(t));

check('14. and shows the enrolment history it writes',
  /Enrolment history/i.test(t));

const events = await page.locator('.panel', { hasText: 'Enrolment history' }).innerText();
check('15. which already records the enrolment itself',
  /Enrolled/.test(events) && /Grade 10/.test(events),
  'a history that starts at the first transfer reads as though the learner appeared mid-year');

check('16. a first section reads as an assignment, not a move',
  !/—\s*→/.test(events),
  'rendering a null "from" as an arrow would say they came from nowhere');

await page.getByRole('button', { name: 'Transfer section' }).click();
await page.waitForTimeout(500);
const menuText = await page.locator('.inline-form select').first().innerText();
check('17. the transfer picker offers only sections at this grade level',
  !/Ruby/.test(menuText),
  menuText.replace(/\n/g, ' | '));

/* ---- 18-20. withdrawal demands a reason ----------------------------- */
await page.getByRole('button', { name: 'Cancel', exact: true }).click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Withdraw', exact: true }).first().click();
await page.waitForTimeout(500);
check('18. Withdraw is blocked until a reason is given',
  await page.getByRole('button', { name: 'Withdraw', exact: true }).last().isDisabled(),
  '"why did this learner leave" is the one question the record exists to answer');

await page.getByLabel('Reason', { exact: false }).first().fill('Family moved');
await page.getByLabel('Receiving school', { exact: false }).first().fill('Taytay NHS');
await page.getByRole('button', { name: 'Withdraw', exact: true }).last().click();
await page.waitForTimeout(1000);
t = await body();
check('19. the withdrawal is recorded and says what happened to the marks',
  /Enrolment closed/.test(t) && /kept/.test(t),
  t.match(/Enrolment closed[^\n]*/)?.[0] ?? '(no confirmation)');

check('20. a closed enrolment offers Re-enrol instead of Withdraw',
  /Re-enrol/.test(t));

/* ---- 21. the teacher gets none of it -------------------------------- */
await asRole('Subject');
check('21. a teacher has no Enrollments entry',
  !(await menu()).includes('Enrollments'),
  'the database refuses them either way; a control that only errors is not a control');

await browser.close();
console.log('PASS:'); for (const o of ok) console.log('  ✓', o);
if (fails.length) { console.log('FAIL:'); for (const f of fails) console.log('  ✗', f); process.exit(1); }
console.log(`\nall ${ok.length} checks passed`);
