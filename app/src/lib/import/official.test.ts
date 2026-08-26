import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseThreeTermWorkbook } from './three-term';
import { OFFICIAL_DESCRIPTORS, OFFICIAL_TRANSMUTATION } from '../grading/official-three-term';

/**
 * The OFFICIAL DepEd Electronic Class Record.
 *
 * The fixture is DERIVED from the published file by
 * `scripts/make-official-fixture.mjs` — filled, then trimmed — so the
 * merged ranges, header cells and row offsets under test are the real
 * ones rather than a reconstruction. Everything the parser has to get
 * right here is something the anticipated workbook does differently.
 */
const FIXTURE = fileURLToPath(
  new URL('./__fixtures__/deped-official-sample.xlsx', import.meta.url));
const parsed = parseThreeTermWorkbook(readFileSync(FIXTURE), 'official.xlsx');

describe('the official DepEd workbook', () => {
  it('is recognised as the official layout', () => {
    expect(parsed.layout).toBe('deped-official');
    expect(parsed.sheetNames).toEqual(
      ['INPUT DATA', 'TERM 1', 'TERM 2', 'TERM 3', 'FINAL GRADES', 'HELPER']);
  });

  it('reads the vertical label:value block, skipping the colon column', () => {
    expect(parsed.identity).toMatchObject({
      region: 'IV-A CALABARZON',
      division: 'Rizal',
      govtSchoolId: '301417',
      schoolName: 'Angono National High School',
      schoolYear: '2026-2027',
      schoolHead: 'Dr. Ramos',
      teacherName: 'Santos, Maria',
      subjectText: 'EPP',
    });
  });

  it('takes grade level and section as SEPARATE fields, with nothing to split', () => {
    expect(parsed.identity.gradeLevelText).toBe('Grade 7');
    expect(parsed.identity.sectionText).toBe('Masipag');
    expect(parsed.identity.gradeAndSection).toBeNull();
  });

  it('does not read SUBJECT TEACHER as the SUBJECT', () => {
    // Both labels exist on this sheet and one contains the other.
    expect(parsed.identity.subjectText).toBe('EPP');
  });

  it('reads the two side-by-side name columns as two blocks', () => {
    expect(parsed.roster.map((r) => [r.raw, r.sex])).toEqual([
      ['Cruz, Andres', 'male'],
      ['Reyes, Bayani', 'male'],
      ['Santos, Carlo', 'male'],
      ['Aquino, Divina', 'female'],
      ['Bautista, Elena', 'female'],
    ]);
  });

  it('maps each learner to their TERM-SHEET row, which is not their name row', () => {
    // Names on INPUT DATA 11-13 (male) and 11-12 (female); marks on
    // term rows 18-20 and 69-70. Getting this wrong silently puts a
    // learner's marks on somebody else.
    expect(parsed.roster.map((r) => [r.nameRow, r.row])).toEqual([
      [11, 18], [12, 19], [13, 20],
      [11, 69], [12, 70],
    ]);
  });

  it('finds the band row from the merges, and the score rows below them', () => {
    const [term1] = parsed.terms;
    expect(term1?.components.map((c) => [c.key, c.weight, c.items.length])).toEqual([
      ['WW', 0.2, 5],
      ['PT', 0.6, 3],
      ['EX', 0.2, 3],
    ]);
  });

  it('EXCLUDES the exams band’s six trailing summary columns', () => {
    // W/X/Y are WS ST1 / WS ST2 / WS TE and DO carry a score out of
    // (30/30/40 — the DO 015 exam weights), so they cannot be excluded
    // by looking for a blank. Z and AA are PS and WS. Counting back
    // three, as the anticipated workbook allows, would create three
    // assessments that do not exist.
    const ex = parsed.terms[0]?.components.find((c) => c.key === 'EX');
    expect(ex?.items.map((i) => i.code)).toEqual(['ST1', 'ST2', 'TE']);
    expect(ex?.items.map((i) => i.highestPossibleScore)).toEqual([15, 15, 15]);
    expect(ex?.items.every((i) => i.childComponentCode !== null)).toBe(true);
  });

  it('reads the EPP/TLE weights the official file states', () => {
    // 20 / 60 / 20 for EPP-TLE and MAPEH, per DO 015 s.2026.
    expect(parsed.terms[0]?.components.map((c) => c.weight)).toEqual([0.2, 0.6, 0.2]);
  });

  it('reads marks against the right learner', () => {
    const t1 = parsed.terms[0]!;
    const of = (row: number, key: string, code: string) =>
      t1.marks.find((m) => m.row === row && m.componentKey === key && m.itemCode === code)?.score;
    expect(of(18, 'WW', '1')).toBe(1);
    expect(of(19, 'WW', '1')).toBe(2);
    expect(of(20, 'WW', '1')).toBe(3);
    expect(of(69, 'EX', 'TE')).toBe(15);
  });

  it('keeps a blank exam score null, not zero', () => {
    const te = parsed.terms[0]?.marks.find(
      (m) => m.row === 18 && m.componentKey === 'EX' && m.itemCode === 'TE');
    expect(te?.score).toBeNull();
  });

  it('reads no marks from any summary column', () => {
    const summary = ['K', 'L', 'M', 'Q', 'R', 'S', 'W', 'X', 'Y', 'Z', 'AA']
      .map((c) => c.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1);
    for (const term of parsed.terms) {
      for (const component of term.components) {
        for (const item of component.items) {
          expect(summary).not.toContain(item.column);
        }
      }
    }
  });

  it('ignores FINAL GRADES and HELPER entirely', () => {
    expect(parsed.terms.map((t) => t.sheetName)).toEqual(['TERM 1', 'TERM 2', 'TERM 3']);
  });

  it('parses without a single blocking issue', () => {
    expect(parsed.issues.filter((i) => i.severity === 'error')).toEqual([]);
  });
});

