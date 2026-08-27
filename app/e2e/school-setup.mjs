/**
 * School Setup, and the read-only School Information block.
 *
 * `nav.ts` carried `setup` as `planned` for the whole build, on the
 * grounds that the school profile is "configured during onboarding".
 * That stopped being good enough once these fields started PRINTING:
 * school name, government ID, region and division head every SF form,
 * so a typo set at onboarding was a support ticket rather than an edit.
 *
 * The other half is the interesting one. The legacy Setup screen let a
 * teacher TYPE all of this per record book, which is how one school
 * ends up with three spellings of its own name across three teachers'
 * files. Here the same block is shown, not typed — check 4.
 *
 *   VITE_DEMO_MODE=true VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
 *     npx vite --port 5199 --strictPort
 *   node e2e/school-setup.mjs
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

const asRole = async (role) => {
  await page.getByRole('button', { name: role, exact: true }).click();
  await page.waitForTimeout(400);
};

await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });

/* ---- 1. the entry is no longer "planned" ----------------------------- */
await asRole('Administrator');
const nav = (await page.locator('nav button, aside button').allInnerTexts()).join(' | ');
check('1. School Setup is in the admin menu', /School Setup/.test(nav));
check('1b. and is no longer marked SOON',
  !/School Setup\s*SOON/i.test(nav.replace(/\n/g, '')), nav.replace(/\n/g, ''));

await page.getByRole('button', { name: /School Setup/i }).first().click();
await page.waitForTimeout(800);
let t = await page.locator('body').innerText();

/* ---- 2. it shows what will print ------------------------------------- */
check('2. a print preview of the form heading is shown',
  (await page.locator('.form-preview').count()) === 1);
const preview = await page.locator('.form-preview').innerText();
check('2b. the preview carries the school, its region/division and its ID',
  /Angono National High School/.test(preview)
  && /Division of/.test(preview) && /School ID/.test(preview),
  preview.replace(/\n/g, ' · '));

/* ---- 3. the tenant slug and status are shown but NOT editable -------- */
check('3. the sign-in address is shown', /Sign-in address/i.test(t));
check('3b. and explained as fixed rather than simply absent',
  /changing it would sign everyone out/i.test(t));
check('3c. it is rendered as text, not an input',
  (await page.locator('input[value="anhs"]').count()) === 0);
check('3d. status is shown as Mendtrix\'s to set', /Set by Mendtrix/i.test(t));

/* ---- 4. editing, and the preview following it ------------------------ */
await page.getByLabel('Region').fill('Region IV-A (CALABARZON)');
await page.getByLabel('District').fill('Angono East');
await page.waitForTimeout(300);
const preview2 = await page.locator('.form-preview').innerText();
check('4. the preview updates as you type — you see the result before saving',
  /Region IV-A \(CALABARZON\)/.test(preview2) && /Angono East/.test(preview2),
  preview2.replace(/\n/g, ' · '));

await page.getByLabel('School name *').fill('Angono National High School (Main)');
await page.getByRole('button', { name: /^Save school details$/ }).click();
await page.waitForTimeout(1200);
check('4b. it saves', /Saved\./.test(await page.locator('body').innerText()));

/* ---- 5. an empty name is refused ------------------------------------- */
await page.getByLabel('School name *').fill('   ');
await page.waitForTimeout(200);
check('5. an empty school name blocks Save — it prints on every form',
  await page.getByRole('button', { name: /^Save school details$/ }).isDisabled());
await page.getByLabel('School name *').fill('Angono National High School (Main)');

/* ---- 6. THE LEGACY TRAP: the teacher SEES it, never types it --------- */
await asRole('Subject');
await page.getByRole('button', { name: /my classes/i }).first().click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Open class' }).first().click();
await page.waitForTimeout(500);
await page.getByRole('tab', { name: /^setup$/i }).click();
await page.waitForTimeout(800);
t = await page.locator('body').innerText();

check('6. the class Setup tab carries a School information block',
  /School information/i.test(t));
check('6b. it shows the SAME details the administrator set',
  /Angono National High School \(Main\)/.test(t),
  'one row, read everywhere — not one copy per record book');
check('6c. and the teacher\'s own name, from their account',
  /Maria Santos/.test(t));

// The whole point. In the legacy system every one of these was a text
// input on the teacher's own record book.
const editableSchoolFields = await page.locator('input[value*="Angono National"]').count();
check('6d. NONE OF IT IS TYPEABLE HERE — this is the legacy defect closed',
  editableSchoolFields === 0,
  'one school name typed per record book is how three spellings happen');
check('6e. and it says where each part is actually edited',
  /School Setup/.test(t) && /My Account/.test(t));

await browser.close();
console.log('PASS:'); for (const o of ok) console.log('  ✓', o);
if (fails.length) { console.log('FAIL:'); for (const f of fails) console.log('  ✗', f); process.exit(1); }
console.log(`\nall ${ok.length} checks passed`);
