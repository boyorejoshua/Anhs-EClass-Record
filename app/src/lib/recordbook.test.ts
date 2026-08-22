import { describe, expect, it } from 'vitest';
import {
  analytics, loaReport, reconcileRecorded, summaryRows, PROFICIENCY_BANDS,
} from './recordbook';
import { compute } from './grading';
import { DO015_CORE } from './grading/fixtures';
import type { GradebookData, PersistedGrade } from '../data/types';
import type { Assessment, GradingScheme } from './grading';

/* ------------------------------------------------------------------ *
 * A legacy-shaped fixture.
 *
 * The legacy grading model is: two arrays of items (Written Works,
 * Performance Tasks) and one scalar Quarterly Assessment, with
 * {ww:.30, pt:.50, qa:.20}. Reproduced here as a scheme so the new
 * engine can be validated against arithmetic taken straight from
 * legacy `calcQ` — see docs/grading-calculation-validation.md.
 * ------------------------------------------------------------------ */

const LEGACY_SCHEME: GradingScheme = {
  id: 'legacy',
  name: 'Legacy pre-DO-015 (30/50/20)',
  passMark: 75,
  roundingMode: 'half_up',
  decimalPlaces: 0,
  transmutation: DO015_CORE.transmutation,
  descriptors: DO015_CORE.descriptors,
  components: [
    { id: 'ww', code: 'WW', name: 'Written Works',      weight: 30, parentId: null, ordinal: 1 },
    { id: 'pt', code: 'PT', name: 'Performance Tasks',  weight: 50, parentId: null, ordinal: 2 },
    { id: 'qa', code: 'QA', name: 'Quarterly Assessment', weight: 20, parentId: null, ordinal: 3 },
  ],
};

const LEGACY_ITEMS: Assessment[] = [
  { id: 'ww1', componentId: 'ww', ordinal: 1, title: 'WW1', highestPossibleScore: 20 },
  { id: 'ww2', componentId: 'ww', ordinal: 2, title: 'WW2', highestPossibleScore: 30 },
  { id: 'pt1', componentId: 'pt', ordinal: 1, title: 'PT1', highestPossibleScore: 40 },
  { id: 'pt2', componentId: 'pt', ordinal: 2, title: 'PT2', highestPossibleScore: 60 },
  { id: 'qa1', componentId: 'qa', ordinal: 1, title: 'QA',  highestPossibleScore: 50 },
];

function run(raw: Record<string, number | null>) {
  return compute(
    LEGACY_SCHEME,
    LEGACY_ITEMS,
    LEGACY_ITEMS.map((a) => ({ assessmentId: a.id, raw: raw[a.id] ?? null, isExcused: false })),
  );
}

