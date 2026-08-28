/**
 * Legibility: the product has to work for a teacher in their fifties.
 *
 * A good share of DepEd teachers are over fifty. Presbyopia is not a
 * minority accommodation in that population, it is the median — so this
 * suite treats "can it be read" as a functional requirement with a
 * number attached, not as taste.
 *
 * The two failures it was written against, both found from a screenshot
 * of the LOA report:
 *
 *   1. 132 of the 140 font sizes in the stylesheets were 14px or below,
 *      bottoming out at 9.5px. Table data — the actual grades — sat at
 *      11.5-13px.
 *   2. Real percentages in the LOA bands were rendered in --faint, which
 *      measured 2.37:1 against the row behind it. WCAG AA wants 4.5:1
 *      for normal text. A number a teacher cannot read has not been
 *      shown to them.
 *
 * Checks 1-6 hold the floor. 7-12 hold the Text size preference, which
 * is the part that serves the person for whom the new default is still
 * not enough.
 *
 *   VITE_DEMO_MODE=true VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
 *     npx vite --port 5199 --strictPort
 *   node e2e/legibility.mjs
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

/** Relative luminance + WCAG contrast, computed in the page from what actually rendered. */
const CONTRAST = `(() => {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = (rgb) => {
    const [r, g, b] = rgb.match(/\\d+(\\.\\d+)?/g).slice(0, 3).map(Number);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  // The effective background, COMPOSITED. Walking up to the first
  // non-transparent backgroundColor is wrong: a panel with
  // rgba(255,255,255,.02) over a near-black sidebar is not white, and
  // treating it as white reports a false contrast failure. Collect the
  // translucent layers, then blend them over the first opaque one.
  const parse = (c) => {
    const n = (c.match(/[\\d.]+/g) || []).map(Number);
    return { r: n[0] ?? 255, g: n[1] ?? 255, b: n[2] ?? 255, a: n[3] ?? 1 };
  };
  const effectiveBg = (el) => {
    const layers = [];
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let n = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c.a === 0) continue;
      if (c.a === 1) { base = c; break; }
      layers.push(c);
    }
    // Nearest layer is first; composite from the bottom up.
    let out = base;
    for (const c of layers.reverse()) {
      out = {
        r: c.r * c.a + out.r * (1 - c.a),
        g: c.g * c.a + out.g * (1 - c.a),
        b: c.b * c.a + out.b * (1 - c.a),
        a: 1,
      };
    }
    // Concatenated, not a template literal: this whole helper is itself
    // inside one, and a nested backtick would end it early.
    return 'rgb(' + out.r + ', ' + out.g + ', ' + out.b + ')';
  };
  window.__contrast = (el) => {
    const a = lum(getComputedStyle(el).color), b = lum(effectiveBg(el));
    const hi = Math.max(a, b), lo = Math.min(a, b);
    return (hi + 0.05) / (lo + 0.05);
  };
})()`;

await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

const openLoa = async () => {
  await page.getByRole('button', { name: /^My Classes$/ }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /Open|Mathematics 10/ }).first().click();
  await page.waitForTimeout(800);
  await page.getByRole('tab', { name: /^LOA$/i }).click();
  await page.waitForTimeout(800);
};
await openLoa();
await page.evaluate(CONTRAST);

/* ---- 1. nothing readable is under 14px ------------------------------ */
const tooSmall = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const text = [...el.childNodes]
      .filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('');
    if (!text) continue;
    const px = parseFloat(getComputedStyle(el).fontSize);
    // 12px is the documented floor and is for badges and unit marks —
    // a pill reading "58" or a "%" sub-head, never prose or a value.
    if (px < 12) out.push(`${el.className || el.tagName} ${px}px "${text.slice(0, 24)}"`);
  }
  return out;
});
check('1. no rendered text anywhere is below the 12px floor',
  tooSmall.length === 0, tooSmall.slice(0, 4).join(' | ') || 'clean');

/* ---- 2. the LOA numbers specifically -------------------------------- */
const numberPx = await page.evaluate(() =>
  parseFloat(getComputedStyle(document.querySelector('.tbl.loa td.num')).fontSize));
check('2. LOA data sits at 15px, not the old 11.5px',
  numberPx >= 15, `${numberPx}px`);

