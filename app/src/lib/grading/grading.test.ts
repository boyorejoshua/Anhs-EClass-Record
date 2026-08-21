import { describe, it, expect } from 'vitest';
import { compute, computeFinal, flattenComponents, round, transmute } from './index';
import { DEPED_TRANSMUTATION, DO015_CORE, DO015_MAPEH, V0_SCHEME, ZERO_BASED_CORE } from './fixtures';
import type { Assessment, Score } from './types';

const a = (id: string, componentId: string, hps: number, ordinal = 1): Assessment =>
  ({ id, componentId, ordinal, title: id, highestPossibleScore: hps });
const s = (assessmentId: string, raw: number | null, isExcused = false): Score =>
  ({ assessmentId, raw, isExcused });

describe('round', () => {
  it('half_up rounds .5 away from zero', () => {
    expect(round(82.5, 0, 'half_up')).toBe(83);
    expect(round(82.4, 0, 'half_up')).toBe(82);
  });
  it('half_up survives binary representation error', () => {
    // 8.245 is stored as 8.244999…; a naive Math.round gives 8.24
    expect(round(8.245, 2, 'half_up')).toBe(8.25);
  });
  it('half_even rounds ties to the even neighbour', () => {
    expect(round(2.5, 0, 'half_even')).toBe(2);
    expect(round(3.5, 0, 'half_even')).toBe(4);
  });
  it('truncate discards rather than rounds', () => {
    expect(round(82.99, 0, 'truncate')).toBe(82);
  });
});

describe('flattenComponents — the DO 015 component tree', () => {
  it('converts parent-relative weights into weights of the whole grade', () => {
    const leaves = flattenComponents(DO015_CORE.components);
    const byCode = Object.fromEntries(leaves.map((l) => [l.code, l.effectiveWeight]));

    expect(byCode.WW).toBe(20);
    expect(byCode.PT).toBe(50);
    // Examinations 30, split 30 / 30 / 40
    expect(byCode.ST1).toBeCloseTo(9, 6);
    expect(byCode.ST2).toBeCloseTo(9, 6);
    expect(byCode.TE).toBeCloseTo(12, 6);
    expect(Object.values(byCode).reduce((x, y) => x + y, 0)).toBeCloseTo(100, 6);
  });

  it('EX itself is not a leaf — only its children carry weight', () => {
    const codes = flattenComponents(DO015_CORE.components).map((l) => l.code);
    expect(codes).not.toContain('EX');
    expect(codes).toEqual(['WW', 'PT', 'ST1', 'ST2', 'TE']);
  });

  it('MAPEH uses the same tree with different weights', () => {
    const byCode = Object.fromEntries(
      flattenComponents(DO015_MAPEH.components).map((l) => [l.code, l.effectiveWeight]),
    );
    expect(byCode.WW).toBe(20);
    expect(byCode.PT).toBe(60);
    expect(byCode.ST1).toBeCloseTo(6, 6);
    expect(byCode.TE).toBeCloseTo(8, 6);
  });
});

describe('transmute — V0 parity', () => {
  it('reproduces the V0 table exactly at every band edge', () => {
    for (const band of DEPED_TRANSMUTATION) {
      expect(transmute(band.minInitial, V0_SCHEME)).toBe(band.outputGrade);
      expect(transmute(band.maxInitial, V0_SCHEME)).toBe(band.outputGrade);
    }
  });
  it('maps the passing threshold: initial 60 -> 75', () => {
    expect(transmute(60, V0_SCHEME)).toBe(75);
  });
  it('maps a perfect score', () => {
    expect(transmute(100, V0_SCHEME)).toBe(100);
  });
  it('clamps below the lowest band rather than leaking a raw value', () => {
    expect(transmute(-5, V0_SCHEME)).toBe(60);
  });
});

describe('transmute — zero-based grading (SY 2027-2028)', () => {
  it('rounds directly when the school has no transmutation table', () => {
    expect(transmute(82.4, ZERO_BASED_CORE)).toBe(82);
    expect(transmute(89.5, ZERO_BASED_CORE)).toBe(90);
  });
  it('is the ONLY difference from the DO 015 scheme', () => {
    const assessments = [a('w1', 'WW', 20), a('p1', 'PT', 50), a('t1', 'TE', 60)];
    const scores = [s('w1', 18), s('p1', 45), s('t1', 54)];
    const transmuted = compute(DO015_CORE, assessments, scores);
    const zeroBased = compute(ZERO_BASED_CORE, assessments, scores);

    // identical initial grade, different final grade
    expect(zeroBased.initialGrade).toBe(transmuted.initialGrade);
    expect(zeroBased.periodGrade).not.toBe(transmuted.periodGrade);
  });
});

