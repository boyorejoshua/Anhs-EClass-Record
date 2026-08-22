/**
 * Builds a single self-contained HTML file for review.
 *
 * The app is entirely client-side today (fixtures, no backend), so the
 * whole thing inlines into one file that can be opened from disk, sent
 * as an attachment, or published as a preview — no server, no hosting.
 *
 * Demo affordances are ON in this build: reviewers need the role
 * switcher and the tenant toggle to see every screen. Do NOT use this
 * output for anything a school touches — `npm run build` is that.
 *
 *   npm run build:staging   ->  staging/index.html
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist-staging';
const assets = readdirSync(join(DIST, 'assets'));
const jsFile  = assets.find((f) => f.endsWith('.js'));
const cssFile = assets.find((f) => f.endsWith('.css'));
if (!jsFile || !cssFile) throw new Error(`no build output in ${DIST}/assets`);

const js  = readFileSync(join(DIST, 'assets', jsFile),  'utf8');
const css = readFileSync(join(DIST, 'assets', cssFile), 'utf8');

// A literal </script> inside the bundle would close the tag early and
// silently break the page. Fail loudly rather than ship that.
if (/<\/script/i.test(js)) {
  throw new Error('bundle contains "</script>" — escape it before inlining');
}

const FONTS =
  'https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700' +
  '&family=Spectral:wght@500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap';

const out = `<title>Mendtrix Academic Records</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">

<style>
${css}

/* A host may paint its own ground behind an embedded page, so paint
   ours explicitly rather than inheriting it. The app is one committed
   visual world with its own Appearance control and does not follow a
   host theme — which is also why the appearance attribute is
   data-appearance and not data-theme. */
html, body { background: var(--app-bg); margin: 0; min-height: 100%; }
#root { min-height: 100vh; }
</style>

<div id="root"></div>

<script type="module">
${js}
</script>
`;

mkdirSync('staging', { recursive: true });
writeFileSync('staging/index.html', out);
console.log(`staging/index.html — ${(out.length / 1024).toFixed(0)} KB, self-contained`);
