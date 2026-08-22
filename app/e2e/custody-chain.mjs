/**
 * The chain of custody, driven end to end in the real app.
 *
 *   teacher submits → can recall → adviser receives → can NO LONGER
 *   recall → adviser forwards → adviser can take it back → registrar
 *   receives → registrar approves
 *
 * The unit tests cover the transition table. This covers the thing a
 * table cannot: that the right button is on the right screen at the
 * right moment, and that the refusal a teacher sees is a sentence rather
 * than a status code.
 *
 *   VITE_DEMO_MODE=true VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
 *     npx vite --port 5199 --strictPort
 *   node e2e/custody-chain.mjs
 */
import { execSync } from 'node:child_process';
const { chromium } = await import(
  `${execSync('npm root -g', { encoding: 'utf8' }).trim()}/playwright/index.mjs`
);

const fails = [], ok = [];
const check = (name, cond, detail = '') =>
  (cond ? ok : fails).push(`${name}${detail ? ` — ${detail}` : ''}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
page.on('pageerror', (e) => fails.push(`PAGE ERROR: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !/googleapis|ERR_CONNECTION_RESET/.test(m.text())) {
    fails.push(`CONSOLE: ${m.text()}`);
  }
});

const panel = page.locator('[role=tabpanel]');
const asRole = async (role) => {
  await page.getByRole('button', { name: role, exact: true }).click();
  await page.waitForTimeout(400);
};
/**
 * The row for one class + period.
 *
 * Scoped by text rather than `.first()`: the tables re-sort and re-render
 * after every action, so an index-based locator silently starts acting on
 * a different class — which is how this script first "passed" while
 * forwarding the wrong section.
 */
const rowFor = (cls, period) =>
  page.locator('tbody tr').filter({ hasText: cls }).filter({ hasText: period });

const openSubmission = async () => {
  await page.getByRole('button', { name: /my classes/i }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Open class' }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole('tab', { name: /submission/i }).click();
  await page.waitForTimeout(500);
};

await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });

/* ---- 1. the teacher submits, and can still take it back ------------- */
await openSubmission();
await panel.getByRole('button', { name: /^Submit / }).first().click();
await panel.getByRole('button', { name: /^Yes, submit/ }).first().waitFor({ state: 'visible' });
await panel.getByRole('button', { name: /^Yes, submit/ }).first().click();
await page.waitForTimeout(1000);

let text = await panel.innerText();
check('teacher is told nobody has received it yet',
  /Nobody has received this yet/i.test(text), text.slice(0, 120).replace(/\n/g, ' / '));
check('a Recall button is offered',
  (await panel.getByRole('button', { name: /^Recall/ }).count()) === 1);
check('the chain shows the adviser has not received it',
  /not yet received/i.test(text));

/* ---- 2. recall actually works --------------------------------------- */
await panel.getByRole('button', { name: /^Recall/ }).first().click();
await page.waitForTimeout(900);
text = await panel.innerText();
check('recall returns the period to the teacher',
  /In progress|Draft/i.test(text) && !/Editing is locked/i.test(text),
  text.slice(0, 90).replace(/\n/g, ' / '));

// ...and re-submit so the adviser has something to receive.
await panel.getByRole('button', { name: /^Submit / }).first().click();
await panel.getByRole('button', { name: /^Yes, submit/ }).first().waitFor({ state: 'visible' });
await panel.getByRole('button', { name: /^Yes, submit/ }).first().click();
await page.waitForTimeout(900);

/* ---- 3. the registrar cannot see it yet ------------------------------ */
await asRole('Registrar');
await page.getByRole('button', { name: /Grade Submissions/i }).first().click();
await page.waitForTimeout(700);
check('a submitted record has NOT reached the registrar',
  (await rowFor('Grade 10 – Pearl', 'Term 2').count()) === 0,
  'strict chain: nothing appears before the adviser forwards it');

/* ---- 4. the adviser receives ----------------------------------------- */
await asRole('Advisory');
await page.getByRole('button', { name: /Incoming Grades/i }).first().click();
await page.waitForTimeout(700);
check('the adviser has an Incoming Grades screen',
  /Incoming Grades/i.test(await page.locator('body').innerText()));

