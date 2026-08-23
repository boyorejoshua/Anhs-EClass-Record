import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  assessmentCount, hasBlockingIssues, markCount, parseThreeTermWorkbook,
  splitGradeAndSection, splitName, WorkbookShapeError,
} from './three-term';
import type { ParsedWorkbook } from './three-term';

const FIXTURE = fileURLToPath(new URL('./__fixtures__/three-term-sample.xlsx', import.meta.url));

function load(): ParsedWorkbook {
  return parseThreeTermWorkbook(readFileSync(FIXTURE), 'three-term-sample.xlsx');
}

/**
 * A copy of the fixture with one edit, so a test can ask what the parser
 * does with a workbook that is wrong in exactly one way. Building the
 * variant from the real file rather than from scratch keeps every other
 * part of the shape honest.
 */
function variant(edit: (book: XLSX.WorkBook) => void): Uint8Array {
  const book = XLSX.read(readFileSync(FIXTURE), { type: 'buffer' });
  edit(book);
  return new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

function put(sheet: XLSX.WorkSheet, addr: string, value: string | number) {
  sheet[addr] = { t: typeof value === 'number' ? 'n' : 's', v: value };
}

describe('name and section splitting', () => {
  it('splits Last, First and keeps the original', () => {
    expect(splitName('Alvarez,  Neitan ')).toEqual({
      raw: 'Alvarez, Neitan', lastName: 'Alvarez', firstName: 'Neitan',
    });
  });

  it('treats a name with no comma as one whole name rather than guessing', () => {
    expect(splitName('Madonna')).toEqual({
      raw: 'Madonna', lastName: 'Madonna', firstName: '',
    });
  });

  it('splits a grade and section on the dash', () => {
    expect(splitGradeAndSection('Grade 7 - Masipag'))
      .toEqual({ gradeLevel: 'Grade 7', section: 'Masipag' });
  });

  it('leaves the section null when there is nothing to split, rather than inventing one', () => {
    expect(splitGradeAndSection('Grade 7')).toEqual({ gradeLevel: 'Grade 7', section: null });
    expect(splitGradeAndSection(null)).toEqual({ gradeLevel: null, section: null });
  });
});

describe('class identity', () => {
  it('reads the header block from the INPUT sheet', () => {
    expect(load().identity).toEqual({
      region: 'IV-A CALABARZON',
      division: 'Rizal',
      schoolName: 'Angono National High School',
      govtSchoolId: '301417',
      schoolYear: '2026-2027',
      gradeAndSection: 'Grade 7 - Masipag',
      gradeLevelText: 'Grade 7',
      sectionText: 'Masipag',
      teacherName: 'Dela Cruz, Maria',
      subjectText: 'EPP',
    });
  });

  it('finds values by their label, not by a fixed column', () => {
    // Move SCHOOL ID and its value two columns right, as widening a
    // column would. The value must still be found.
    const bytes = variant((book) => {
      const s = book.Sheets.INPUT as XLSX.WorkSheet;
      delete s.Q5; delete s.S5;
      put(s, 'R5', 'SCHOOL ID');
      put(s, 'T5', '999999');
    });
    expect(parseThreeTermWorkbook(bytes).identity.govtSchoolId).toBe('999999');
  });

  it('warns rather than silently blanking when a label is missing', () => {
    const bytes = variant((book) => { delete (book.Sheets.INPUT as XLSX.WorkSheet).Q5; });
    const parsed = parseThreeTermWorkbook(bytes);
    expect(parsed.identity.govtSchoolId).toBeNull();
    expect(parsed.issues.some(
      (i) => i.code === 'missing-label' && i.message.includes('SCHOOL ID'))).toBe(true);
  });
});

describe('the roster', () => {
  it('reads both blocks and takes sex from the block, not from a column', () => {
    const roster = load().roster;
    expect(roster.map((r) => [r.row, r.raw, r.sex])).toEqual([
      [12, 'Cruz, Andres', 'male'],
      [13, 'Reyes, Bayani', 'male'],
      [14, 'Santos, Carlo', 'male'],
      [63, 'Aquino, Divina', 'female'],
      [64, 'Bautista, Elena', 'female'],
    ]);
  });

  it('keeps the sheet row, because it is what joins INPUT to the term sheets', () => {
    const parsed = load();
    const rows = new Set(parsed.roster.map((r) => r.row));
    for (const term of parsed.terms) {
      for (const mark of term.marks) expect(rows.has(mark.row)).toBe(true);
    }
  });

  it('refuses a workbook with no MALE/FEMALE blocks instead of guessing', () => {
    const bytes = variant((book) => {
      const s = book.Sheets.INPUT as XLSX.WorkSheet;
      delete s.B11; delete s.B62;
    });
    expect(() => parseThreeTermWorkbook(bytes)).toThrow(WorkbookShapeError);
  });

  it('flags two identical names, which the workbook cannot tell apart', () => {
    const bytes = variant((book) => {
      put(book.Sheets.INPUT as XLSX.WorkSheet, 'B14', 'Cruz, Andres');
    });
    const parsed = parseThreeTermWorkbook(bytes);
    const issue = parsed.issues.find((i) => i.code === 'duplicate-name');
    expect(issue?.severity).toBe('error');
    expect(issue?.message).toContain('12 and 14');
    expect(hasBlockingIssues(parsed)).toBe(true);
  });
});

describe('components and assessments', () => {
  it('reads the three bands from the merged headings, with their weights', () => {
    const [term1] = load().terms;
    expect(term1?.components.map((c) => [c.key, c.weight, c.items.length])).toEqual([
      ['WW', 0.2, 5],
      ['PT', 0.6, 3],
      ['EX', 0.2, 3],
    ]);
  });

  it('excludes the Total / PS / WS tail from the items', () => {
    const ww = load().terms[0]?.components[0];
    expect(ww?.items.map((i) => i.code)).toEqual(['1', '2', '3', '4', '5']);
    // The band spans F..M; only F..J are items.
    expect(ww?.lastColumn).toBe(XLSX.utils.decode_col('M'));
    expect(ww?.items.at(-1)?.column).toBe(XLSX.utils.decode_col('J'));
  });

  it('reads each item its own highest possible score', () => {
    expect(load().terms[0]?.components[0]?.items.map((i) => i.highestPossibleScore))
      .toEqual([10, 15, 15, 10, 15]);
  });

  it('marks ST1/ST2/TE as child components and numbered items as plain items', () => {
    const [ww, , ex] = load().terms[0]?.components ?? [];
    expect(ex?.items.map((i) => i.childComponentCode)).toEqual(['ST1', 'ST2', 'TE']);
    expect(ww?.items.every((i) => i.childComponentCode === null)).toBe(true);
  });

  it('follows the columns when a band grows an item, rather than assuming five', () => {
    // Widen Written Works by one: a sixth item in K, with the tail
    // pushed to L/M/N and the merge extended to N.
    const bytes = variant((book) => {
      const s = book.Sheets.TERM1 as XLSX.WorkSheet;
      put(s, 'K9', 6); put(s, 'K10', 20);
      put(s, 'L9', 'Total'); put(s, 'M9', 'PS'); put(s, 'N9', 'WS');
      put(s, 'N10', 0.2);
      delete s.L10;
      const merges = s['!merges'] as XLSX.Range[];
      const band = merges.find((m) => m.s.c === XLSX.utils.decode_col('F'));
      if (band) band.e.c = XLSX.utils.decode_col('N');
      put(s, 'K12', 18);
    });
    const parsed = parseThreeTermWorkbook(bytes);
    const ww = parsed.terms[0]?.components[0];
    expect(ww?.items.map((i) => i.code)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(ww?.weight).toBe(0.2);
    expect(parsed.terms[0]?.marks.find(
      (m) => m.row === 12 && m.componentKey === 'WW' && m.itemCode === '6')?.score).toBe(18);
  });

  it('does not create an assessment for a column with no highest possible score', () => {
    const bytes = variant((book) => {
      delete (book.Sheets.TERM1 as XLSX.WorkSheet).J10;
    });
    const parsed = parseThreeTermWorkbook(bytes);
    expect(parsed.terms[0]?.components[0]?.items.map((i) => i.code))
      .toEqual(['1', '2', '3', '4']);
    // …and no marks are read from that column either.
    expect(parsed.terms[0]?.marks.some(
      (m) => m.componentKey === 'WW' && m.itemCode === '5')).toBe(false);
  });

  it('refuses a band it does not recognise instead of mapping it to a guess', () => {
    const bytes = variant((book) => {
      put(book.Sheets.TERM1 as XLSX.WorkSheet, 'F8', 'PARTICIPATION (20%)');
    });
    const parsed = parseThreeTermWorkbook(bytes);
    expect(parsed.issues.some((i) => i.code === 'unknown-component')).toBe(true);
    expect(hasBlockingIssues(parsed)).toBe(true);
    expect(parsed.terms[0]?.components.map((c) => c.key)).toEqual(['PT', 'EX']);
  });

  it('throws when a term sheet has no merged component headings at all', () => {
    const bytes = variant((book) => { delete (book.Sheets.TERM1 as XLSX.WorkSheet)['!merges']; });
    expect(() => parseThreeTermWorkbook(bytes)).toThrow(/no merged component headings/);
  });
});

describe('marks', () => {
  it('reads a mark for every learner and every item across all three terms', () => {
    const parsed = load();
    expect(parsed.terms).toHaveLength(3);
    // 5 learners × 11 items × 3 terms.
    expect(parsed.terms.reduce((n, t) => n + t.marks.length, 0)).toBe(165);
    expect(assessmentCount(parsed)).toBe(33);
  });

  it('reads a blank score as null, never as zero', () => {
    const parsed = load();
    const te = parsed.terms[0]?.marks.find(
      (m) => m.row === 13 && m.componentKey === 'EX' && m.itemCode === 'TE');
    expect(te?.score).toBeNull();
    // The distinction is load-bearing: a zero would fail this learner.
    expect(te?.score).not.toBe(0);
    expect(markCount(parsed)).toBe(164);
  });

  it('keeps a real zero as a zero', () => {
    const bytes = variant((book) => { put(book.Sheets.TERM1 as XLSX.WorkSheet, 'F12', 0); });
    const parsed = parseThreeTermWorkbook(bytes);
    expect(parsed.terms[0]?.marks.find(
      (m) => m.row === 12 && m.componentKey === 'WW' && m.itemCode === '1')?.score).toBe(0);
    expect(markCount(parsed)).toBe(164);
  });

  it('raises text in a score cell rather than dropping the mark', () => {
    const bytes = variant((book) => { put(book.Sheets.TERM1 as XLSX.WorkSheet, 'F12', 'absent'); });
    const parsed = parseThreeTermWorkbook(bytes);
    const issue = parsed.issues.find((i) => i.code === 'non-numeric-score');
    expect(issue?.severity).toBe('error');
    expect(issue?.where).toBe('TERM1!F12');
  });

  it('warns about a score above the highest possible score', () => {
    const bytes = variant((book) => { put(book.Sheets.TERM1 as XLSX.WorkSheet, 'F12', 99); });
    const parsed = parseThreeTermWorkbook(bytes);
    const issue = parsed.issues.find((i) => i.code === 'score-out-of-range');
    expect(issue?.severity).toBe('warning');
    expect(issue?.message).toContain('0–10');
    // A warning, not an error: the mark is still read and shown.
    expect(hasBlockingIssues(parsed)).toBe(false);
  });
});

describe('what is deliberately not imported', () => {
  it('reads no marks from the Total, PS or WS columns', () => {
    const parsed = load();
    const summaryColumns = ['K', 'L', 'M', 'Q', 'R', 'S', 'W', 'X', 'Y']
      .map((c) => XLSX.utils.decode_col(c));
    for (const term of parsed.terms) {
      for (const component of term.components) {
        for (const item of component.items) {
          expect(summaryColumns).not.toContain(item.column);
        }
      }
    }
  });

  it('carries the workbook grades only as a comparison, one row per learner', () => {
    const parsed = load();
    // The fixture leaves them empty, which is exactly what a workbook
    // whose formulas have never been calculated looks like.
    expect(parsed.terms[0]?.derived.map((d) => d.row)).toEqual([12, 13, 14, 63, 64]);
    expect(parsed.terms[0]?.derived.every((d) => d.termGrade === null)).toBe(true);
  });

  it('reads the workbook TERM GRADE when it is there, without importing it', () => {
    const bytes = variant((book) => { put(book.Sheets.TERM1 as XLSX.WorkSheet, 'AA12', 88); });
    const parsed = parseThreeTermWorkbook(bytes);
    expect(parsed.terms[0]?.derived.find((d) => d.row === 12)?.termGrade).toBe(88);
    // It is not a mark, so nothing can persist it by accident.
    expect(parsed.terms[0]?.marks.some((m) => m.score === 88)).toBe(false);
  });

  it('ignores the SUMMARY OF GRADES sheet entirely', () => {
    const parsed = load();
    expect(parsed.sheetNames).toContain('SUMMARY OF GRADES');
    expect(parsed.terms.map((t) => t.sheetName)).toEqual(['TERM1', 'TERM2', 'TERM3']);
  });
});

describe('workbooks this is not', () => {
  it('refuses a file that is not a spreadsheet', () => {
    expect(() => parseThreeTermWorkbook(new TextEncoder().encode('hello')))
      .toThrow(WorkbookShapeError);
  });

  it('refuses a workbook with no INPUT sheet, naming what it did find', () => {
    const bytes = variant((book) => {
      book.SheetNames = book.SheetNames.filter((n) => n !== 'INPUT');
      delete book.Sheets.INPUT;
    });
    expect(() => parseThreeTermWorkbook(bytes)).toThrow(/no INPUT sheet/);
  });

  it('refuses a workbook with no term sheets', () => {
    const bytes = variant((book) => {
      for (const n of ['TERM1', 'TERM2', 'TERM3']) delete book.Sheets[n];
      book.SheetNames = book.SheetNames.filter((n) => !n.startsWith('TERM'));
    });
    expect(() => parseThreeTermWorkbook(bytes)).toThrow(/no TERM sheets/);
  });

  it('accepts a year in progress, saying which terms are missing', () => {
    const bytes = variant((book) => {
      delete book.Sheets.TERM3;
      book.SheetNames = book.SheetNames.filter((n) => n !== 'TERM3');
    });
    const parsed = parseThreeTermWorkbook(bytes);
    expect(parsed.terms.map((t) => t.ordinal)).toEqual([1, 2]);
    const issue = parsed.issues.find((i) => i.code === 'partial-terms');
    expect(issue?.severity).toBe('warning');
    expect(hasBlockingIssues(parsed)).toBe(false);
  });
});
