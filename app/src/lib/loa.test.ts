import { describe, expect, it } from 'vitest';
import { DESCRIPTORS, PROFICIENCY, bandOf, loaReport, scaleFor } from './loa';
import type { CohortSection } from './loa';
import type { GradebookData } from '../data/types';
import type { Assessment, GradingScheme } from './grading';

/**
 * Checked against CLASSRECORD_Template.xlsx, sheet "LOA Summary Reports".
 * Where a test cites a cell, that formula is the specification and this
 * test is the transcription of it.
 */

const SCHEME: GradingScheme = {
  id: 'do015', name: 'DO 015 core',
  components: [
    { id: 'ww', code: 'WW', name: 'Written Works',     weight: 20, parentId: null, ordinal: 1 },
    { id: 'pt', code: 'PT', name: 'Performance Tasks', weight: 50, parentId: null, ordinal: 2 },
    { id: 'ex', code: 'EX', name: 'Examinations',      weight: 30, parentId: null, ordinal: 3 },
  ],
  passMark: 75, roundingMode: 'half_up', decimalPlaces: 2,
  transmutation: null,
  descriptors: [
    { minGrade: 90, maxGrade: 100, label: 'Outstanding', remark: 'Passed' },
    { minGrade: 0,  maxGrade: 89.99, label: 'Satisfactory', remark: 'Passed' },
  ],
};

const ITEMS: Assessment[] = [
  { id: 'w1', componentId: 'ww', ordinal: 1, title: 'WW1', highestPossibleScore: 100 },
  { id: 'p1', componentId: 'pt', ordinal: 1, title: 'PT1', highestPossibleScore: 100 },
  { id: 'e1', componentId: 'ex', ordinal: 1, title: 'Exam', highestPossibleScore: 100 },
];

/** A section whose learners each score the same mark in every component. */
function section(label: string, marks: number[]): CohortSection {
  const data: GradebookData = {
    classId: label, periodId: 'p1', scheme: SCHEME, assessments: ITEMS,
    roster: marks.map((_, i) => ({
      classEnrollmentId: `${label}-${i}`, studentId: `s${i}`, displayName: `L${i}`,
    })),
    scores: Object.fromEntries(marks.map((m, i) => [
      `${label}-${i}`,
      { w1: { raw: m, isExcused: false }, p1: { raw: m, isExcused: false }, e1: { raw: m, isExcused: false } },
    ])),
    status: 'draft', editable: true,
  };
  return { classId: label, label, data };
}

describe('band boundaries match the workbook COUNTIFS', () => {
  it('bands proficiency half-open, closed only at the top', () => {
    // H8: COUNTIF(<25%) · J8: >=25 & <50 · L8: >=50 & <75
    // N8: >=75 & <90    · P8: >=90 & <=100
    expect(bandOf(0, PROFICIENCY)?.key).toBe('np');
    expect(bandOf(24.99, PROFICIENCY)?.key).toBe('np');
    expect(bandOf(25, PROFICIENCY)?.key).toBe('lp');
    expect(bandOf(49.99, PROFICIENCY)?.key).toBe('lp');
    expect(bandOf(50, PROFICIENCY)?.key).toBe('nrp');
    expect(bandOf(74.99, PROFICIENCY)?.key).toBe('nrp');
    expect(bandOf(75, PROFICIENCY)?.key).toBe('p');
    expect(bandOf(89.99, PROFICIENCY)?.key).toBe('p');
    expect(bandOf(90, PROFICIENCY)?.key).toBe('hp');
    expect(bandOf(100, PROFICIENCY)?.key).toBe('hp');
  });

  it('bands descriptors on the seven workbook cut points', () => {
    // D47 <75 · F47 >=75<80 · H47 >=80<85 · J47 >=85<90
    // L47 >=90<95 · N47 >=95<98 · P47 >=98<=100
    const at = (v: number) => bandOf(v, DESCRIPTORS)?.range;
    expect(at(0)).toBe('74% & below');
    expect(at(74.99)).toBe('74% & below');
    expect(at(75)).toBe('75% – 79%');
    expect(at(79.99)).toBe('75% – 79%');
    expect(at(80)).toBe('80% – 84%');
    expect(at(85)).toBe('85% – 89%');
    expect(at(90)).toBe('90% – 94%');
    expect(at(95)).toBe('95% – 97%');
    expect(at(98)).toBe('98% – 100%');
    expect(at(100)).toBe('98% – 100%');
  });

  it('keeps Outstanding as one label across three ranges', () => {
    // The workbook merges L42:P42 into a single OUTSTANDING heading over
    // 90-94 / 95-97 / 98-100. Three bands, one name.
    const o = DESCRIPTORS.filter((b) => b.label === 'Outstanding');
    expect(o.map((b) => b.range)).toEqual(['90% – 94%', '95% – 97%', '98% – 100%']);
  });

  it('leaves no gap or overlap between bands', () => {
    for (const bands of [PROFICIENCY, DESCRIPTORS]) {
      for (let i = 1; i < bands.length; i += 1) {
        expect(bands[i]!.min).toBe(bands[i - 1]!.max);
      }
      expect(bands[0]!.min).toBe(0);
      expect(bands[bands.length - 1]!.max).toBe(100);
    }
  });
});