describe('legacy calculation parity', () => {
  /**
   * Worked by hand from legacy `calcQ`:
   *   wwS=40  wwH=50   → PS 80.00  × .30 = 24.00
   *   ptS=80  ptH=100  → PS 80.00  × .50 = 40.00
   *   qa =40  qaH=50   → PS 80.00  × .20 = 16.00
   *   initial = 80.00 → transmute → 87
   */
  it('matches a normal spread', () => {
    const r = run({ ww1: 15, ww2: 25, pt1: 32, pt2: 48, qa1: 40 });
    expect(r.components.find((c) => c.code === 'WW')!.percentageScore).toBe(80);
    expect(r.components.find((c) => c.code === 'PT')!.percentageScore).toBe(80);
    expect(r.components.find((c) => c.code === 'QA')!.percentageScore).toBe(80);
    expect(r.initialGrade).toBe(80);
    expect(r.periodGrade).toBe(87);
  });

  it('matches perfect scores', () => {
    // Every PS = 100 → initial 100 → transmute(100) = 100.
    const r = run({ ww1: 20, ww2: 30, pt1: 40, pt2: 60, qa1: 50 });
    expect(r.initialGrade).toBe(100);
    expect(r.periodGrade).toBe(100);
  });

  it('matches all-zero scores', () => {
    // Legacy transmute() floors at 60 for an initial of 0. A zero is a
    // mark the learner earned, so it must produce a grade — not null.
    const r = run({ ww1: 0, ww2: 0, pt1: 0, pt2: 0, qa1: 0 });
    expect(r.initialGrade).toBe(0);
    expect(r.periodGrade).toBe(60);
  });

  it('produces no grade when nothing is scored', () => {
    // Legacy: initial stays null unless at least one component has a
    // value. Distinct from all-zeros, which is a real 60.
    const r = run({});
    expect(r.initialGrade).toBeNull();
    expect(r.periodGrade).toBeNull();
  });

  it('handles a decimal score', () => {
    // wwS=22.5 wwH=50 → 45.00 × .30 = 13.50
    const r = run({ ww1: 10.5, ww2: 12, pt1: 40, pt2: 60, qa1: 50 });
    expect(r.components.find((c) => c.code === 'WW')!.percentageScore).toBe(45);
    expect(r.initialGrade).toBe(83.5);
    expect(r.periodGrade).toBe(89);
  });

  it('sits exactly on the pass mark at the documented boundary', () => {
    // transmute() maps initial 60.00–61.59 to 75, the pass mark. This is
    // the single most consequential row in the table.
    const r = run({ ww1: 12, ww2: 18, pt1: 24, pt2: 36, qa1: 30 });
    expect(r.initialGrade).toBe(60);
    expect(r.periodGrade).toBe(75);
  });

  it('falls one band below the pass mark just under the boundary', () => {
    const r = run({ ww1: 11, ww2: 18, pt1: 24, pt2: 36, qa1: 30 });
    expect(r.initialGrade).toBeLessThan(60);
    expect(r.periodGrade).toBe(74);
  });
});

describe('divergences from legacy, deliberate', () => {
  it('redistributes an unscored component instead of zeroing it', () => {
    // ⚠️ THIS IS THE ONE REAL BEHAVIOURAL DIFFERENCE.
    //
    // Legacy `calcQ` treats an untouched component as contributing 0 to
    // the initial grade, so a learner marked only on Written Works in
    // week two shows a failing grade all term.
    //
    // The new engine drops a component with no scores and redistributes
    // its weight, so a partial record reads as a grade-so-far. Both are
    // defensible; the new one is what a teacher expects mid-term, and
    // once every component has a score the two agree exactly.
    const r = run({ ww1: 20, ww2: 30 });          // WW only, perfect
    expect(r.components.find((c) => c.code === 'WW')!.percentageScore).toBe(100);
    expect(r.initialGrade).toBe(100);             // legacy would give 30
    expect(r.isProvisional).toBe(true);
  });

  it('agrees with legacy once every component has a score', () => {
    const partial = run({ ww1: 20, ww2: 30 });
    const full = run({ ww1: 20, ww2: 30, pt1: 40, pt2: 60, qa1: 50 });
    expect(partial.isProvisional).toBe(true);
    expect(full.isProvisional).toBe(false);
    expect(full.initialGrade).toBe(100);
  });

  it('has no ten-item ceiling', () => {
    // Legacy `Array(10).fill(null)` caps each component at ten items.
    const many: Assessment[] = Array.from({ length: 24 }, (_, i) => ({
      id: `w${i}`, componentId: 'ww', ordinal: i + 1, title: null, highestPossibleScore: 10,
    }));
    const r = compute(
      { ...LEGACY_SCHEME, components: [LEGACY_SCHEME.components[0]!] },
      many,
      many.map((a) => ({ assessmentId: a.id, raw: 8, isExcused: false })),
    );
    expect(r.components[0]!.assessmentCount).toBe(24);
    expect(r.components[0]!.percentageScore).toBe(80);
  });
});

/* ------------------------------------------------------------------ *
 * Summary / Analytics / LOA
 * ------------------------------------------------------------------ */

function gradebook(scores: Record<string, Record<string, number | null>>): GradebookData {
  return {
    classId: 'c1',
    periodId: 'p1',
    scheme: LEGACY_SCHEME,
    assessments: LEGACY_ITEMS,
    roster: Object.keys(scores).map((k, i) => ({
      classEnrollmentId: k, studentId: `s${i}`, displayName: `Learner ${k}`,
    })),
    scores: Object.fromEntries(
      Object.entries(scores).map(([k, v]) => [
        k, Object.fromEntries(Object.entries(v).map(([a, raw]) => [a, { raw, isExcused: false }])),
      ]),
    ),
    status: 'draft',
    editable: true,
  };
}

