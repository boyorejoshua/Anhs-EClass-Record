/**
 * The administrator's reach, and the subject list.
 *
 * Two things the school asked for after importing a real workbook:
 *
 *   "the Registrar will create the section and administrator,
 *    administrator will be the main who can access things"
 *   "administrator should have the same access as the registrar"
 *
 * THE ACCESS WAS ALREADY THERE. Every one of the registrar's forty
 * permissions is granted to school_admin too, and has been since
 * migration 0002. Only the MENU disagreed — Grade Submissions, Students
 * and Academic Records were absent from an account entitled to all
 * three. Capability without a route to it, which errors nowhere.
 *
 * THE SUBJECT LIST DID NOT EXIST. A teacher importing GMRC was told to
 * "ask an administrator to add it", and the administrator had no way to
 * add it either: no create-subject RPC, no permission, no screen. Third
 * time in this build that a message has prescribed an action the
 * product cannot perform.
 *
 *   VITE_DEMO_MODE=true VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
 *     npx vite --port 5199 --strictPort
 *   node e2e/subjects-and-admin.mjs
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
const menu = () => page.locator('.side-nav').innerText();

await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });

/* ---- 1-3. the administrator reaches the registrar's screens --------- */
await asRole('Registrar');
const registrarMenu = await menu();
await asRole('Administrator');
const adminMenu = await menu();

// Every label the registrar sees, the administrator must also see.
const registrarLabels = registrarMenu.split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !/^[▤↑▦◍◫⇥◈⚙◷☺?]$/.test(l) && l !== 'SOON');
const missing = registrarLabels.filter((l) => !adminMenu.includes(l));

check('1. the administrator reaches every screen the registrar does',
  missing.length === 0, missing.join(', ') || 'nothing hidden');

check('2. including the three that were missing',
  ['Grade Submissions', 'Students', 'Academic Records'].every((l) => adminMenu.includes(l)),
  'the permissions were always granted; only the menu withheld them');

check('3. and keeps its own administration',
  ['School Setup', 'Users'].every((l) => adminMenu.includes(l)));

check('4. My Account is still last, and listed once',
  adminMenu.trimEnd().endsWith('My Account')
  && (adminMenu.match(/My Account/g) || []).length === 1);

/* ---- 5. one of those screens actually opens ------------------------- */
await page.getByRole('button', { name: /^Grade Submissions$/ }).first().click();
await page.waitForTimeout(800);
check('5. Grade Submissions opens for the administrator',
  !/not available/i.test(await page.locator('body').innerText()),
  'a menu entry that renders NotAvailable would be the same defect wearing a label');

/* ---- 6-8. the subject list ------------------------------------------ */
await page.getByRole('button', { name: /^School Setup$/ }).first().click();
await page.waitForTimeout(900);
let body = await page.locator('body').innerText();

check('6. School Setup carries the subject list',
  /Subjects/.test(body) && /Mathematics 10/.test(body));

check('7. each subject shows how its category grades it',
  /WW 20% · PT 50% · EX 30%/.test(body) && /WW 20% · PT 60% · EX 20%/.test(body),
  'choosing the category IS choosing the weights, so the weights are shown');

check('8. and how many classes would be affected by retiring one',
  /CLASSES/i.test(body));

/* ---- 9-12. add the subject the import could not find ---------------- */
await page.getByRole('button', { name: /\+ Add subject/ }).click();
await page.waitForTimeout(400);

const catOptions = await page.getByLabel('Category *', { exact: false })
  .or(page.locator('.inline-form select')).first().innerText();
check('9. the category picker names the weights, not just the category',
  /Core Subject — WW 20%/.test(catOptions), catOptions.replace(/\n/g, ' | ').slice(0, 90));

const form = page.locator('.inline-form');
await form.getByLabel('Title *').fill('Good Manners and Right Conduct');
await form.getByLabel('Code *').fill('GMRC');
const coreValue = await form.locator('select option').evaluateAll(
  (os) => os.find((o) => /Core Subject/.test(o.textContent))?.value ?? '');
await form.locator('select').selectOption(coreValue);
await form.getByRole('button', { name: 'Add subject', exact: true }).click();
await page.waitForTimeout(900);

body = await page.locator('body').innerText();
check('10. the subject is added',
  /Good Manners and Right Conduct/.test(body) && /GMRC/.test(body));

/* ---- 11. the duplicate guard, case-insensitively -------------------- */
await page.getByRole('button', { name: /\+ Add subject/ }).click();
await page.waitForTimeout(400);
const form2 = page.locator('.inline-form');
await form2.getByLabel('Title *').fill('Something else entirely');
await form2.getByLabel('Code *').fill('gmrc');
await form2.locator('select').selectOption(coreValue);
await form2.getByRole('button', { name: 'Add subject', exact: true }).click();
await page.waitForTimeout(800);
body = await page.locator('body').innerText();
check('11. "gmrc" is refused against "GMRC", and the message names the clash',
  /already has that subject/i.test(body) && /Good Manners/.test(body),
  body.match(/This school already has[^\n]*/)?.[0] ?? '(no message)');

await page.getByRole('button', { name: 'Cancel', exact: true }).click();
await page.waitForTimeout(500);

/* ---- 12. retire keeps it, rather than deleting it ------------------- */
const gmrcRow = page.locator('tr', { hasText: 'Good Manners and Right Conduct' }).first();
await gmrcRow.getByRole('button', { name: 'Retire' }).click();
await page.waitForTimeout(800);
body = await page.locator('body').innerText();
check('12. retiring keeps the subject on the list, marked',
  /Good Manners and Right Conduct/.test(body) && /retired/i.test(body),
  'classes reference subjects ON DELETE RESTRICT — deleting one would orphan grades');

check('13. and it can be brought back',
  (await page.locator('tr', { hasText: 'Good Manners and Right Conduct' })
    .first().getByRole('button', { name: 'Restore' }).count()) === 1);

/* ---- 14. the import can now resolve GMRC ---------------------------- */
// The whole point of the exercise: the subject the workbook named is
// now something the import's Subject picker can offer.
await page.getByRole('button', { name: /^School Setup$/ }).first().click();
await page.waitForTimeout(600);
const restored = page.locator('tr', { hasText: 'Good Manners and Right Conduct' }).first();
if (await restored.getByRole('button', { name: 'Restore' }).count()) {
  await restored.getByRole('button', { name: 'Restore' }).click();
  await page.waitForTimeout(700);
}
check('14. GMRC is active again and available to a class',
  !/retired/i.test(await page.locator('tr', { hasText: 'Good Manners' }).first().innerText()));

await browser.close();
console.log('PASS:'); for (const o of ok) console.log('  ✓', o);
if (fails.length) { console.log('FAIL:'); for (const f of fails) console.log('  ✗', f); process.exit(1); }
console.log(`\nall ${ok.length} checks passed`);
