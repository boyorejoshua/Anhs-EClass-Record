import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// The script that performs the copy also exports the transformation, so
// this test replays the real thing rather than a second guess at it.
import { ENGINE_FILES, vendor } from '../../../../scripts/vendor-grading-engine.mjs';

/**
 * ONE GRADING ENGINE — enforced, not promised.
 *
 * The brief is unambiguous: "Do not create a second grading engine in
 * SQL. Do not duplicate grading logic in: React, SQL, Edge Function,
 * Student Portal. There must be ONE canonical grading calculation
 * implementation."
 *
 * A comment saying "keep these in sync" is not a mechanism. Two copies
 * of a formula diverge the first time someone fixes a rounding bug in
 * the file they happen to have open — and the failure is silent: the
 * teacher's screen shows 87, the transcript says 86, and nobody can say
 * which is the grade.
 *
 * So the Edge Function's copy is generated, and this test regenerates
 * it and diffs. Edit either side without re-vendoring and the suite
 * goes red before the divergence can reach a learner's record.
 */

const root = join(import.meta.dirname, '../../../..');
const canonical = join(root, 'app/src/lib/grading');
const vendored = join(root, 'supabase/functions/compute-period-grades/grading');

describe('the Edge Function runs the canonical grading engine', () => {
  for (const name of ENGINE_FILES) {
    it(`${name} has not drifted`, () => {
      const at = join(vendored, name);
      expect(existsSync(at), `${name} was never vendored — run npm run engine:vendor`)
        .toBe(true);

      const want = vendor(readFileSync(join(canonical, name), 'utf8'), name);
      expect(
        readFileSync(at, 'utf8'),
        `The deployed engine differs from app/src/lib/grading/${name}. ` +
          'Run `npm run engine:vendor` and redeploy the function.',
      ).toBe(want);
    });
  }

  it('changes nothing but the import specifiers', () => {

    // The guard on the guard: if the transformation ever grew a second
    // rule, "verbatim copy" would stop being true and this test would
    // still pass. Strip the banner and the .ts suffixes and the bytes
    // must be identical to the source.
    for (const name of ENGINE_FILES) {
      const source = readFileSync(join(canonical, name), 'utf8');
      const back = vendor(source, name)
        // The banner is a fixed prefix of a known length for this file.
        .slice(vendor('', name).length)
        .replace(/(\bfrom\s+['"])(\.\.?\/[^'"]*?)\.ts(['"])/g, '$1$2$3');
      expect(back, `${name}: the vendor step is doing more than rewriting imports`).toBe(source);
    }
  });

  it('vendors the engine but not its test harness', () => {
    // fixtures.ts and grading.test.ts must NOT ship: they pull in vitest,
    // which does not exist in the Deno runtime, and the function would
    // fail to boot.
    expect(ENGINE_FILES).toEqual(['index.ts', 'types.ts']);
    expect(existsSync(join(vendored, 'grading.test.ts'))).toBe(false);
    expect(existsSync(join(vendored, 'fixtures.ts'))).toBe(false);
  });

  it('keeps the engine free of runtime-specific globals', () => {
    // The engine is pure by design. A stray `window`, `document` or
    // `process` would work in one runtime and crash in the other, which
    // is drift by a different route.
    for (const name of ENGINE_FILES) {
      const source = readFileSync(join(canonical, name), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      for (const global of ['window', 'document', 'localStorage', 'process', 'Deno', 'fetch(']) {
        expect(source.includes(global), `${name} references ${global}`).toBe(false);
      }
    }
  });
});
