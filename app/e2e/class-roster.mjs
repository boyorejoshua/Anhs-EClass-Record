/**
 * A teacher puts learners into the class they teach.
 *
 * ⚠️ THIS IS THE REGRESSION TEST FOR A DEAD END WE SHIPPED. Migration
 * 0032 let a teacher create a class in a section they named themselves;
 * the roster fills from the section's enrolment, and a brand-new
 * section has none. So the feature's happy path ended in an empty
 * gradebook with no way to fill it. Every test passed because every
 * test used a SEEDED section that already had learners — which is
 * exactly why check 1 below creates a NEW one first.
 *
 * The other property under test is that opening this door did not
 * reopen V0's defect: one learner in two subjects must stay ONE person.
 *
 *   VITE_DEMO_MODE=true VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
 *     npx vite --port 5199 --strictPort
 *   node e2e/class-roster.mjs
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

const openStudentsTab = async () => {
  await page.getByRole('tab', { name: /^students$/i }).click();
  await page.waitForTimeout(700);
};

await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });

/* ---- 1. reproduce the dead end: a class in a BRAND-NEW section ------- */
await page.getByRole('button', { name: /my classes/i }).first().click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: /^\+ Add class$/ }).click();
await page.waitForTimeout(500);
await page.getByLabel('Section *').selectOption('__new');
await page.waitForTimeout(200);
await page.getByLabel('Grade level *').selectOption({ label: 'Grade 7' });
await page.getByLabel('Section name *').fill('Rosal');
await page.getByLabel('Subject *').selectOption({ label: 'English 10' });
await page.getByRole('button', { name: /^Add class$/ }).click();
await page.waitForTimeout(1000);

const rosalCard = page.locator('.class-card', { hasText: 'Rosal' }).first();
check('1. the new class exists', (await rosalCard.count()) === 1);
await rosalCard.getByRole('button', { name: 'Open class' }).click();
await page.waitForTimeout(600);
await openStudentsTab();

let t = await page.locator('body').innerText();
check('2. THE DEAD END IS GONE — the empty class offers a way to fill it',
  /Add a learner/i.test(t), t.slice(0, 200).replace(/\n/g, ' / '));
check('2b. and the empty state points at the right path',
  /pick them from the list rather than typing/i.test(t));

/* ---- 3. picking an existing learner comes first ---------------------- */
const seg = page.locator('.seg[aria-label="How to add"]');
const segLabels = await seg.locator('button').allInnerTexts();
check('3. "Already on file" is offered before "New to the school"',
  /Already on file/.test(segLabels[0] ?? ''), segLabels.join(' | '));
check('3b. and it is the mode selected by default',
  await seg.locator('button').first().getAttribute('aria-pressed') === 'true');

const candidates = await page.getByLabel('Learner *').locator('option').allInnerTexts();
check('3c. the school\'s existing learners are offered',
  candidates.length > 1, `${candidates.length - 1} candidates`);

const pick = candidates[1];
await page.getByLabel('Learner *').selectOption({ label: pick });
await page.getByRole('button', { name: /^Add to class$/ }).click();
await page.waitForTimeout(900);
check('3d. the learner joined the class', /Class list/.test(await page.locator('body').innerText()));
check('3e. the class list has exactly one row',
  (await page.locator('.panel', { hasText: 'Class list' }).locator('tbody tr').count()) === 1);

/* ---- 4. a genuinely new learner, and the LRN flag -------------------- */
await seg.locator('button', { hasText: 'New to the school' }).click();
await page.waitForTimeout(300);
await page.getByLabel('First name *').fill('Nena');
await page.getByLabel('Last name *').fill('Bautista');
await page.getByLabel('Sex').selectOption('female');
await page.waitForTimeout(200);
check('4. it warns that a typed learner will have no LRN',
  /no LRN yet/i.test(await page.locator('body').innerText()));
await page.getByRole('button', { name: /^Add to class$/ }).click();
await page.waitForTimeout(900);

const listPanel = page.locator('.panel', { hasText: 'Class list' });
const nenaRow = listPanel.locator('tbody tr', { hasText: 'Bautista' }).first();
check('4b. the new learner is on the roster', (await nenaRow.count()) === 1);
check('4c. AND IS MARKED AS OWING AN LRN, not silently incomplete',
  /Needs LRN/i.test(await nenaRow.innerText()), (await nenaRow.innerText()).replace(/\n/g, ' | '));