const FULL = { ww1: 20, ww2: 30, pt1: 40, pt2: 60, qa1: 50 };   // → 100
const MID  = { ww1: 15, ww2: 25, pt1: 32, pt2: 48, qa1: 40 };   // → 87
const FAIL = { ww1: 5,  ww2: 8,  pt1: 10, pt2: 15, qa1: 12 };   // low

describe('summary rows', () => {
  it('reports one row per learner with a component breakdown', () => {
    const rows = summaryRows(gradebook({ a: FULL, b: MID }));
    expect(rows).toHaveLength(2);
    expect(rows[0]!.components.map((c) => c.code)).toEqual(['WW', 'PT', 'QA']);
    expect(rows[0]!.periodGrade).toBe(100);
    expect(rows[1]!.periodGrade).toBe(87);
  });

  it('counts missing scores and flags an untouched learner', () => {
    const rows = summaryRows(gradebook({ a: {}, b: { ww1: 20 } }));
    expect(rows[0]!.missingCount).toBe(5);
    expect(rows[0]!.untouched).toBe(true);
    expect(rows[1]!.missingCount).toBe(4);
    expect(rows[1]!.untouched).toBe(false);
  });

  it('attaches the descriptor from the scheme, not a hard-coded scale', () => {
    const rows = summaryRows(gradebook({ a: FULL }));
    expect(rows[0]!.descriptor).toBe('Outstanding');
    expect(rows[0]!.passed).toBe(true);
  });

  it('marks a learner below the pass mark as failed', () => {
    const rows = summaryRows(gradebook({ a: FAIL }));
    expect(rows[0]!.passed).toBe(false);
  });
});

describe('analytics', () => {
  it('computes only over learners who have a grade', () => {
    // A learner with nothing entered must not drag the average to zero —
    // that is the legacy behaviour this deliberately avoids.
    const rows = summaryRows(gradebook({ a: FULL, b: MID, c: {} }));
    const a = analytics(rows, LEGACY_SCHEME, LEGACY_ITEMS.length);
    expect(a.classSize).toBe(3);
    expect(a.graded).toBe(2);
    expect(a.ungraded).toBe(1);
    expect(a.average).toBe(93.5);          // (100 + 87) / 2
    expect(a.highest).toBe(100);
    expect(a.lowest).toBe(87);
  });

  it('counts passing and failing against the scheme pass mark', () => {
    const rows = summaryRows(gradebook({ a: FULL, b: FAIL }));
    const a = analytics(rows, LEGACY_SCHEME, LEGACY_ITEMS.length);
    expect(a.passing).toBe(1);
    expect(a.failing).toBe(1);
  });

  it('reports completion from filled cells, not from learners', () => {
    // 2 learners x 5 assessments = 10 cells; one learner fully blank.
    const rows = summaryRows(gradebook({ a: FULL, b: {} }));
    const a = analytics(rows, LEGACY_SCHEME, LEGACY_ITEMS.length);
    expect(a.missingScores).toBe(5);
    expect(a.completion).toBe(50);
  });

  it('never divides by zero on an empty class', () => {
    const a = analytics([], LEGACY_SCHEME, 0);
    expect(a.average).toBeNull();
    expect(a.completion).toBe(0);
    expect(a.distribution.every((b) => b.count === 0)).toBe(true);
  });

  it('puts a learner in exactly one distribution band', () => {
    const rows = summaryRows(gradebook({ a: FULL, b: MID, c: FAIL }));
    const a = analytics(rows, LEGACY_SCHEME, LEGACY_ITEMS.length);
    expect(a.distribution.reduce((n, b) => n + b.count, 0)).toBe(a.graded);
  });

  it('lists the learners who need attention, worst first', () => {
    const rows = summaryRows(gradebook({ a: FULL, b: FAIL, c: {} }));
    const a = analytics(rows, LEGACY_SCHEME, LEGACY_ITEMS.length);
    expect(a.needsAttention.map((s) => s.name)).toContain('Learner b');
    expect(a.needsAttention.map((s) => s.name)).toContain('Learner c');
    expect(a.needsAttention.map((s) => s.name)).not.toContain('Learner a');
    expect(a.needsAttention[0]!.grade).not.toBeNull();   // graded-but-failing first
  });
});

