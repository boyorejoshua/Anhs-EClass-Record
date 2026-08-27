/**
 * The learner directory: grade levels first, and Senior High exists.
 *
 * Two things a registrar found by using the product.
 *
 * ONE. Grades 11 and 12 were not there. `grade_levels` has been rows
 * rather than a fixed <select> since migration 0003 — the schema was
 * never the limit — but only G7-G10 were ever seeded, so a school
 * running Senior High could not enter Senior High. "Configurable" is
 * worth nothing to the person at the screen if nobody configured it.
 *
 * TWO. Opening Students dumped every learner in the school into the
 * browser and then let dropdowns hide most of them again. Checks 3-9
 * are the reversal: nothing loads until a grade level is chosen, and
 * the filter runs in the database.
 *
 *   VITE_DEMO_MODE=true VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
 *     npx vite --port 5199 --strictPort
 *   node e2e/student-directory.mjs
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

await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Registrar', exact: true }).click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: /^Students$/ }).first().click();
await page.waitForTimeout(700);

const bar = page.locator('.level-bar');
const chip = (name) => bar.getByRole('button', { name: new RegExp(`^${name}\\b`) });

/* ---- 1-2. Senior High exists and is marked as its own cycle --------- */
const levelText = await bar.innerText();
check('1. every grade level the school runs is offered, 7 through 12',
  ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12']
    .every((g) => levelText.includes(g)),
  'G11/G12 were absent before, so a Senior High could not be set up at all');

check('2. Senior High is labelled, not silently appended to junior high',
  /Senior High/i.test(levelText),
  'Grades 11-12 are a different cycle with different weights, not KS3 + 2');

/* ---- 3. nothing is listed until a level is chosen ------------------- */
let body = await page.locator('body').innerText();
check('3. THE SCREEN DOES NOT OPEN ON A LIST',
  /Choose a grade level/i.test(body) && !/Abad, Juan/.test(body),
  'a school of 1,500 should not send 1,500 rows to a screen showing forty');

/* ---- 4. counts are on the chips, before anything is opened --------- */
check('4. each level carries its own enrolled count',
  /Grade 10\s*\n\s*20\b/.test(levelText),
  'the count is the information — it is what decides where you look');

/* ---- 5-6. choosing a level loads exactly that level ----------------- */
await chip('Grade 10').click();
await page.waitForTimeout(600);
body = await page.locator('body').innerText();
check('5. choosing Grade 10 lists the Grade 10 learners',
  /Abad, Juan/.test(body) && /Villanueva, Enzo/.test(body));
check('6. and nobody from another level leaks in',
  !/Domingez, Philip/.test(body) && !/Ilagan, Marife/.test(body),
  'the filter runs in Postgres, so this is the filter actually under test');

/* ---- 7. a different level really is a different roster -------------- */
await chip('Grade 9').click();
await page.waitForTimeout(600);
body = await page.locator('body').innerText();
check('7. Grade 9 is its own roster, not the same rows relabelled',
  /Ilagan, Marife/.test(body) && /Sarmiento, Elias/.test(body) && !/Abad, Juan/.test(body));

/* ---- 8. an empty level says so, and says what to do ----------------- */
await chip('Grade 11').click();
await page.waitForTimeout(600);
body = await page.locator('body').innerText();
check('8. an empty grade level renders as empty, not as broken',
  /Nobody in Grade 11 yet/i.test(body) && /Add student/.test(body),
  'a school given Grade 11 today has nobody in it — that is a state, not a fault');

/* ---- 9. a learner with no section is still findable ----------------- */
await chip('Grade 7').click();
await page.waitForTimeout(600);
body = await page.locator('body').innerText();
check('9. a learner admitted before sectioning is not lost',
  /Domingez, Philip/.test(body),
  'admitted-but-unsectioned is real, and was the case nobody tried');
check('9b. and their missing LRN is named rather than shown as a dash',
  /not yet issued/i.test(body));

/* ---- 10-11. search is school-wide, and drops the level -------------- */
await page.getByLabel('Search learners').fill('Ilagan');
await page.getByRole('button', { name: 'Search', exact: true }).click();
await page.waitForTimeout(700);
body = await page.locator('body').innerText();
check('10. search crosses grade levels',
  /Ilagan, Marife/.test(body),
  'searching by name is exactly when you do NOT know the grade level');
check('11. and searching releases the chosen level rather than intersecting it',
  await bar.locator('button[aria-pressed="true"]').count() === 0,
  'a search result under a Grade 7 heading would be a lie about what is on screen');

/* ---- 12. Clear returns to the choose-a-level state ------------------ */
await page.getByRole('button', { name: 'Clear', exact: true }).click();
await page.waitForTimeout(500);
body = await page.locator('body').innerText();
check('12. Clear returns to "choose a level", not to a full dump',
  /Choose a grade level/i.test(body) && !/Ilagan, Marife/.test(body));

/* ---- 13. section filter waits for a level --------------------------- */
const sectionSelect = page.getByLabel('Filter by section');
check('13. the section filter says it needs a grade level first',
  await sectionSelect.isDisabled()
    && /Choose a grade level first/.test(await sectionSelect.innerText()),
  'a disabled control with no explanation reads as a bug');

await chip('Grade 10').click();
await page.waitForTimeout(600);
check('13b. and becomes usable once one is chosen',
  !(await sectionSelect.isDisabled()));

/* ---- 14. section narrows within the level --------------------------- */
await sectionSelect.selectOption('Pearl');
await page.waitForTimeout(400);
body = await page.locator('body').innerText();
check('14. section narrows inside the level',
  /Abad, Juan/.test(body),
  'this filter stays in the browser, correctly: the rows in hand are already the level');

/* ---- 15. Grade 11/12 can be enrolled INTO, not just displayed ------- */
await page.getByRole('button', { name: '+ Add student' }).click();
await page.waitForTimeout(600);
const gradeOptions = await page.getByLabel(/Grade level/).innerText();
check('15. Grade 11 and 12 can be enrolled into, not merely listed',
  /Grade 11/.test(gradeOptions) && /Grade 12/.test(gradeOptions),
  'the same seeding has to reach every grade-level dropdown, not just this screen');

await browser.close();
console.log('PASS:'); for (const o of ok) console.log('  ✓', o);
if (fails.length) { console.log('FAIL:'); for (const f of fails) console.log('  ✗', f); process.exit(1); }
console.log(`\nall ${ok.length} checks passed`);