describe('which scale each section uses', () => {
  it('follows the workbook: WW and exams proficiency, PT descriptors', () => {
    expect(scaleFor('WW')).toBe('proficiency');
    expect(scaleFor('EX')).toBe('proficiency');
    expect(scaleFor('QA')).toBe('proficiency');
    expect(scaleFor('PT')).toBe('descriptor');
  });

  it('falls back to proficiency for a code the table does not name', () => {
    // Not descriptor: the report-card wording only resolves above 75 and
    // would flatten an unknown component's whole lower half into one band.
    expect(scaleFor('RECITATION')).toBe('proficiency');
  });
});

describe('the report', () => {
  const cohort = [
    section('Grade 10 – Pearl',   [95, 88, 76, 60, 40]),
    section('Grade 10 – Diamond', [100, 92, 30]),
  ];
  const report = loaReport(cohort, 'Term 2');

  it('produces one table per component plus the grade table', () => {
    expect(report.tables.map((t) => t.key)).toEqual(['WW', 'PT', 'EX', 'grade']);
  });

  it('titles them as the workbook does', () => {
    expect(report.tables[0]!.title).toBe('SUMMARY OF WRITTEN WORKS PER SECTION');
    expect(report.tables[1]!.title).toContain('(from Percentage Score)');
    expect(report.tables[3]!.title).toBe('SUMMARY OF TERM 2 GRADES  (from Transmuted Grade)');
  });

  it('gives one row per SECTION, not per learner', () => {
    // This is the whole point of the report. Eight learners, two rows.
    expect(report.learners).toBe(8);
    for (const t of report.tables) {
      expect(t.rows.map((r) => r.label)).toEqual(['Grade 10 – Pearl', 'Grade 10 – Diamond']);
    }
  });

  it('computes HSO, LSO, Mean and MPS on the proficiency tables', () => {
    const ww = report.tables[0]!.rows[0]!;   // Pearl: 95 88 76 60 40 out of 100
    expect(ww.hso).toBe(95);
    expect(ww.lso).toBe(40);
    expect(ww.mean).toBe(71.8);
    expect(ww.highestPossible).toBe(100);
    expect(ww.mps).toBe(71.8);
  });

  it('omits the score statistics on a descriptor table', () => {
    // The workbook's PT and Quarterly Grade tables have no No. of Items,
    // HSO, LSO, Mean or MPS columns — only the descriptor counts.
    const pt = report.tables[1]!.rows[0]!;
    expect(pt.highestPossible).toBeNull();
    expect(pt.hso).toBeNull();
    expect(pt.mps).toBeNull();
    expect(pt.counts.reduce((n, c) => n + c.count, 0)).toBe(5);
  });

  it('bands each section independently', () => {
    const ww = report.tables[0]!;
    const pearl = Object.fromEntries(ww.rows[0]!.counts.map((c) => [c.band.key, c.count]));
    // 95 → hp, 88 → p, 76 → p, 60 → nrp, 40 → lp
    expect(pearl).toEqual({ hp: 1, p: 2, nrp: 1, lp: 1, np: 0 });
    const diamond = Object.fromEntries(ww.rows[1]!.counts.map((c) => [c.band.key, c.count]));
    // 100 → hp, 92 → hp, 30 → lp
    expect(diamond).toEqual({ hp: 2, p: 0, nrp: 0, lp: 1, np: 0 });
  });

  it('totals the band counts across sections', () => {
    const totals = report.tables[0]!.totals;
    expect(totals.learners).toBe(8);
    expect(Object.fromEntries(totals.counts.map((c) => [c.band.key, c.count])))
      .toEqual({ hp: 3, p: 2, nrp: 1, lp: 2, np: 0 });
  });

  it('weights the total mean by section size, not by section', () => {
    // Pearl mean 71.8 over 5, Diamond 74 over 3 → 72.625, NOT 72.9.
    expect(report.tables[0]!.totals.mean).toBe(72.63);
  });

  it('reports the TOTAL check column as 100 when every learner is banded', () => {
    // The workbook's "(to check entries)". Anything else means a learner
    // fell through a boundary, which is exactly what it is there to catch.
    for (const t of report.tables) {
      for (const r of t.rows) expect(r.total).toBe(100);
    }
  });

  it('flags a section where some learners have no score at all', () => {
    const half = section('Grade 10 – Jade', [80, 90]);
    // Wipe one learner's marks entirely.
    half.data.scores['Grade 10 – Jade-1'] = {};
    const r = loaReport([half], 'Term 2').tables[0]!.rows[0]!;
    expect(r.learners).toBe(2);
    expect(r.counts.reduce((n, c) => n + c.count, 0)).toBe(1);
    expect(r.total).toBe(50);   // ← the check column earns its place
  });

  it('survives an empty cohort', () => {
    expect(loaReport([], 'Term 2')).toEqual({ tables: [], sections: 0, learners: 0 });
  });

  it('handles a section with no learners without dividing by zero', () => {
    const empty = loaReport([section('Grade 10 – Empty', [])], 'Term 2');
    const row = empty.tables[0]!.rows[0]!;
    expect(row.learners).toBe(0);
    expect(row.mean).toBeNull();
    expect(row.total).toBe(0);
    expect(row.counts.every((c) => c.percent === 0)).toBe(true);
  });
});
