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
/* ---- 9. and each role reads ITS OWN part first ----------------------- */
/*
  This replaced a check that asserted the eleven steps lead for everyone.
  That was the behaviour, and it was the defect: a registrar opening Help
  landed on the teacher's term and had to scroll past all eleven steps to
  reach their own four. Ordering is now per role, so the check has to be
  per role too — a text search for "step by step" would still pass while
  asserting the opposite of what the screen now does.
*/
const openHelp = async () => {
  await page.getByRole('button', { name: /^\?\s*Help$|^Help$/ }).first().click();
  await page.waitForTimeout(700);
  return body();
};
/** Does `a` appear ahead of `b` in the rendered page? */
const leads = (text, a, b) => {
  const i = text.search(a), j = text.search(b);
  return i !== -1 && j !== -1 && i < j;
};

// `guide` was captured as the Student — the last role in the loop above.
check('9a. a learner reads their own guide before the teacher\'s term',
  leads(guide, /If you are a learner/i, /step by step/i),
  'the finding this fixes: every role used to land on the eleven steps');

await asRole('Registrar');
const registrarGuide = await openHelp();
check('9b. a registrar reads their own four moves before the teacher\'s term',
  leads(registrarGuide, /If you are the registrar/i, /step by step/i));
check('9b2. and the teacher\'s term is still there, marked as somebody else\'s',
  /What the other roles do/i.test(registrarGuide)
    && /step by step/i.test(registrarGuide),
  'ordering, not hiding');

await asRole('Subject');
const teacherGuide = await openHelp();
check('9c. a subject teacher still leads with their own eleven steps',
  leads(teacherGuide, /Your term, step by step/i, /If you are the adviser/i),
  'the teacher was already well served; that must not regress');

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
// Pick the class BY NAME, not by position. This used to take the
// first card, which quietly meant "Grade 10 – Pearl, Mathematics 10"
// only because the list happened to be ordered that way. My Classes
// now orders grade level numerically, so the first card is Grade 9,
// and every assertion below is about Grade 10 – Pearl.
await page.locator('.class-card')
  .filter({ hasText: 'Pearl' }).filter({ hasText: 'Mathematics 10' })
  .getByRole('button', { name: 'Open class' }).click();
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
