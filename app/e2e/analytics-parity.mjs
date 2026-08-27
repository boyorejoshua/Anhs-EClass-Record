/**
 * Analytics — parity with the legacy screen.
 *
 * The bar chart already matched. What did not, and what a teacher
 * actually uses, was everything that names PEOPLE rather than counting
 * them: a bar saying seven learners sit in 86-90 is not actionable
 * until you know which seven.
 *
 *   VITE_DEMO_MODE=true VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
 *     npx vite --port 5199 --strictPort
 *   node e2e/analytics-parity.mjs
 */
import { execSync } from 'node:child_process';
const { chromium } = await import(
  `${execSync('npm root -g', { encoding: 'utf8' }).trim()}/playwright/index.mjs`
);

const fails = [], ok = [];
const check = (n, c, d = '') => (c ? ok : fails).push(`${n}${d ? ` — ${d}` : ''}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1200 } });
page.on('pageerror', (e) => fails.push(`PAGE ERROR: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !/googleapis|ERR_CONNECTION_RESET/.test(m.text())) {
    fails.push(`CONSOLE: ${m.text()}`);
  }
});

await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /my classes/i }).first().click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Open class' }).first().click();
await page.waitForTimeout(500);
// Term 2 is the deliberately-partial term in the fixtures, so it is the
// one where the missing-grade panels have anything to say.
await page.getByRole('button', { name: 'Term 2', exact: true }).click();
await page.waitForTimeout(400);
await page.getByRole('tab', { name: /^analytics$/i }).click();
await page.waitForTimeout(900);

const t = await page.locator('body').innerText();

/* ---- 1. the Graded x/y tile ------------------------------------------ */
const stats = await page.locator('.stat-row').first().allInnerTexts();
check('1. a Graded x/y tile replaces the bare Learners count',
  /\d+\/\d+\s*\n?GRADED/i.test(stats.join(' ')), stats.join(' | ').replace(/\n/g, ':'));

/* ---- 2. Students per performance band --------------------------------- */
check('2. the band panel exists', /Students per performance band/i.test(t));
const bands = page.locator('.band');
check('2b. every distribution band gets a card',
  (await bands.count()) === 7, `${await bands.count()} bands`);

// The panel's whole point: names AND grades, not just a count.
const populated = page.locator('.band', { has: page.locator('.band-list li') });
check('2c. at least one band names its learners',
  (await populated.count()) > 0, `${await populated.count()} populated bands`);
const firstEntry = await populated.first().locator('.band-list li').first().innerText();
check('2d. each entry carries a name AND a grade',
  /\S/.test(firstEntry) && /\d+$/.test(firstEntry.trim().replace(/\n/g, '')),
  firstEntry.replace(/\n/g, ' '));

// An empty band says so rather than rendering a blank card.
const empties = await page.locator('.band-empty').allInnerTexts();
check('2e. an empty band says "No students in this range"',
  empties.length === 0 || empties.every((e) => /No students in this range/i.test(e)),
  empties.join(' | '));

/* ---- 3. Students with missing grades ---------------------------------- */
check('3. the missing-grades panel appears when a term is partial',
  /Students with missing grades/i.test(t));
const chips = await page.locator('.name-chips li').allInnerTexts();
check('3b. it lists them by name', chips.length > 0, `${chips.length} learners`);
check('3c. and explains they are excluded rather than counted as zero',
  /rather than\s+counted as zero/i.test(t.replace(/\s+/g, ' ')));

/* ---- 4. Pass / Fail --------------------------------------------------- */
check('4. a Pass / Fail panel exists', /Pass \/ Fail/i.test(t));
check('4b. it shows the pass mark, not a hard-coded 75',
  /Passing \(≥\d+\)/.test(t), (t.match(/Passing \(≥\d+\)/) ?? ['none'])[0]);
// `.stat span` is uppercased by CSS, so innerText reads "TOP (90+)".
check('4c. Top (90+) and Missing tiles are present',
  /Top \(90\+\)/i.test(t) && /MISSING/i.test(t),
  (t.match(/TOP \(90\+\)[\s\S]{0,20}/i) ?? ['not found'])[0].replace(/\n/g, ' '));
check('4d. and it states the rate is of GRADED learners, not the class',
  /shares of the \d+ learner/i.test(t.replace(/\s+/g, ' ')));

/* ---- 5. THE MISSING BAND ROW ------------------------------------------ */
// Folding ungraded learners into "Below 75" would report unfinished
// marking as a cohort of failing children. It gets its own row.
check('5. the bands chart has a separate Missing row',
  (await page.locator('.dist-missing').count()) === 1);
const belowRow = page.locator('.dist-row', { hasText: 'Below 75' }).first();
const missingRow = page.locator('.dist-missing');
const belowN = Number((await belowRow.innerText()).match(/(\d+)\s*$/)?.[1] ?? -1);
const missingN = Number((await missingRow.innerText()).match(/(\d+)\s*$/)?.[1] ?? -1);
check('5b. MISSING IS NOT FOLDED INTO "Below 75"',
  missingN > 0 && belowN !== missingN,
  `Below 75 = ${belowN}, Missing = ${missingN}`);
check('5c. the count matches the named list exactly',
  missingN === chips.length, `row says ${missingN}, list has ${chips.length}`);

await browser.close();
console.log('PASS:'); for (const o of ok) console.log('  ✓', o);
if (fails.length) { console.log('FAIL:'); for (const f of fails) console.log('  ✗', f); process.exit(1); }
console.log(`\nall ${ok.length} checks passed`);
