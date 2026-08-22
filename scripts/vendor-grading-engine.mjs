/**
 * Copy the canonical grading engine into the Edge Function, verbatim.
 *
 * The brief's hardest constraint is that there is ONE grading
 * calculation. Not "two implementations we keep in sync" — one file.
 * The only reason a copy exists at all is that Deno resolves module
 * specifiers by URL and therefore requires the file extension that
 * Vite's bundler forbids. So the copy is mechanical and reversible:
 *
 *     import ... from './types'   →   import ... from './types.ts'
 *
 * and nothing else changes. `--check` re-derives the copy and diffs it
 * against what is on disk, which is what the drift test and CI run. If
 * anyone edits the vendored copy directly, or edits the canonical
 * engine without re-vendoring, the diff fails and the build stops.
 *
 *   node scripts/vendor-grading-engine.mjs          # write
 *   node scripts/vendor-grading-engine.mjs --check  # verify, exit 1 on drift
 *   node scripts/vendor-grading-engine.mjs --print  # emit deploy payload JSON
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The canonical engine. `grading.test.ts` and `fixtures.ts` stay behind — the
 *  Edge Function needs the engine, not its test harness. */
export const ENGINE_FILES = ['index.ts', 'types.ts'];

const FROM = join(root, 'app/src/lib/grading');
const INTO = join(root, 'supabase/functions/compute-period-grades/grading');

const BANNER =
  '// GENERATED — DO NOT EDIT.\n' +
  '// Verbatim copy of app/src/lib/grading/<file>, produced by\n' +
  '// scripts/vendor-grading-engine.mjs. The only change is that relative\n' +
  '// import specifiers carry the .ts extension Deno requires. Edit the\n' +
  '// canonical file and re-run the script; edits here are overwritten and\n' +
  '// fail `npm run engine:check`.\n\n';

/** The whole transformation, in one place so the check can replay it. */
export function vendor(source, name) {
  const denoified = source.replace(
    /(\bfrom\s+['"])(\.\.?\/[^'"]*?)(['"])/g,
    (whole, open, spec, close) =>
      /\.(ts|js|json)$/.test(spec) ? whole : `${open}${spec}.ts${close}`,
  );
  return BANNER.replace('<file>', name) + denoified;
}

/** The copy as it SHOULD be, derived fresh from the canonical source. */
export function expectedFiles() {
  return new Map(
    ENGINE_FILES.map((f) => [f, vendor(readFileSync(join(FROM, f), 'utf8'), f)]),
  );
}

export const VENDOR_DIR = INTO;

// Everything below is the command line. It must not run on import: the
// drift test imports `vendor` from this file, and a script that wrote
// the copy as a side-effect of being imported would repair the drift it
// was called on to detect — a test that can never fail.
const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) run();

function run() {
const expected = expectedFiles();

const mode = process.argv.includes('--check')
  ? 'check'
  : process.argv.includes('--print')
    ? 'print'
    : 'write';

if (mode === 'print') {
  process.stdout.write(
    JSON.stringify(
      [...expected].map(([name, content]) => ({ name: `grading/${name}`, content })),
      null,
      2,
    ),
  );
} else if (mode === 'check') {
  const drifted = [];
  for (const [name, content] of expected) {
    const at = join(INTO, name);
    if (!existsSync(at)) drifted.push(`${name}: missing`);
    else if (readFileSync(at, 'utf8') !== content) drifted.push(`${name}: differs`);
  }
  if (drifted.length) {
    console.error(
      'Grading engine drift detected:\n  ' +
        drifted.join('\n  ') +
        '\n\nThe Edge Function is running a DIFFERENT grading engine from the\n' +
        'browser. Run `node scripts/vendor-grading-engine.mjs` and redeploy.',
    );
    process.exit(1);
  }
  console.log(`engine in sync (${ENGINE_FILES.join(', ')})`);
} else {
  mkdirSync(INTO, { recursive: true });
  for (const [name, content] of expected) writeFileSync(join(INTO, name), content);
  console.log(`vendored ${ENGINE_FILES.length} file(s) → ${INTO.replace(root + '/', '')}`);
}
}
