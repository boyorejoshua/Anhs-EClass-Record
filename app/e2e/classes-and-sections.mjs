/**
 * Classes & Sections — the registrar's way to create a class at all.
 *
 * Before this screen, nothing created a section or a class except seed
 * data or an import that happened to name one. This checks the actual
 * gap that closed: a registrar can add a section, add a class to it,
 * and the class shows up with a roster already filled in — and that a
 * subject teacher cannot reach any of it.
 *
 *   VITE_DEMO_MODE=true VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
 *     npx vite --port 5199 --strictPort
 *   node e2e/classes-and-sections.mjs
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

const body = () => page.locator('body').innerText();

await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });

/* ---- 1. a subject teacher cannot reach class creation at all --------- */
const teacherNav = (await page.locator('nav button, aside button').allInnerTexts()).join(' | ');
check('a subject teacher has no Classes & Sections entry', !/Classes . Sections/.test(teacherNav));

/* ---- 2. switch to Registrar ------------------------------------------ */
await page.getByRole('button', { name: /^registrar$/i }).click();
await page.waitForTimeout(500);
const registrarNav = (await page.locator('nav button, aside button').allInnerTexts()).join(' | ');
check('the registrar has a Classes & Sections entry', /Classes . Sections/.test(registrarNav));

await page.getByRole('button', { name: /Classes . Sections/i }).first().click();
await page.waitForTimeout(500);

const before = await body();
check('existing sections are listed', /Pearl/.test(before) && /Diamond/.test(before));
check('existing classes are listed', /Mathematics 10/.test(before));

/* ---- 3. add a section ------------------------------------------------- */
await page.getByRole('button', { name: '+ Add section' }).click();
await page.waitForTimeout(300);
await page.getByLabel('Grade level').selectOption({ label: 'Grade 9' });
await page.getByLabel(/Section name/).fill('Amethyst');
await page.getByRole('button', { name: 'Add section' }).click();
await page.waitForTimeout(500);

let text = await body();
check('the new section appears in the list', /Amethyst/.test(text));

/* ---- 4. duplicate section name is refused ---------------------------- */
await page.getByRole('button', { name: '+ Add section' }).click();
await page.waitForTimeout(300);
await page.getByLabel('Grade level').selectOption({ label: 'Grade 9' });
await page.getByLabel(/Section name/).fill('amethyst');   // same name, different case
await page.getByRole('button', { name: 'Add section' }).click();
await page.waitForTimeout(500);
text = await body();
check('a duplicate section name is refused, not silently created',
  /already exists/i.test(text));
await page.getByRole('button', { name: 'Dismiss' }).click();
await page.getByRole('button', { name: 'Cancel' }).click();

/* ---- 5. add a class to the new section -------------------------------- */
// Scoped to the SECTIONS table specifically -- "Amethyst" now also
// appears in the Classes table below once a class exists in it.
const sectionsTable = page.locator('.panel', { hasText: 'Sections' }).first();
const row = sectionsTable.locator('tr', { hasText: 'Amethyst' });
await row.getByRole('button', { name: '+ Class' }).click();
await page.waitForTimeout(300);
check('the Add class panel names the right section',
  /Grade 9 – Amethyst/.test(await body()));

await page.getByLabel('Subject').selectOption({ label: 'English 10' });
await page.getByRole('button', { name: 'Add class' }).click();
await page.waitForTimeout(500);

text = await body();
check('the new class appears in the Classes table', /English 10/.test(text));
check('the section now shows 1 class', await row.innerText().then((t) => /\b1\b/.test(t)));

/* ---- 6. the class is real: it opens in My Classes with a roster ------ *
 * "My Classes" is a teaching-role nav item; the registrar's own menu
 * has no reason to carry it. Switch back to Subject to reach it, the
 * same as any real teacher would use their own account.
 */
await page.getByRole('button', { name: /^subject$/i }).click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: /my classes/i }).first().click();
await page.waitForTimeout(500);
const card = page.locator('.class-card', { hasText: 'English 10' }).filter({ hasText: 'Amethyst' });
check('the created class appears in My Classes', await card.count() === 1);
if (await card.count()) {
  await card.getByRole('button', { name: /open class/i }).click();
  await page.waitForTimeout(500);
  await page.getByRole('tab', { name: /students/i }).click();
  await page.waitForTimeout(500);
  const roster = await page.locator('table tbody tr').count();
  check('the roster auto-populated — nobody typed a student list', roster > 0, `${roster} rows`);
}

await browser.close();
console.log('PASS:'); for (const o of ok) console.log('  ✓', o);
if (fails.length) { console.log('FAIL:'); for (const f of fails) console.log('  ✗', f); process.exit(1); }
console.log(`\nall ${ok.length} checks passed`);
