/**
 * Every menu item, every role, clicked.
 *
 * `nav.test.ts` already proves each route MAPS to a screen. This proves
 * the screen actually opens: no blank page, no dead button, no console
 * error, no duplicate React key, and no "not available" except on the
 * three routes that say so deliberately.
 *
 * The distinction matters. A route can map to a component that then
 * throws, renders nothing, or logs a key collision — all of which look
 * fine to a unit test and terrible in front of a principal.
 *
 *   VITE_DEMO_MODE=true VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
 *     npx vite --port 5199 --strictPort
 *   node e2e/navigation-audit.mjs
 */
import { execSync } from 'node:child_process';
const { chromium } = await import(
  `${execSync('npm root -g', { encoding: 'utf8' }).trim()}/playwright/index.mjs`
);

const fails = [], ok = [];
const check = (n, c, d = '') => (c ? ok : fails).push(`${n}${d ? ` — ${d}` : ''}`);

/**
 * Routes that render "not available" ON PURPOSE, each with a note
 * explaining why. They are not dead buttons: the note is the feature.
 */
const DELIBERATELY_PLANNED = ['Reports & Documents', 'Grading Configuration'];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1150 } });

let consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(`PAGE ERROR: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !/googleapis|ERR_CONNECTION_RESET/.test(m.text())) {
    consoleErrors.push(m.text().slice(0, 200));
  }
});

await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });

const ROLES = ['Subject', 'Advisory', 'Registrar', 'Administrator', 'Student'];

for (const role of ROLES) {
  await page.getByRole('button', { name: role, exact: true }).click();
  await page.waitForTimeout(500);

  // Every label in this role's menu, minus the glyph-only rows.
  const labels = (await page.locator('.side-nav').innerText())
    .split('\n').map((l) => l.trim())
    .filter((l) => l && l !== 'SOON' && !/^[▤↑▦◍◫⇥◈⚙◷☺?▩⇤◔◑☖]$/.test(l));

  check(`${role}: has a menu`, labels.length > 0, `${labels.length} entries`);

  for (const label of labels) {
    consoleErrors = [];
    const entry = page.getByRole('button', { name: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).first();
    if (await entry.count() === 0) continue;

    await entry.click();
    await page.waitForTimeout(650);

    const body = await page.locator('body').innerText();
    const planned = DELIBERATELY_PLANNED.includes(label);
    const unavailable = /not available/i.test(body);

    if (planned) {
      check(`${role} → ${label}: says why it is not ready`, unavailable,
        'a planned route with an explanation is not a dead button');
    } else {
      check(`${role} → ${label}: opens a real screen`, !unavailable);
      // A screen that rendered nothing at all is the other failure mode.
      check(`${role} → ${label}: renders content`, body.length > 400,
        `${body.length} chars`);
    }

    const dupKey = consoleErrors.filter((e) => /same key|Encountered two children/i.test(e));
    check(`${role} → ${label}: no duplicate React keys`, dupKey.length === 0,
      dupKey[0] ?? '');

    const other = consoleErrors.filter((e) => !/same key|Encountered two children/i.test(e));
    check(`${role} → ${label}: no console errors`, other.length === 0, other[0] ?? '');
  }
}

/* ---- the guide is reachable and actually instructional -------------- */
await page.getByRole('button', { name: 'Subject', exact: true }).click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: /^Help$/ }).first().click();
await page.waitForTimeout(700);
const help = await page.locator('body').innerText();

check('the User Guide is on the Help screen',
  /How to use the E-Class Record/i.test(help));
// Case-insensitive: `text-transform: uppercase` means innerText returns
// "STEP 1". Third time that has caught a suite in this repo — assert on
// case-insensitive text whenever a label might be styled.
check('it is written as numbered steps',
  /Step 1/i.test(help) && /Step 2/i.test(help),
  'and the numbers are real text, not a CSS counter a screen reader cannot announce');
check('it covers opening a class, choosing a term, entering and submitting',
  /Open your class/i.test(help) && /Choose the term/i.test(help)
  && /Enter the scores/i.test(help) && /Submit the term/i.test(help));
check('and says what happens after submitting',
  /After you submit/i.test(help) && /registrar/i.test(help));
check('it avoids technical vocabulary',
  !/\bRPC\b|\bRLS\b|\bAPI\b|\bpayload\b|\bendpoint\b/i.test(help),
  'written for a teacher, not for us');

await browser.close();
console.log('PASS:'); for (const o of ok) console.log('  ✓', o);
if (fails.length) { console.log('FAIL:'); for (const f of fails) console.log('  ✗', f); process.exit(1); }
console.log(`\nall ${ok.length} checks passed`);