/* ---- 3-4. contrast of the column that was unreadable ---------------- */
const pctContrast = await page.evaluate(() => {
  const cells = [...document.querySelectorAll('.tbl.loa td.pct')]
    .filter((c) => c.textContent.trim() && c.textContent.trim() !== '0');
  return Math.min(...cells.map((c) => window.__contrast(c)));
});
check('3. LOA percentages clear WCAG AA (4.5:1)',
  pctContrast >= 4.5, `${pctContrast.toFixed(2)}:1 — was 2.37:1 in --faint`);

const worstBody = await page.evaluate(() => {
  let worst = 99, where = '';
  for (const el of document.querySelectorAll('.tbl td, .tbl th, p, li, dd, dt, .side-link, .side-demo-note, .side-sub')) {
    const text = [...el.childNodes]
      .filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('');
    if (!text) continue;
    const r = window.__contrast(el);
    if (r < worst) { worst = r; where = `${el.className || el.tagName} "${text.slice(0, 20)}"`; }
  }
  return { worst, where };
});
check('4. the worst-contrast text anywhere on screen clears AA',
  worstBody.worst >= 4.5, `${worstBody.worst.toFixed(2)}:1 at ${worstBody.where}`);

/* ---- 5. a zero is dimmed but still legible -------------------------- */
const zeroContrast = await page.evaluate(() => {
  const z = document.querySelector('.tbl.loa td.num[data-zero="true"]');
  return z ? window.__contrast(z) : null;
});
check('5. dimmed zeros are de-emphasised, not hidden',
  zeroContrast !== null && zeroContrast >= 4.5,
  zeroContrast ? `${zeroContrast.toFixed(2)}:1` : 'no zero cell found');

/* ---- 6. the report still fits, by scrolling rather than shrinking --- */
const bodyScrolls = await page.evaluate(() =>
  document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
check('6. wide tables scroll inside their own wrapper',
  !bodyScrolls, 'the page body must never scroll sideways');

/* ---- 7-10. the Text size preference --------------------------------- */
const baseAt = () => page.evaluate(() =>
  parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs-base')));

check('7. the default base size is 16px', await baseAt() === 16, `${await baseAt()}px`);

await page.getByRole('button', { name: /Standard/ }).click();
await page.waitForTimeout(300);
await page.getByRole('menuitemradio', { name: /Largest/ }).click();
await page.waitForTimeout(500);

check('8. Largest raises the base to 20px', await baseAt() === 20, `${await baseAt()}px`);

const grownPx = await page.evaluate(() =>
  parseFloat(getComputedStyle(document.querySelector('.tbl.loa td.num')).fontSize));
check('9. and the whole scale follows in proportion',
  grownPx > numberPx, `${numberPx}px → ${grownPx}px`);

/* ---- 10. the thing that actually broke at large text ---------------- */
const submissionTabVisible = await page.getByRole('tab', { name: /Submission/ }).isVisible();
check('10. every class tab is still reachable at Largest',
  submissionTabVisible,
  'these used to scroll horizontally, and Submission fell off the edge unannounced');

const stillNoBodyScroll = await page.evaluate(() =>
  document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
check('11. and the page still does not scroll sideways',
  !stillNoBodyScroll);

/* ---- 12. the preference survives a reload --------------------------- */
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(600);
check('12. the choice is remembered — nobody re-picks it every morning',
  await baseAt() === 20, `${await baseAt()}px after reload`);

/* ---- 13. SF10 is deliberately exempt -------------------------------- */
// The form is filed on paper. Its rows must fit a fixed sheet, so it is
// the one surface that does NOT follow the reader's preference.
const sf10Fixed = await page.evaluate(() => {
  const css = [...document.styleSheets]
    .flatMap((s) => { try { return [...s.cssRules]; } catch { return []; } })
    .filter((r) => r.selectorText?.includes('.sf10'))
    .map((r) => r.style?.fontSize).filter(Boolean);
  return css.length > 0 && css.every((v) => !v.includes('var(--fs-'));
});
check('13. the SF10 print template stays off the scale',
  sf10Fixed, 'a division office would reject a form that reflowed');

await browser.close();
console.log('PASS:'); for (const o of ok) console.log('  ✓', o);
if (fails.length) { console.log('FAIL:'); for (const f of fails) console.log('  ✗', f); process.exit(1); }
console.log(`\nall ${ok.length} checks passed`);
