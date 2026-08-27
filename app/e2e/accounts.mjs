/**
 * Accounts: the administrator's Users screen and everyone's My Account.
 *
 * The property that matters is not that the forms render. It is that
 * the ONE-WAY doors hold:
 *
 *   · a new account starts owing a password change, and the app blocks
 *     on it rather than nagging — an administrator-issued password is
 *     known to two people, so any grade submitted under it is
 *     attributable to two people;
 *   · a person can edit their own name but not their own email, roles
 *     or status;
 *   · roles are a SET (Teacher AND Adviser), not a single choice.
 *
 *   VITE_DEMO_MODE=true VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
 *     npx vite --port 5199 --strictPort
 *   node e2e/accounts.mjs
 */
import { execSync } from 'node:child_process';
const { chromium } = await import(
  `${execSync('npm root -g', { encoding: 'utf8' }).trim()}/playwright/index.mjs`
);

const fails = [], ok = [];
const check = (n, c, d = '') => (c ? ok : fails).push(`${n}${d ? ` — ${d}` : ''}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
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
const openNav = async (name) => {
  await page.getByRole('button', { name }).first().click();
  await page.waitForTimeout(600);
};

await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });

/* ---- 1. every role can reach their own account ---------------------- */
const teacherNav = (await page.locator('nav button, aside button').allInnerTexts()).join(' | ');
check('1. a teacher has My Account', /My Account/.test(teacherNav));
check('1b. a teacher has NO Users entry', !/\|\s*▦?\s*Users/.test(teacherNav), teacherNav);

/* ---- 2. self-service profile ---------------------------------------- */
await openNav(/My Account/i);
const body = await page.locator('body').innerText();
check('2. the account screen names their school',
  /Angono National High School/.test(body));
check('2b. email is shown but NOT editable',
  (await page.locator('input[value="maria@anhs.test"]').count()) === 0
  && /maria@anhs\.test/.test(body), 'rendered as text, not an input');
check('2c. it says who can change the email',
  /Ask an administrator to change this/i.test(body));

const first = page.getByLabel('First name *');
await first.fill('Maria Elena');
await page.getByRole('button', { name: /^Save details$/ }).click();
await page.waitForTimeout(600);
check('2d. a self-edit saves', /Saved\./.test(await page.locator('body').innerText()));

/* ---- 3. the password form validates before it submits --------------- */
await page.getByLabel('New password', { exact: true }).fill('short');
await page.getByLabel('Confirm new password').fill('short');
await page.waitForTimeout(200);
let t = await page.locator('body').innerText();
check('3. a short password is refused', /at least 8 characters/i.test(t));
check('3b. and Change password stays disabled',
  await page.getByRole('button', { name: /^Change password$/ }).isDisabled());

await page.getByLabel('New password', { exact: true }).fill('LongEnough2026!');
await page.getByLabel('Confirm new password').fill('Different2026!');
await page.waitForTimeout(200);
t = await page.locator('body').innerText();
check('3c. a mismatch is caught', /do not match/i.test(t));
check('3d. and Change password is still disabled',
  await page.getByRole('button', { name: /^Change password$/ }).isDisabled());

await page.getByLabel('Confirm new password').fill('LongEnough2026!');
await page.waitForTimeout(200);
check('3e. a valid pair enables it',
  !(await page.getByRole('button', { name: /^Change password$/ }).isDisabled()));

/* ---- 4. the administrator's directory -------------------------------- */
await asRole('Administrator');
const adminNav = (await page.locator('nav button, aside button').allInnerTexts()).join(' | ');
check('4. an administrator has Users', /Users/.test(adminNav));

await openNav(/^▦?\s*Users$/);
t = await page.locator('body').innerText();
check('4b. the directory lists the seeded staff',
  /Santos/.test(t) && /Dela Cruz/.test(t) && /Reyes/.test(t) && /Cruz/.test(t));
check('4c. it states there is no public sign-up',
  /no public sign-up/i.test(t), t.slice(0, 200).replace(/\n/g, ' / '));

// Juan holds two roles at once — the thing V0's schema could not express.
const juanRow = page.locator('tbody tr', { hasText: 'Dela Cruz' }).first();
const juanText = await juanRow.innerText();
check('4d. a person can hold two roles at once',
  /adviser/.test(juanText) && /teacher/.test(juanText), juanText.replace(/\n/g, ' | '));

/* ---- 5. an administrator cannot deactivate themselves ---------------- */
const selfRow = page.locator('tbody tr', { hasText: 'You' }).first();
check('5. no Deactivate button on your own row',
  (await selfRow.getByRole('button', { name: /Deactivate/ }).count()) === 0);
check('5b. and it says why', /Your own account/.test(await selfRow.innerText()));

/* ---- 6. creating an account ------------------------------------------ */
await page.getByRole('button', { name: /\+ Add user/ }).click();
await page.waitForTimeout(400);
check('6. the form explains the temporary-password handover',
  /temporary password you set/i.test(await page.locator('body').innerText()));

await page.getByLabel('Email *').fill('newteacher@anhs.test');
await page.getByLabel('Temporary password *').fill('Temp');
await page.getByLabel('First name *').fill('Nena');
await page.getByLabel('Last name *').fill('Bautista');
await page.waitForTimeout(200);
check('6b. a short temporary password blocks Create',
  await page.getByRole('button', { name: /^Create account$/ }).isDisabled());

await page.getByLabel('Temporary password *').fill('TempPass2026!');
await page.getByLabel('Employee ID').fill('EMP-010');
await page.getByLabel('Position').fill('Teacher I');
// Adviser as well as Teacher, which is preselected.
await page.locator('.role-grid label', { hasText: 'Class Adviser' }).first().click();
await page.waitForTimeout(200);
await page.getByRole('button', { name: /^Create account$/ }).click();
await page.waitForTimeout(800);

t = await page.locator('body').innerText();
check('6c. the account was created', /Bautista/.test(t));
check('6d. and the administrator is told how they sign in',
  /can now sign in as newteacher@anhs\.test/i.test(t), t.slice(0, 300).replace(/\n/g, ' / '));

const nenaRow = page.locator('tbody tr', { hasText: 'Bautista' }).first();
const nenaText = await nenaRow.innerText();
check('6e. THE NEW ACCOUNT OWES A PASSWORD CHANGE',
  /must change password/i.test(nenaText), nenaText.replace(/\n/g, ' | '));
check('6f. both chosen roles landed',
  /adviser/.test(nenaText) && /teacher/.test(nenaText), nenaText.replace(/\n/g, ' | '));

/* ---- 7. a duplicate email is refused --------------------------------- */
await page.getByRole('button', { name: /\+ Add user/ }).click();
await page.waitForTimeout(300);
await page.getByLabel('Email *').fill('newteacher@anhs.test');
await page.getByLabel('Temporary password *').fill('AnotherPass2026!');
await page.getByLabel('First name *').fill('Dupe');
await page.getByLabel('Last name *').fill('Nope');
await page.getByRole('button', { name: /^Create account$/ }).click();
await page.waitForTimeout(600);
check('7. a duplicate email is refused with a sentence',
  /already has an account/i.test(await page.locator('body').innerText()));
await page.getByRole('button', { name: /^Cancel$/ }).first().click();
await page.waitForTimeout(300);

/* ---- 8. roles are editable as a set ---------------------------------- */
await page.locator('tbody tr', { hasText: 'Bautista' }).first()
  .getByRole('button', { name: /^Roles$/ }).click();
await page.waitForTimeout(400);
check('8. the role editor says a person may hold more than one',
  /may hold more than one/i.test(await page.locator('body').innerText()));
// Drop Adviser, keep Teacher.
await page.locator('.role-grid label', { hasText: 'Class Adviser' }).first().click();
await page.getByRole('button', { name: /^Save roles$/ }).click();
await page.waitForTimeout(700);
const after = await page.locator('tbody tr', { hasText: 'Bautista' }).first().innerText();
check('8b. the role set was replaced, not appended',
  /teacher/.test(after) && !/adviser/.test(after), after.replace(/\n/g, ' | '));

/* ---- 9. deactivating, and never deleting ----------------------------- */
const anyRow = page.locator('tbody tr', { hasText: 'Bautista' }).first();
check('9. there is no Delete button anywhere in the directory',
  (await page.getByRole('button', { name: /^Delete$/ }).count()) === 0,
  'an account is deactivated, never deleted — it authored records');
await anyRow.getByRole('button', { name: /^Deactivate$/ }).click();
await page.waitForTimeout(700);
check('9b. the account went inactive',
  /inactive/i.test(await page.locator('tbody tr', { hasText: 'Bautista' }).first().innerText()));

await browser.close();
console.log('PASS:'); for (const o of ok) console.log('  ✓', o);
if (fails.length) { console.log('FAIL:'); for (const f of fails) console.log('  ✗', f); process.exit(1); }
console.log(`\nall ${ok.length} checks passed`);
