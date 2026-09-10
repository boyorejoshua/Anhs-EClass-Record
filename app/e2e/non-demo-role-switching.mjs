/**
 * Regression: a genuine multi-role session must switch through "Your roles"
 * even when demo preview is disabled.
 *
 * Start a local fixture server from `app/` first:
 *
 *   VITE_DEMO_MODE=false VITE_E2E_MULTI_ROLE_SESSION=true \
 *     VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
 *     npx vite --port 5199 --strictPort
 *   node e2e/non-demo-role-switching.mjs
 */
import { chromium } from './playwright.mjs';

const fails = [];
const ok = [];
const check = (name, condition, detail = '') => {
  (condition ? ok : fails).push(`${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1150 } });
const consoleErrors = [];
page.on('pageerror', (error) => consoleErrors.push(`PAGE ERROR: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error' && !/fonts\.googleapis|ERR_CONNECTION_RESET/.test(message.text())) {
    consoleErrors.push(message.text());
  }
});

try {
  await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });

  const roles = page.getByRole('group', { name: 'Your roles' });
  await roles.waitFor({ state: 'visible' });
  const roleLabels = await roles.getByRole('button').allInnerTexts();
  check('fixture exposes the actual held roles',
    ['Administrator', 'Registrar', 'Advisory Teacher', 'Subject Teacher']
      .every((label) => roleLabels.includes(label)),
    roleLabels.join(' | '));
  check('non-demo build does not render the demo preview',
    await page.getByText('Demo preview', { exact: true }).count() === 0);
  check('unheld Student role is not offered',
    await roles.getByRole('button', { name: 'Student', exact: true }).count() === 0);

  await page.getByRole('button', { name: 'School Setup', exact: true }).click();
  await page.locator('h1.greeting', { hasText: 'School Setup' }).waitFor();

  await roles.getByRole('button', { name: 'Registrar', exact: true }).click();
  await page.getByRole('heading', { name: 'Dashboard', exact: true }).waitFor();

  check('Registrar becomes the active held role',
    await roles.getByRole('button', { name: 'Registrar', exact: true }).getAttribute('aria-pressed') === 'true');
  check('role change resets the prior administrator route to Dashboard',
    await page.getByRole('heading', { name: 'Dashboard', exact: true }).count() === 1);

  const registrarNavigation = await page.locator('.side-nav').innerText();
  check('Registrar-specific Reports & Documents navigation appears',
    registrarNavigation.includes('Reports & Documents'));
  check('administrator-only School Setup navigation disappears',
    !registrarNavigation.includes('School Setup'), registrarNavigation.replace(/\n/g, ' | '));
  check('the switch produces no page or console errors', consoleErrors.length === 0,
    consoleErrors.join(' | '));
} finally {
  await browser.close();
}

console.log('PASS:');
for (const result of ok) console.log('  ✓', result);
if (fails.length) {
  console.log('FAIL:');
  for (const failure of fails) console.log('  ✗', failure);
  process.exit(1);
}
console.log(`\nall ${ok.length} checks passed`);