describe('LOA — Level of Achievement', () => {
  it('bands every component of the scheme', () => {
    const rows = summaryRows(gradebook({ a: FULL, b: MID, c: FAIL }));
    const loa = loaReport(rows, LEGACY_SCHEME);
    expect(loa.sections.map((s) => s.code)).toEqual(['WW', 'PT', 'QA']);
    expect(loa.sections[0]!.bands.map((b) => b.key))
      .toEqual(['hp', 'p', 'np2', 'lp', 'np']);
  });

  it('assigns each scored learner to exactly one proficiency band', () => {
    const rows = summaryRows(gradebook({ a: FULL, b: MID, c: FAIL }));
    const loa = loaReport(rows, LEGACY_SCHEME);
    for (const s of loa.sections) {
      expect(s.bands.reduce((n, b) => n + b.count, 0)).toBe(s.scored);
    }
  });

  it('leaves no gap or overlap between the proficiency thresholds', () => {
    // Transcribed from legacy profBands: >=90 / >=75 / >=50 / >=25 / else.
    for (let v = 0; v <= 100; v += 0.5) {
      const hits = PROFICIENCY_BANDS.filter(([, , , min, max]) => v >= min && v <= max);
      expect(hits, `percentage ${v} matched ${hits.length} bands`).toHaveLength(1);
    }
  });

  it('excludes learners with no score from the bands but counts them', () => {
    const rows = summaryRows(gradebook({ a: FULL, b: {} }));
    const loa = loaReport(rows, LEGACY_SCHEME);
    expect(loa.learners).toBe(2);
    expect(loa.sections[0]!.scored).toBe(1);
    expect(loa.sections[0]!.missing).toBe(1);
    expect(loa.sections[0]!.bands.reduce((n, b) => n + b.count, 0)).toBe(1);
  });

  it('uses the scheme descriptors for the grade distribution', () => {
    // Not a second hard-coded scale — a school that configures its
    // descriptors differently must see its own bands here.
    const rows = summaryRows(gradebook({ a: FULL }));
    const loa = loaReport(rows, LEGACY_SCHEME);
    expect(loa.gradeBands.map((b) => b.label))
      .toEqual(LEGACY_SCHEME.descriptors.map((d) => d.label).sort(
        (x, y) => LEGACY_SCHEME.descriptors.find((d) => d.label === y)!.minGrade
                - LEGACY_SCHEME.descriptors.find((d) => d.label === x)!.minGrade));
  });

  it('reports percentages against the whole class, not just the scored', () => {
    const rows = summaryRows(gradebook({ a: FULL, b: {} }));
    const loa = loaReport(rows, LEGACY_SCHEME);
    const hp = loa.sections[0]!.bands.find((b) => b.key === 'hp')!;
    expect(hp.count).toBe(1);
    expect(hp.percent).toBe(50);     // 1 of 2 learners, not 1 of 1 scored
  });
});

