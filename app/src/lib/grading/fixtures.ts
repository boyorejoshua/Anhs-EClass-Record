/**
 * Test fixtures.
 *
 * The transmutation table and descriptor bands are ported verbatim from
 * V0 (`TRANS` at main.js:1, LOA bands at main.js:634). V0's arithmetic
 * on its own terms is correct, so it gives us free regression fixtures
 * for the rebuild.
 */
import type { DescriptorBand, GradeComponent, GradingScheme, TransmutationBand } from './types';

/** V0 main.js:1 — the 41-row DepEd transitional table for SY 2026-2027. */
export const DEPED_TRANSMUTATION: TransmutationBand[] = [
  [0, 3.99, 60], [4, 7.99, 61], [8, 11.99, 62], [12, 15.99, 63], [16, 19.99, 64],
  [20, 23.99, 65], [24, 27.99, 66], [28, 31.99, 67], [32, 35.99, 68], [36, 39.99, 69],
  [40, 43.99, 70], [44, 47.99, 71], [48, 51.99, 72], [52, 55.99, 73], [56, 59.99, 74],
  [60, 61.59, 75], [61.6, 63.19, 76], [63.2, 64.79, 77], [64.8, 66.39, 78], [66.4, 67.99, 79],
  [68, 69.59, 80], [69.6, 71.19, 81], [71.2, 72.79, 82], [72.8, 74.39, 83], [74.4, 75.99, 84],
  [76, 77.59, 85], [77.6, 79.19, 86], [79.2, 80.79, 87], [80.8, 82.39, 88], [82.4, 83.99, 89],
  [84, 85.59, 90], [85.6, 87.19, 91], [87.2, 88.79, 92], [88.8, 90.39, 93], [90.4, 91.99, 94],
  [92, 93.59, 95], [93.6, 95.19, 96], [95.2, 96.79, 97], [96.8, 98.39, 98], [98.4, 99.99, 99],
  [100, 100, 100],
].map(([lo, hi, g]) => ({ minInitial: lo as number, maxInitial: hi as number, outputGrade: g as number }));

export const DEPED_DESCRIPTORS: DescriptorBand[] = [
  { minGrade: 90, maxGrade: 100, label: 'Outstanding', remark: 'Passed' },
  { minGrade: 85, maxGrade: 89.99, label: 'Very Satisfactory', remark: 'Passed' },
  { minGrade: 80, maxGrade: 84.99, label: 'Satisfactory', remark: 'Passed' },
  { minGrade: 75, maxGrade: 79.99, label: 'Fairly Satisfactory', remark: 'Passed' },
  { minGrade: 0, maxGrade: 74.99, label: 'Did Not Meet Expectations', remark: 'Failed' },
];

const flat = (code: string, name: string, weight: number, ordinal: number): GradeComponent => ({
  id: code, code, name, weight, parentId: null, ordinal,
});

/** What V0 actually implements: main.js:289, `{ww:.30, pt:.50, te:.20}`. */
export const V0_SCHEME: GradingScheme = {
  id: 'v0',
  name: 'V0 legacy (WW 30 / PT 50 / TE 20)',
  components: [flat('WW', 'Written Works', 30, 1), flat('PT', 'Performance Tasks', 50, 2), flat('TE', 'Term Exam', 20, 3)],
  passMark: 75,
  roundingMode: 'half_up',
  decimalPlaces: 0,
  transmutation: DEPED_TRANSMUTATION,
  descriptors: DEPED_DESCRIPTORS,
};

/**
 * DepEd Order 015 s.2026 — core subjects, Grades 4-10.
 * WW 20 / PT 50 / EX 30, with Examinations splitting 30/30/40.
 * This is the structure V0 cannot represent at all.
 */
export const DO015_CORE: GradingScheme = {
  id: 'do015-core',
  name: 'DO 015 s.2026 — Core (G4-10)',
  components: [
    flat('WW', 'Written Works', 20, 1),
    flat('PT', 'Performance Tasks', 50, 2),
    flat('EX', 'Examinations', 30, 3),
    { id: 'ST1', code: 'ST1', name: 'Summative Test 1', weight: 30, parentId: 'EX', ordinal: 1 },
    { id: 'ST2', code: 'ST2', name: 'Summative Test 2', weight: 30, parentId: 'EX', ordinal: 2 },
    { id: 'TE',  code: 'TE',  name: 'Term Examination', weight: 40, parentId: 'EX', ordinal: 3 },
  ],
  passMark: 75,
  roundingMode: 'half_up',
  decimalPlaces: 0,
  transmutation: DEPED_TRANSMUTATION,
  descriptors: DEPED_DESCRIPTORS,
};

/** DO 015 s.2026 — MAPEH and EPP-TLE: same tree, 20 / 60 / 20. */
export const DO015_MAPEH: GradingScheme = {
  ...DO015_CORE,
  id: 'do015-mapeh',
  name: 'DO 015 s.2026 — MAPEH & EPP-TLE (G4-10)',
  components: DO015_CORE.components.map((c) =>
    c.parentId === null
      ? { ...c, weight: c.code === 'WW' ? 20 : c.code === 'PT' ? 60 : 20 }
      : c,
  ),
};

/**
 * SY 2027-2028: zero-based grading. Identical weights; the ONLY change
 * is that the transmutation table is gone. In V0 this is a release; here
 * it is one nulled configuration field.
 */
export const ZERO_BASED_CORE: GradingScheme = {
  ...DO015_CORE,
  id: 'zero-based',
  name: 'Zero-based — Core (SY 2027-2028)',
  transmutation: null,
};