/* ---- 5. THE DUPLICATE GUARD ------------------------------------------ */
// Different capitalisation and spacing of somebody already on file must
// be caught before it becomes a second record for one child.
await seg.locator('button', { hasText: 'New to the school' }).click();
await page.waitForTimeout(300);
const existingName = pick.split(' · ')[0];          // "Last, First"
const [lastN, firstN] = existingName.split(', ');
await page.getByLabel('First name *').fill(firstN.toLowerCase());
await page.getByLabel('Last name *').fill(`  ${lastN.toUpperCase()} `);
await page.waitForTimeout(400);
t = await page.locator('body').innerText();
check('5. a same-name learner is caught BEFORE submitting',
  /is already on file/i.test(t), t.slice(0, 240).replace(/\n/g, ' / '));
check('5b. and Add is blocked until it is confirmed',
  await page.getByRole('button', { name: /^Add to class$/ }).isDisabled());

// A real namesake can still be confirmed through — refusing outright
// would be wrong; two children really can share a name.
await page.locator('.notice .check input[type=checkbox]').check();
await page.waitForTimeout(200);
check('5c. confirming it is a different learner unblocks Add',
  !(await page.getByRole('button', { name: /^Add to class$/ }).isDisabled()));

/* ---- 6. removal is class-only, and refused once scored --------------- */
t = await page.locator('body').innerText();
check('6. it states removal never withdraws them from the school',
  /never withdraws them from the school/i.test(t));
check('6b. and that it is refused once a mark exists',
  /refused once any mark has been recorded/i.test(t));

const removable = listPanel.getByRole('button', { name: /^Remove$/ });
check('6c. a learner with no marks CAN be removed', (await removable.count()) > 0);
const before = await listPanel.locator('tbody tr').count();
await removable.first().click();
await page.waitForTimeout(900);
check('6d. removing takes exactly one learner off the list',
  (await listPanel.locator('tbody tr').count()) === before - 1,
  `${before} -> ${await listPanel.locator('tbody tr').count()}`);

/* ---- 7. one learner, two subjects, still ONE person ------------------ */
// V0's defining defect was a student owned by a class. Adding the same
// person to a second class must not mint a second record.
await page.getByRole('button', { name: /my classes/i }).first().click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: /^\+ Add class$/ }).click();
await page.waitForTimeout(500);
await page.getByLabel('Section *').selectOption('__new');
await page.waitForTimeout(200);
await page.getByLabel('Grade level *').selectOption({ label: 'Grade 7' });
await page.getByLabel('Section name *').fill('Rosal');
await page.getByLabel('Subject *').selectOption({ label: 'Science 10' });
await page.getByRole('button', { name: /^Add class$/ }).click();
await page.waitForTimeout(1000);
await page.locator('.class-card', { hasText: 'Science 10' }).first()
  .getByRole('button', { name: 'Open class' }).click();
await page.waitForTimeout(600);
await openStudentsTab();

// Rosal now exists, so this second class inherits its enrolment — the
// learner may be ON the roster rather than a candidate. Either is fine;
// what must NOT happen is appearing in both, or twice in one, which is
// what a second person record would look like.
// Match the FULL name: the seeded fixture already contains a
// "Bautista, Pedro R.", and a substring filter counted him as a
// duplicate of Nena. A loose assertion here would have reported the
// V0 defect returning when nothing was wrong.
const isNena = (o) => /Bautista,\s*Nena/.test(o);
const candidateText = (await page.getByLabel('Learner *').locator('option').allInnerTexts())
  .filter(isNena);
const rosterText = (await page.locator('.panel', { hasText: 'Class list' })
  .locator('tbody tr').allInnerTexts()).filter(isNena);
check('7. the learner exists exactly ONCE across roster + candidates',
  candidateText.length + rosterText.length === 1,
  `roster ${rosterText.length}, candidates ${candidateText.length}`);

await browser.close();
console.log('PASS:'); for (const o of ok) console.log('  ✓', o);
if (fails.length) { console.log('FAIL:'); for (const f of fails) console.log('  ✗', f); process.exit(1); }
console.log(`\nall ${ok.length} checks passed`);