describe('recorded vs. live grades', () => {
  /** A grade as the server would have stored it for this learner. */
  const stored = (grade: number, at = '2026-08-22T10:00:00Z'): PersistedGrade => ({
    initialGrade: grade, periodGrade: grade,
    descriptor: null, remark: null, passed: grade >= 75,
    computedAt: at, computedMode: 'final', version: 1, componentBreakdown: null,
  });

  it('reports nothing recorded before a period has ever been submitted', () => {
    const r = reconcileRecorded(gradebook({ a: FULL, b: MID }), {});
    expect(r.recordedCount).toBe(0);
    expect(r.complete).toBe(false);
    expect(r.staleCount).toBe(0);
    expect(r.rows.every((x) => x.recorded === null)).toBe(true);
  });

  it('matches the server when the scores have not moved since submission', () => {
    const gb = gradebook({ a: FULL, b: MID });
    const live = reconcileRecorded(gb, {});
    const asStored = Object.fromEntries(
      live.rows.map((x) => [x.classEnrollmentId, stored(x.recomputed!)]),
    );
    const r = reconcileRecorded(gb, asStored);
    expect(r.recordedCount).toBe(2);
    expect(r.staleCount).toBe(0);
    expect(r.complete).toBe(true);
    expect(r.computedAt).toBe('2026-08-22T10:00:00Z');
  });

  it('flags a recorded grade the current scores no longer produce', () => {
    // The registrar is looking at 87. Someone has since changed a mark.
    const gb = gradebook({ a: MID });
    const r = reconcileRecorded(gb, { a: stored(60) });
    expect(r.staleCount).toBe(1);
    expect(r.rows[0]!.recorded!.periodGrade).toBe(60);
    expect(r.rows[0]!.recomputed).not.toBe(60);
  });

  it('does NOT flag the running/final difference as staleness', () => {
    // This is the trap. Mid-term, the Summary tab shows a RUNNING grade
    // that ignores the unscored exam, while the recorded grade counted
    // it as zero. Those two numbers differ by design, and a naive
    // comparison would mark every mid-term class as drifted.
    const partial = { ww1: 20, ww2: 30, pt1: 40, pt2: 60 };  // qa1 unscored
    const gb = gradebook({ a: partial });

    const running = summaryRows(gb)[0]!.periodGrade;
    const final = reconcileRecorded(gb, {}).rows[0]!.recomputed;
    expect(running).not.toBe(final);   // the modes really do disagree

    // The server recorded the FINAL number, so nothing is stale.
    const r = reconcileRecorded(gb, { a: stored(final!) });
    expect(r.staleCount).toBe(0);
  });

  it('withholds a single computed-at when the grades came from two runs', () => {
    const gb = gradebook({ a: FULL, b: MID });
    const live = reconcileRecorded(gb, {});
    const [a, b] = live.rows;
    const r = reconcileRecorded(gb, {
      a: stored(a!.recomputed!, '2026-08-20T09:00:00Z'),
      b: stored(b!.recomputed!, '2026-08-22T10:00:00Z'),
    });
    expect(r.computedAt).toBeNull();
    expect(r.recordedCount).toBe(2);
  });

  it('is incomplete when a learner joined after the grades were computed', () => {
    const gb = gradebook({ a: FULL, b: MID });
    const r = reconcileRecorded(gb, { a: stored(100) });
    expect(r.complete).toBe(false);
    expect(r.recordedCount).toBe(1);
    // The new learner is present, with nothing on file — not omitted.
    expect(r.rows).toHaveLength(2);
    expect(r.rows[1]!.recorded).toBeNull();
  });
});

describe('the running/final gap is reported, not hidden', () => {
  const stored = (grade: number): PersistedGrade => ({
    initialGrade: grade, periodGrade: grade, descriptor: null, remark: null,
    passed: grade >= 75, computedAt: '2026-08-22T10:00:00Z',
    computedMode: 'final', version: 1, componentBreakdown: null,
  });

  it('flags the gap when work is still unscored', () => {
    // The Summary table shows the running grade; the Filed column shows
    // the recorded one. With an unscored exam those are two different
    // numbers on the same row, which reads as a bug unless it is
    // explained.
    const gb = gradebook({ a: { ww1: 20, ww2: 30, pt1: 40, pt2: 60 } });
    const final = reconcileRecorded(gb, {}).rows[0]!.recomputed!;
    const r = reconcileRecorded(gb, { a: stored(final) });
    expect(r.runningDiffers).toBe(true);
    expect(r.staleCount).toBe(0);   // still not stale — just two modes
  });

  it('does not flag a gap once every assessment is scored', () => {
    const gb = gradebook({ a: FULL });
    const final = reconcileRecorded(gb, {}).rows[0]!.recomputed!;
    expect(reconcileRecorded(gb, { a: stored(final) }).runningDiffers).toBe(false);
  });

  it('reports no gap when nothing has been filed', () => {
    expect(reconcileRecorded(gradebook({ a: {} }), {}).runningDiffers).toBe(false);
  });
});