describe('compute — DO 015 core subject', () => {
  const assessments = [
    a('w1', 'WW', 20, 1), a('w2', 'WW', 20, 2),
    a('p1', 'PT', 40, 1), a('p2', 'PT', 60, 2),
    a('st1', 'ST1', 40, 1), a('st2', 'ST2', 40, 1), a('te', 'TE', 60, 1),
  ];

  it('computes PS, weighted score and initial grade correctly', () => {
    const scores = [
      s('w1', 18), s('w2', 16),      // WW 34/40  = 85%
      s('p1', 36), s('p2', 48),      // PT 84/100 = 84%
      s('st1', 32),                  // ST1 32/40 = 80%
      s('st2', 36),                  // ST2 36/40 = 90%
      s('te', 48),                   // TE  48/60 = 80%
    ];
    const r = compute(DO015_CORE, assessments, scores);

    const ww = r.components.find((c) => c.code === 'WW')!;
    expect(ww.percentageScore).toBeCloseTo(85, 6);
    expect(ww.weightedScore).toBeCloseTo(17, 6);      // 85 x 20%

    const te = r.components.find((c) => c.code === 'TE')!;
    expect(te.effectiveWeight).toBeCloseTo(12, 6);
    expect(te.weightedScore).toBeCloseTo(9.6, 6);     // 80 x 12%

    // 17 + 42 + 7.2 + 8.1 + 9.6 = 83.9
    expect(r.initialGrade).toBeCloseTo(83.9, 2);
    expect(r.periodGrade).toBe(89);                    // 82.4-83.99 -> 89
    expect(r.descriptor).toBe('Very Satisfactory');
    expect(r.passed).toBe(true);
    expect(r.isProvisional).toBe(false);
  });

  it('gives MAPEH a different grade from the same raw scores', () => {
    const scores = [
      s('w1', 20), s('w2', 20),   // WW 100%
      s('p1', 20), s('p2', 30),   // PT  50%
      s('st1', 40), s('st2', 40), s('te', 60),  // exams 100%
    ];
    const core = compute(DO015_CORE, assessments, scores);
    const mapeh = compute(DO015_MAPEH, assessments, scores);

    // PT is weak and MAPEH weights it more heavily, so MAPEH must be lower
    expect(mapeh.initialGrade!).toBeLessThan(core.initialGrade!);
    expect(core.initialGrade).toBeCloseTo(75, 2);   // 20 + 25 + 30
    expect(mapeh.initialGrade).toBeCloseTo(70, 2);  // 20 + 30 + 20
  });
});

describe('compute — the V0 zero-vs-excluded defect', () => {
  const assessments = [
    a('w1', 'WW', 20), a('p1', 'PT', 50),
    a('st1', 'ST1', 40), a('st2', 'ST2', 40), a('te', 'TE', 60),
  ];
  // Mid-term: written work and performance tasks done, no exams yet.
  const scores = [s('w1', 18), s('p1', 45)];

  it('RUNNING mode excludes unscored components and redistributes weight', () => {
    const r = compute(DO015_CORE, assessments, scores);   // default running

    expect(r.isProvisional).toBe(true);
    const ww = r.components.find((c) => c.code === 'WW')!;
    const te = r.components.find((c) => c.code === 'TE')!;

    expect(te.included).toBe(false);
    expect(te.weightedScore).toBeNull();
    // WW 20 and PT 50 renormalised to sum 100 -> 28.57 and 71.43
    expect(ww.appliedWeight).toBeCloseTo(28.571, 2);
    // WW 90%, PT 90%  ->  90 overall, not dragged down by ungiven exams
    expect(r.initialGrade).toBeCloseTo(90, 1);
  });

  it('FINAL mode counts unscored assessments as zero', () => {
    const r = compute(DO015_CORE, assessments, scores, { includeUnscored: true });

    expect(r.isProvisional).toBe(false);
    // now the missing exams pull the grade right down
    expect(r.initialGrade!).toBeLessThan(70);
    const te = r.components.find((c) => c.code === 'TE')!;
    expect(te.included).toBe(true);
    expect(te.percentageScore).toBe(0);
  });

  it('the two modes differ sharply — which is the point', () => {
    const running = compute(DO015_CORE, assessments, scores);
    const final = compute(DO015_CORE, assessments, scores, { includeUnscored: true });
    expect(running.initialGrade! - final.initialGrade!).toBeGreaterThan(20);
  });
});

