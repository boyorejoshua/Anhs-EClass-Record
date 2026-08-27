/**
 * A teacher adds the class they themselves teach.
 *
 * The earlier answer (migration 0029) was registrar-only. That was right
 * about DATA INTEGRITY and wrong about AUTHORITY, and the two got
 * answered as one. So the property this asserts is not "the button
 * works" — it is that opening the door did not reopen the defect the
 * door was closed against:
 *
 *   · a section typed with different capitalisation JOINS the existing
 *     section; it does not fork it;
 *   · creating a class in a section does NOT make you its adviser;
 *   · a registrar (who assigns classes to other people) does not get
 *     this button — theirs is Classes & Sections.
 *
 *   VITE_DEMO_MODE=true VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
 *     npx vite --port 5199 --strictPort
 *   node e2e/teacher-add-class.mjs
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

const asRole = async (role) => {
  await page.getByRole('button', { name: role, exact: true }).click();
  await page.waitForTimeout(400);
};
const openMyClasses = async () => {
  await page.getByRole('button', { name: /my classes/i }).first().click();
  await page.waitForTimeout(500);
};

await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });

/* ---- 1. the button is there for a teacher ---------------------------- */
await openMyClasses();
const addBtn = page.getByRole('button', { name: /^\+ Add class$/ });
check('1. a subject teacher is offered + Add class', (await addBtn.count()) === 1);

const cardsBefore = await page.locator('.class-card').count();

/* ---- 2. the form has no teacher field -------------------------------- */
await addBtn.click();
await page.waitForTimeout(500);
let t = await page.locator('body').innerText();
check('2. the form says the teacher will be you',
  /You will be its teacher/i.test(t), t.slice(0, 240).replace(/\n/g, ' / '));
check('2b. and offers NO teacher dropdown',
  (await page.getByLabel(/^Teacher/).count()) === 0,
  'a teacher cannot create a class for somebody else');
check('2c. it promises the roster fills itself',
  /roster fills itself/i.test(t));

/* ---- 3. add a class in an EXISTING section --------------------------- */
const sectionSelect = page.getByLabel('Section *');
const sectionOptions = await sectionSelect.locator('option').allInnerTexts();
check('3. existing sections are offered with their learner counts',
  sectionOptions.some((o) => /Pearl.*learners/i.test(o)), sectionOptions.join(' | '));
check('3b. and a "not listed" escape hatch exists',
  sectionOptions.some((o) => /not listed/i.test(o)));

const pearlValue = await sectionSelect.locator('option').evaluateAll(
  (os) => os.find((o) => /Grade 10 . Pearl/.test(o.textContent ?? ''))?.value ?? '');
check('3b2. the Pearl option was found', pearlValue !== '');
await sectionSelect.selectOption(pearlValue);
await page.getByLabel('Subject *').selectOption({ label: 'English 10' });
await page.getByLabel('Schedule').fill('TTh 10:00-11:00');
await page.getByLabel('Room').fill('Room 305');
await page.getByRole('button', { name: /^Add class$/ }).click();
await page.waitForTimeout(900);

t = await page.locator('body').innerText();
check('3c. the class appears in My Classes', /English 10/.test(t));
check('3d. one more card than before',
  (await page.locator('.class-card').count()) === cardsBefore + 1,
  `${cardsBefore} -> ${await page.locator('.class-card').count()}`);
const engCard = page.locator('.class-card', { hasText: 'English 10' }).first();
check('3e. the roster came from the section, not from typing',
  /\d+ learners/.test(await engCard.innerText()), (await engCard.innerText()).replace(/\n/g, ' | '));

/* ---- 4. the duplicate-subject guard ---------------------------------- */
await page.getByRole('button', { name: /^\+ Add class$/ }).click();
await page.waitForTimeout(500);
await page.getByLabel('Section *').selectOption(pearlValue);
await page.getByLabel('Subject *').selectOption({ label: 'English 10' });
await page.waitForTimeout(300);
check('4. re-adding the same subject in the same section is caught before submitting',
  /already teach this subject in this section/i.test(await page.locator('body').innerText()));
check('4b. and Add class is disabled',
  await page.getByRole('button', { name: /^Add class$/ }).isDisabled());

/* ---- 5. A NEW SECTION, TYPED — the integrity case -------------------- */
await page.getByLabel('Section *').selectOption('__new');
await page.waitForTimeout(300);
t = await page.locator('body').innerText();
check('5. typing a section warns that a matching name joins the existing one',
  /will not create a second one/i.test(t), t.slice(0, 200).replace(/\n/g, ' / '));
check('5b. and states you do not become its adviser',
  /do not become its adviser/i.test(t));

await page.getByLabel('Grade level *').selectOption({ label: 'Grade 7' });
await page.getByLabel('Section name *').fill('Sampaguita');
await page.getByLabel('Subject *').selectOption({ label: 'Science 10' });
await page.getByRole('button', { name: /^Add class$/ }).click();
await page.waitForTimeout(900);
check('5c. the class in the brand-new section was created',
  /Sampaguita/.test(await page.locator('body').innerText()));

/* ---- 6. THE DEFECT THAT MUST NOT COME BACK ---------------------------- */
// Different capitalisation of a section that now exists must resolve
// onto it, not fork it. This is the exact bug the registrar-only gate
// was justified by, so it is the one worth proving.
await page.getByRole('button', { name: /^\+ Add class$/ }).click();
await page.waitForTimeout(500);
const opts = await page.getByLabel('Section *').locator('option').allInnerTexts();
const sampaguitaOptions = opts.filter((o) => /sampaguita/i.test(o));
check('6. "Sampaguita" exists exactly ONCE in the section list',
  sampaguitaOptions.length === 1, sampaguitaOptions.join(' | '));

await page.getByLabel('Section *').selectOption('__new');
await page.waitForTimeout(200);
await page.getByLabel('Grade level *').selectOption({ label: 'Grade 7' });
await page.getByLabel('Section name *').fill('SAMPAGUITA');
await page.getByLabel('Subject *').selectOption({ label: 'Mathematics 9' });
await page.getByRole('button', { name: /^Add class$/ }).click();
await page.waitForTimeout(900);

await page.getByRole('button', { name: /^\+ Add class$/ }).click();
await page.waitForTimeout(600);
const after = await page.getByLabel('Section *').locator('option').allInnerTexts();
const stillOne = after.filter((o) => /sampaguita/i.test(o));
check('6b. "SAMPAGUITA" JOINED IT — still exactly one section, not two',
  stillOne.length === 1, stillOne.join(' | '));
await page.getByRole('button', { name: /^Cancel$/ }).click();
await page.waitForTimeout(300);

/* ---- 7. the registrar does NOT get this button ------------------------ */
await asRole('Registrar');
const regNav = (await page.locator('nav button, aside button').allInnerTexts()).join(' | ');
check('7. the registrar has Classes & Sections instead',
  /Classes . Sections/.test(regNav));
check('7b. and no My Classes to add one from',
  !/My Classes/.test(regNav), regNav.replace(/\n/g, ''));

await browser.close();
console.log('PASS:'); for (const o of ok) console.log('  ✓', o);
if (fails.length) { console.log('FAIL:'); for (const f of fails) console.log('  ✗', f); process.exit(1); }
console.log(`\nall ${ok.length} checks passed`);