/* ==================================================================== *
 * THE GRADING DATA THE FILE CARRIES
 *
 * The workbook's HELPER sheet holds the transmutation table and the
 * descriptor bands, and migration 0027 seeds them into every school on
 * the three-term calendar. Forty-one bands were transcribed by hand,
 * which is forty-one chances to mistype a number that decides whether a
 * learner passes.
 *
 * So the constant is checked against the file it came from. If DepEd
 * revises the table, replacing the fixture makes this fail — which is
 * the notice we want.
 * ==================================================================== */

describe('the official grading data', () => {
  const helper = XLSX.read(readFileSync(FIXTURE), { type: 'buffer' }).Sheets.HELPER!;
  const at = (a: string) => (helper[a] as { v?: unknown } | undefined)?.v;

  it('transcribes all 41 transmutation bands exactly', () => {
    const fromFile = [];
    for (let r = 8; r <= 48; r += 1) {
      fromFile.push([at(`B${r}`), at(`C${r}`), at(`D${r}`)]);
    }
    expect(fromFile).toHaveLength(41);
    expect(OFFICIAL_TRANSMUTATION.map((b) => [b.minInitial, b.maxInitial, b.outputGrade]))
      .toEqual(fromFile);
  });

  it('puts the pass line at an initial grade of 70, not 60', () => {
    const band = (ig: number) =>
      OFFICIAL_TRANSMUTATION.find((b) => ig >= b.minInitial && ig <= b.maxInitial)?.outputGrade;
    expect(band(69.99)).toBe(74);
    expect(band(70)).toBe(75);
  });

  it('leaves no gap between bands at two decimal places', () => {
    // Every initial grade the workbook can produce is ROUND(x, 2), so
    // the table has to be continuous at that resolution. A gap would
    // return no grade at all for the value that fell in it.
    for (let cents = 0; cents <= 10000; cents += 1) {
      const ig = cents / 100;
      const hit = OFFICIAL_TRANSMUTATION.some(
        (b) => ig >= b.minInitial && ig <= b.maxInitial);
      expect(hit, `initial grade ${ig} falls between bands`).toBe(true);
    }
  });

  it('transcribes the five descriptors and their official wording', () => {
    const labels = OFFICIAL_DESCRIPTORS.map((d) => d.label);
    expect(labels).toEqual(
      ['Advancing', 'Benchmarking', 'Connecting', 'Developing', 'Emerging']);
    expect(OFFICIAL_DESCRIPTORS.map((d) => [d.minGrade, d.maxGrade])).toEqual([
      [90, 100], [80, 89], [75, 79], [65, 74], [60, 64],
    ]);
    // The wording is the department's, verbatim from HELPER!H.
    expect(OFFICIAL_DESCRIPTORS[0]?.generalDescription).toBe(at('H8'));
    expect(OFFICIAL_DESCRIPTORS[4]?.generalDescription).toBe(at('H44'));
  });
});