const ours = rowFor('Grade 10 – Pearl', 'Term 2');
const receiveBtn = ours.getByRole('button', { name: 'Receive', exact: true });
check('a Receive button is offered on our row', (await receiveBtn.count()) === 1);
await receiveBtn.click();
await page.waitForTimeout(800);
let ourRowText = await rowFor('Grade 10 – Pearl', 'Term 2').innerText();
check('the adviser sees their own signature on that row',
  /You received it/i.test(ourRowText), ourRowText.replace(/\n/g, ' | '));

/* ---- 5. the teacher can no longer recall ------------------------------ */
await asRole('Subject');
await openSubmission();
text = await panel.innerText();
check('the teacher is told the adviser has it',
  /class adviser has this record/i.test(text), text.slice(0, 160).replace(/\n/g, ' / '));
check('the Recall button is gone',
  (await panel.getByRole('button', { name: /^Recall/ }).count()) === 0);
// The chain strip, not just the prose: the teacher reads the three
// boxes to see how far the record has travelled.
const chain = await panel.locator('.chain li').allInnerTexts();
check('the chain marks the adviser step as signed',
  /Class adviser/.test(chain[1] ?? '') && /received \w{3} \d/.test(chain[1] ?? ''),
  (chain[1] ?? '(no chain)').replace(/\n/g, ' '));
check('the chain still shows the registrar as not sent',
  /not yet sent/i.test(chain[2] ?? ''), (chain[2] ?? '').replace(/\n/g, ' '));

/* ---- 6. the adviser forwards, then takes it back, then forwards ------- */
await asRole('Advisory');
await page.getByRole('button', { name: /Incoming Grades/i }).first().click();
await page.waitForTimeout(600);
await rowFor('Grade 10 – Pearl', 'Term 2')
  .getByRole('button', { name: /Forward to registrar/i }).click();
await page.waitForTimeout(800);
ourRowText = await rowFor('Grade 10 – Pearl', 'Term 2').innerText();
check('forwarding is recorded as sent but not received',
  /not yet received/i.test(ourRowText), ourRowText.replace(/\n/g, ' | '));

const takeBack = rowFor('Grade 10 – Pearl', 'Term 2').getByRole('button', { name: /Take back/i });
check('the adviser can still take it back', (await takeBack.count()) === 1);
await takeBack.click();
await page.waitForTimeout(800);
await rowFor('Grade 10 – Pearl', 'Term 2')
  .getByRole('button', { name: /Forward to registrar/i }).click();
await page.waitForTimeout(800);

/* ---- 7. the registrar receives, then approves -------------------------- */
await asRole('Registrar');
await page.getByRole('button', { name: /Grade Submissions/i }).first().click();
await page.waitForTimeout(700);
const regRow = () => rowFor('Grade 10 – Pearl', 'Term 2');
check('the forwarded record now reaches the registrar', (await regRow().count()) === 1);
check('Approve is NOT offered before the registrar signs',
  (await regRow().getByRole('button', { name: 'Approve', exact: true }).count()) === 0);
await regRow().getByRole('button', { name: 'Receive', exact: true }).click();
await page.waitForTimeout(800);
check('Approve appears once the registrar has signed',
  (await regRow().getByRole('button', { name: 'Approve', exact: true }).count()) === 1);

/* ---- 8. and the adviser can see it landed ------------------------------ */
await asRole('Advisory');
await page.getByRole('button', { name: /Incoming Grades/i }).first().click();
await page.waitForTimeout(700);
ourRowText = await rowFor('Grade 10 – Pearl', 'Term 2').innerText();
check('the adviser sees the registrar signed for it',
  /Registrar signed/i.test(ourRowText), ourRowText.replace(/\n/g, ' | '));

await page.screenshot({ path: '/tmp/chain.png', fullPage: true });
await browser.close();

console.log('PASS:'); for (const o of ok) console.log('  ✓', o);
if (fails.length) { console.log('FAIL:'); for (const f of fails) console.log('  ✗', f); process.exit(1); }
console.log(`\nall ${ok.length} checks passed`);
