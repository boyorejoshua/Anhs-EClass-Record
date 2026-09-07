/**
 * Two things a teacher has to be able to trust, checked in a real
 * browser because neither is visible to a unit test.
 *
 *   1. An edit actually persisted. V0's answer to persistence was a
 *      forced file download every 15 minutes and "check your Downloads
 *      folder"; the replacement is a save indicator, and an indicator
 *      that lies is worse than none.
 *
 *   2. Where the self-undo window ends. A teacher may take a submission
 *      back while nobody has signed for it, and not afterwards — the
 *      boundary is the ADVISER's signature, and the screen has to say
 *      which side of it you are on. `custody-chain.mjs` walks the whole
 *      chain and proves the button disappears; this asserts the WORDS,
 *      which are what a teacher actually reads.
 *
 *   VITE_DEMO_MODE=true VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
 *     npx vite --port 5199 --strictPort
 *   node e2e/save-and-undo.mjs
 */
import { execSync } from 'node:child_process';
const { chromium } = await import(
  `${execSync('npm root -g', { encoding: 'utf8' }).trim()}/playwright/index.mjs`
);

const fails = [], ok = [];
const check = (n, c, d = '') => (c ? ok : fails).push(`${n}${d ? ` — ${d}` : ''}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
page.on('pageerror', (e) => fails.push(`PAGE ERROR: ${e.message}`));

const openClass = async (section, subject) => {
  await page.getByRole('button', { name: /My Classes$/ }).first().click();
  await page.waitForTimeout(700);
  await page.locator('.class-card').filter({ hasText: section }).filter({ hasText: subject })
    .getByRole('button', { name: 'Open class' }).click();
  await page.waitForTimeout(800);
};
const tab = async (name) => {
  await page.getByRole('tab', { name }).click();
  await page.waitForTimeout(700);
};
const saveLabel = () => page.locator('.save').first().innerText();

await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Subject', exact: true }).click();
await page.waitForTimeout(500);

/* ---- 1-4. the save indicator tells the truth ------------------------- */
// Pearl / Mathematics 10 / Term 2 is still a draft, so the grid is open.
await openClass('Pearl', 'Mathematics 10');
await tab(/Grade Entry/i);

check('1. the grid opens with nothing outstanding',
  /No changes/i.test(await saveLabel()), await saveLabel());

const cell = page.locator('input.gb-input').first();
const hadCell = (await cell.count()) === 1;
check('2. there is a score cell to type into', hadCell);

if (hadCell) {
  await cell.fill('42');
  await cell.blur();
  // The save is debounced 700ms; wait past it and let the request land.
  await page.waitForTimeout(1600);
  const after = await saveLabel();
  check('3. an edit reports itself SAVED, not merely "no changes"',
    /^Saved/i.test(after), after);

  // The real question behind a save indicator: did the value survive
  // leaving the screen? Switching tabs unmounts the grid entirely.
  await tab(/^Summary$/i);
  await tab(/Grade Entry/i);
  const back = await page.locator('input.gb-input').first().inputValue();
  check('4. and the value is still there after leaving and returning',
    back === '42', `read back "${back}"`);

  check('5. a saved grid carries no unsaved-changes badge on its tab',
    (await page.locator('#tab-gradebook .tab-count').count()) === 0);
}

/* ---- 6-9. the undo boundary, in the words the teacher reads ---------- */
// Diamond / Mathematics 10 / Term 2 is 'submitted' — nobody has signed.
await openClass('Diamond', 'Mathematics 10');
await tab(/^Submission/i);
const submitted = await page.locator('[role=tabpanel]').innerText();

check('6. submitted-but-unacknowledged says so, and says undo is open',
  /has not yet received it/i.test(submitted) && /still recall it/i.test(submitted),
  submitted.split('\n').find((l) => /recall/i.test(l)) ?? '(no line)');
check('7. and offers the undo itself',
  (await page.locator('[role=tabpanel]').getByRole('button', { name: /^Recall/ }).count()) === 1);
check('8. the chain shows WHO has not signed yet, not just a status word',
  /Class adviser/i.test(submitted) && /not yet received/i.test(submitted));

/* A published period is past every signature — the far side of the
   boundary, reachable without mutating anything. */
await openClass('Pearl', 'Mathematics 10');
await page.locator('#period-select').selectOption({ label: 'SY 2026-2027 · Term 1' })
  .catch(async () => {
    await page.getByRole('combobox').first().selectOption({ label: 'SY 2026-2027 · Term 1' });
  });
await page.waitForTimeout(800);
await tab(/^Submission/i);
const closed = await page.locator('[role=tabpanel]').innerText();
check('9. past the boundary there is no self-undo, only asking somebody',
  (await page.locator('[role=tabpanel]').getByRole('button', { name: /^Recall/ }).count()) === 0
    && !/still recall it/i.test(closed),
  closed.split('\n').slice(0, 3).join(' / '));

await browser.close();
console.log('PASS:'); for (const o of ok) console.log('  ✓', o);
if (fails.length) {
  console.log('FAIL:'); for (const f of fails) console.log('  ✗', f);
  process.exit(1);
}
console.log(`\nall ${ok.length} checks passed`);
