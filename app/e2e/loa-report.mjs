/**
 * The LOA report, checked against the workbook it was built from.
 *
 * CLASSRECORD_Template.xlsx, sheet "LOA Summary Reports". The unit tests
 * verify the banding arithmetic; this verifies that the page a teacher
 * files actually carries the workbook's tables, headings and check
 * column.
 *
 *   VITE_DEMO_MODE=true VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
 *     npx vite --port 5199 --strictPort
 *   node e2e/loa-report.mjs
 */
import { execSync } from 'node:child_process';
const { chromium } = await import(
  `${execSync('npm root -g', { encoding: 'utf8' }).trim()}/playwright/index.mjs`
);

const fails = [], ok = [];
const check = (name, cond, detail = '') =>
  (cond ? ok : fails).push(`${name}${detail ? ` — ${detail}` : ''}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
page.on('pageerror', (e) => fails.push(`PAGE ERROR: ${e.message}`));
page.on('console', (m) => {
  // The sandbox proxy blocks fonts.googleapis.com; the stacks fall back.
  if (m.type() === 'error' && !/googleapis|ERR_CONNECTION_RESET/.test(m.text())) {
    fails.push(`CONSOLE: ${m.text()}`);
  }
});

await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /my classes/i }).first().click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'Open class' }).first().click();
await page.waitForTimeout(400);
await page.getByRole('tab', { name: /^loa$/i }).click();
await page.waitForTimeout(1200);

const panel = page.locator('[role=tabpanel]');
const text = await panel.innerText();

check('names the report correctly', /Learning Outcomes Assessment/.test(text));
check('does NOT call it Level of Achievement', !/Level of Achievement/i.test(text));

// One table per top-level component, plus the period-grade table.
const tables = await page.locator('.loa-table').count();
check('renders a table per component plus the grade table', tables === 4, `${tables} tables`);

for (const heading of [
  'SUMMARY OF WRITTEN WORKS PER SECTION',
  'SUMMARY OF PERFORMANCE TASKS PER SECTION  (from Percentage Score)',
  'SUMMARY OF EXAMINATIONS PER SECTION',
  'SUMMARY OF TERM 2 GRADES  (from Transmuted Grade)',
]) {
  const want = heading.toUpperCase().replace(/\s+/g, ' ');
  const got = text.toUpperCase().replace(/\s+/g, ' ');
  check(`carries the workbook heading "${heading.slice(0, 34)}…"`, got.includes(want));
}

// Statistics columns belong to the proficiency tables only.
const ww = page.locator('.loa-table').first();
// The headers render uppercase via CSS, and the accessible name follows
// the rendered text — so match case-insensitively, not exact.
const header = (scope, name) =>
  scope.getByRole('columnheader', { name: new RegExp(`^${name}$`, 'i') });

for (const col of ['HPS', 'HSO', 'LSO', 'Mean', 'MPS']) {
  check(`Written Works has a ${col} column`, (await header(ww, col).count()) > 0);
}
const pt = page.locator('.loa-table').nth(1);
check('Performance Tasks omits the score statistics',
  (await header(pt, 'MPS').count()) === 0);

// Band headings, verbatim.
for (const band of ['Not Proficient', 'Low Proficient', 'Nearly Proficient',
                    'Proficient', 'Highly Proficient']) {
  check(`five-band scale shows "${band}"`, (await header(ww, band).count()) > 0);
}
for (const band of ['Did Not Meet Expectations', 'Fairly Satisfactory',
                    'Satisfactory', 'Very Satisfactory', 'Outstanding']) {
  check(`seven-band scale shows "${band}"`, (await header(pt, band).count()) > 0);
}
const outstanding = header(pt, 'Outstanding');
check('Outstanding spans its three ranges as one heading',
  (await outstanding.count()) === 1
  && (await outstanding.first().getAttribute('colspan')) === '6',
  `${await outstanding.count()} heading(s)`);

// Rows are SECTIONS, not learners.
const rowLabels = await ww.locator('tbody th[scope=row]').allInnerTexts();
check('rows are sections with a Total beneath',
  rowLabels.length >= 2 && rowLabels.at(-1) === 'Total', rowLabels.join(' / '));
check('covers more than the open class',
  rowLabels.length > 2, `${rowLabels.length - 1} section(s)`);

// The check column, and the fact that it flags.
check('flags a Total that is not 100',
  (await page.locator('.tbl.loa td[data-warn="true"]').count()) > 0,
  'the "(to check entries)" column earns its place');
check('closes with the workbook footer',
  /Kindly check the number of learners per section/i.test(text));

await page.screenshot({ path: '/tmp/loa-report.png', fullPage: true });
await browser.close();

console.log('PASS:'); for (const o of ok) console.log('  ✓', o);
if (fails.length) { console.log('FAIL:'); for (const f of fails) console.log('  ✗', f); process.exit(1); }
console.log(`\nall ${ok.length} checks passed`);
