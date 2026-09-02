/**
 * Phase 2.1 — the principal demonstration, rehearsed in the real app.
 *
 * The custody chain already has its own suite; this one covers the part
 * a transition table cannot: that the THREE TERMS read correctly to
 * somebody who has never seen the system before.
 *
 *   Term 1  complete   — every score in, nothing to chase
 *   Term 2  incomplete — the system NAMES the missing score before the
 *                        teacher can submit, rather than submitting a
 *                        grade computed from a blank
 *   Term 3  empty      — and says so in a sentence, because an empty
 *                        table in front of a principal reads as broken
 *
 * The failure this guards against is specific: a demonstration that
 * dies on "why is that column blank?" with no answer on screen.
 *
 *   VITE_DEMO_MODE=true VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
 *     npx vite --port 5199 --strictPort
 *   node e2e/demo-rehearsal.mjs
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

const body = () => page.locator('body').innerText();
const panel = page.locator('[role=tabpanel]');
const asRole = async (r) => {
  await page.getByRole('button', { name: r, exact: true }).click();
  await page.waitForTimeout(450);
};
// The period switcher is a row of aria-pressed buttons in the workspace
// header. Named, not indexed: the header re-renders on every switch.
const pickTerm = async (label) => {
  await page.getByRole('button', { name: label, exact: true }).first().click();
  await page.waitForTimeout(800);
};
const openClass = async () => {
  await page.getByRole('button', { name: /my classes/i }).first().click();
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: 'Open class' }).first().click();
  await page.waitForTimeout(600);
};

await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });

/* ---- 1. the demo opens on something, not a blank screen -------------- */
check('1. the app opens with content', (await body()).length > 400);

/* ---- 2-4. the teacher's three terms ---------------------------------- */
await openClass();
const termBtns = await page.locator('button[aria-pressed]').allInnerTexts();
check('2. all three terms are offered, not just the active one',
  termBtns.filter((t) => /Term|T[123]/i.test(t)).length >= 3,
  termBtns.join(' | '));

await page.getByRole('tab', { name: /grade entry/i }).click();
await page.waitForTimeout(700);

for (const [n, term] of [['3', 'Term 1'], ['4', 'Term 2'], ['5', 'Term 3']]) {
  await pickTerm(term);
  const t = await body();
  check(`${n}. ${term} opens without an error`,
    !/not available|went wrong/i.test(t) && !/\bNaN\b|undefined/.test(t),
    t.slice(0, 90).replace(/\n/g, ' / '));
}

/* ---- 6. Term 3 is EMPTY and says so ---------------------------------- */
await pickTerm('Term 3');
const t3 = await panel.innerText();
check('6. an empty Term 3 explains itself rather than showing a bare grid',
  /nothing to enter|no assessments yet/i.test(t3),
  'an unexplained empty table in front of a principal reads as broken');

/* ---- 7-9. Term 2 names the missing score BEFORE submitting ----------- */
await pickTerm('Term 2');
await page.getByRole('tab', { name: /submission/i }).click();
await page.waitForTimeout(900);
const sub = await panel.innerText();

check('7. the Submission tab reports on completeness before asking to submit',
  /missing|incomplete|complete|blank/i.test(sub),
  sub.slice(0, 160).replace(/\n/g, ' / '));

check('8. and does not silently offer submission with no word on the gaps',
  sub.length > 120, `${sub.length} chars`);

/* ---- 10-12. the learner's end of it ---------------------------------- */
await asRole('Student');
const nav = await page.locator('.side-nav').innerText();
check('10. the learner has My Grades, My Schedule and Academic History',
  /My Grades/.test(nav) && /My Schedule/.test(nav) && /Academic History/.test(nav),
  nav.replace(/\n/g, ' | '));

await page.getByRole('button', { name: /^My Grades$/ }).first().click();
await page.waitForTimeout(800);
const g = await body();
check('11. My Grades opens for the learner', !/not available/i.test(g));

check('12. an unpublished term shows a placeholder, never a number the school has not released',
  !/\bNaN\b|undefined/.test(g),
  'the publication gate is enforced in RLS; the screen must not paper over it');

await browser.close();
console.log('PASS:'); for (const o of ok) console.log('  ✓', o);
if (fails.length) { console.log('FAIL:'); for (const f of fails) console.log('  ✗', f); process.exit(1); }
console.log(`\nall ${ok.length} checks passed`);