describe('compute — excused assessments', () => {
  const assessments = [a('w1', 'WW', 20, 1), a('w2', 'WW', 20, 2), a('p1', 'PT', 50)];

  it('an excused assessment never counts, even in final mode', () => {
    const scores = [s('w1', 18), s('w2', null, true), s('p1', 40)];
    const r = compute(DO015_CORE, assessments, scores, { includeUnscored: true });
    const ww = r.components.find((c) => c.code === 'WW')!;

    expect(ww.totalPossible).toBe(20);            // only w1 counted
    expect(ww.percentageScore).toBeCloseTo(90, 6);
  });

  it('an excused assessment differs from an unscored one', () => {
    const excused = compute(DO015_CORE, assessments,
      [s('w1', 18), s('w2', null, true), s('p1', 40)], { includeUnscored: true });
    const missing = compute(DO015_CORE, assessments,
      [s('w1', 18), s('w2', null, false), s('p1', 40)], { includeUnscored: true });

    const ex = excused.components.find((c) => c.code === 'WW')!;
    const ms = missing.components.find((c) => c.code === 'WW')!;
    expect(ex.percentageScore).toBeCloseTo(90, 6);
    expect(ms.percentageScore).toBeCloseTo(45, 6);   // 18/40
  });
});

describe('compute — edge cases', () => {
  it('returns nulls rather than zero when nothing is scored', () => {
    const r = compute(DO015_CORE, [a('w1', 'WW', 20)], []);
    expect(r.initialGrade).toBeNull();
    expect(r.periodGrade).toBeNull();
    expect(r.passed).toBeNull();
  });

  it('handles a class with no assessments defined', () => {
    const r = compute(DO015_CORE, [], []);
    expect(r.initialGrade).toBeNull();
  });

  it('a perfect score transmutes to 100', () => {
    const assessments = [a('w1', 'WW', 20), a('p1', 'PT', 50),
      a('st1', 'ST1', 40), a('st2', 'ST2', 40), a('te', 'TE', 60)];
    const scores = [s('w1', 20), s('p1', 50), s('st1', 40), s('st2', 40), s('te', 60)];
    expect(compute(DO015_CORE, assessments, scores).periodGrade).toBe(100);
  });

  it('a zero across the board lands on the floor of the table', () => {
    const assessments = [a('w1', 'WW', 20), a('p1', 'PT', 50),
      a('st1', 'ST1', 40), a('st2', 'ST2', 40), a('te', 'TE', 60)];
    const scores = [s('w1', 0), s('p1', 0), s('st1', 0), s('st2', 0), s('te', 0)];
    const r = compute(DO015_CORE, assessments, scores);
    expect(r.periodGrade).toBe(60);
    expect(r.passed).toBe(false);
    expect(r.descriptor).toBe('Did Not Meet Expectations');
  });
});

describe('computeFinal', () => {
  it('averages the periods that exist and ignores the rest', () => {
    const r = computeFinal([88, 91, null], DO015_CORE);
    expect(r.finalGrade).toBe(90);      // mean of 88 and 91 = 89.5 -> 90
    expect(r.passed).toBe(true);
  });

  it('works for a three-term school and a four-quarter school alike', () => {
    expect(computeFinal([85, 87, 89], DO015_CORE).finalGrade).toBe(87);
    expect(computeFinal([85, 87, 89, 91], DO015_CORE).finalGrade).toBe(88);
  });

  it('supports weighted period aggregation', () => {
    const r = computeFinal([80, 90], DO015_CORE, [1, 3]);
    expect(r.finalGrade).toBe(88);      // (80 + 270) / 4
  });

  it('returns null when no period has been graded', () => {
    expect(computeFinal([null, null], DO015_CORE).finalGrade).toBeNull();
  });
});
