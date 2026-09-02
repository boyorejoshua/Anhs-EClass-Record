/**
 * Phase 2.1 — the guide every role can now open, and every export that
 * claims to produce a file.
 *
 * Two things a demonstration trips over that no unit test sees:
 *
 *   1. Help was in the SUBJECT TEACHER's menu alone. A registrar handed
 *      this system cold — the likeliest person to need instructions —
 *      could not open the guide at all, and the guide only described a
 *      teacher's job anyway.
 *
 *   2. A button labelled "Export CSV" that downloads a file with a
 *      header row and no learners is worse than no button: it is
 *      believed. Each export here is actually TAKEN, and its bytes
 *      checked for a learner's name.
 *
 *   VITE_DEMO_MODE=true VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
 *     npx vite --port 5199 --strictPort
 *   node e2e/guide-and-exports.mjs
 */
import { execSync } from 'node:child_process';
const { chromium } = await import(
  `${execSync('npm root -g', { encoding: 'utf8' }).trim()}/playwright/index.mjs`
);

const fails = [], ok = [];
const check = (n, c, d = '') => (c ? ok : fails).push(`${n}${d ? ` — ${d}` : ''}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1500, height: 1100 }, acceptDownloads: true,
});
const page = await ctx.newPage();
page.on('pageerror', (e) => fails.push(`PAGE ERROR: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !/googleapis|ERR_CONNECTION_RESET/.test(m.text())) {
    fails.push(`CONSOLE: ${m.text()}`);
  }
});

const body = () => page.locator('body').innerText();
const asRole = async (r) => {
  await page.getByRole('button', { name: r, exact: true }).click();
  await page.waitForTimeout(450);
};

await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });

/* ---- 1-5. every role can open the guide ------------------------------ */
for (const role of ['Subject', 'Advisory', 'Registrar', 'Administrator', 'Student']) {
  await asRole(role);
  const nav = await page.locator('.side-nav').innerText();
  check(`1. ${role} has Help in the menu`, /Help/.test(nav),
    'a guide only the teacher can open is not a guide for the school');
  if (!/Help/.test(nav)) continue;
  await page.getByRole('button', { name: /^\?\s*Help$|^Help$/ }).first().click();
  await page.waitForTimeout(700);
  const t = await body();
  check(`2. ${role} — the guide opens with content`,
    !/not available/i.test(t) && t.length > 1200, `${t.length} chars`);
}

/* ---- 6-8. and it describes THEIR job, not only the teacher's --------- */
const guide = await body();
check('6. the guide covers the adviser', /If you are the adviser/i.test(guide));
check('7. the guide covers the registrar', /If you are the registrar/i.test(guide));
check('8. the guide covers the learner', /If you are a learner/i.test(guide));
check('9. and still leads with the teacher\'s term',
  /step by step/i.test(guide),
  'most readers are teachers; their eleven steps stay first');

/* ---- 10-12. the exports actually carry rows -------------------------- */
await asRole('Subject');

/** Click something that downloads, and read what came back. */
async function grab(label, clickIt) {
  const wait = page.waitForEvent('download', { timeout: 15000 });
  await clickIt();
  const dl = await wait;
  const stream = await dl.createReadStream();
  let text = '';
  for await (const chunk of stream) text += chunk;
  return { name: dl.suggestedFilename(), text };
}

await page.getByRole('button', { name: /my classes/i }).first().click();
await page.waitForTimeout(450);
await page.getByRole('button', { name: 'Open class' }).first().click();
await page.waitForTimeout(600);

// Summary is a LEARNER table; LOA is a SECTION table of achievement
// bands. Different shapes, so each is checked for what it actually
// carries rather than for a name that only one of them holds.
const EXPECT = { Summary: /Abad|Alvarez/, LOA: /Pearl|Grade 10/ };
for (const [n, tab] of [['10', 'Summary'], ['11', 'LOA']]) {
  await page.getByRole('tab', { name: new RegExp(`^${tab}$`, 'i') }).click();
  await page.waitForTimeout(700);
  try {
    const { name, text } = await grab(tab, () =>
      page.locator('[role=tabpanel]').getByRole('button', { name: /Export CSV/i }).first().click());
    const lines = text.trim().split('\n');
    check(`${n}. ${tab} — Export CSV downloads a file with real rows in it`,
      lines.length > 3 && EXPECT[tab].test(text),
      `${name}, ${lines.length} lines`);
  } catch (e) {
    check(`${n}. ${tab} — Export CSV downloads a file with real rows in it`, false,
      `no download: ${String(e).slice(0, 90)}`);
  }
}

/* ---- 12. Reports offers a print route that is not a dead button ------ */
await page.getByRole('tab', { name: /^Reports$/i }).click();
await page.waitForTimeout(700);
const reports = await page.locator('[role=tabpanel]').innerText();
check('12. the Reports tab names what it can produce',
  reports.length > 200 && !/not available/i.test(reports),
  reports.slice(0, 120).replace(/\n/g, ' / '));

await browser.close();
console.log('PASS:'); for (const o of ok) console.log('  ✓', o);
if (fails.length) { console.log('FAIL:'); for (const f of fails) console.log('  ✗', f); process.exit(1); }
console.log(`\nall ${ok.length} checks passed`);
