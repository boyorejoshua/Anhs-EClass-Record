import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseThreeTermWorkbook } from './three-term';
import type { ParsedWorkbook } from './three-term';
import {
  buildPlan, canCommit, defaultChoices, summarise,
} from './plan';
import type { Choices, ImportResolution } from './plan';

const FIXTURE = fileURLToPath(
  new URL('./__fixtures__/three-term-sample.xlsx', import.meta.url));

function parsed(): ParsedWorkbook {
  return parseThreeTermWorkbook(readFileSync(FIXTURE), 'EPP_G7_Masipag.xlsx');
}

const WW = 'c-ww';
const PT = 'c-pt';
const ST1 = 'c-st1';
const ST2 = 'c-st2';
const TE = 'c-te';

/**
 * A resolution shaped like the one the server returns for this fixture:
 * class matched, all components present, three editable terms, and a
 * roster where each situation appears once.
 */
function resolution(over: Partial<ImportResolution> = {}): ImportResolution {
  return {
    class: {
      status: 'matched', classId: 'cls-1', academicYearId: 'yr-1',
      gradeLevelId: 'gl-7', sectionId: 'sec-1', subjectId: 'sub-epp',
      gradingSchemeId: 'sch-1', label: 'Grade 7 – Masipag · EPP',
      teacher: { userId: 'u-1', displayName: 'Dela Cruz, Maria' },
    },
    periods: [
      { ordinal: 1, periodId: 'p1', name: 'Term 1', editable: true },
      { ordinal: 2, periodId: 'p2', name: 'Term 2', editable: true },
      { ordinal: 3, periodId: 'p3', name: 'Term 3', editable: true },
    ],
    components: [
      { key: 'WW', itemCode: null, componentId: WW, weight: 20, status: 'matched' },
      { key: 'PT', itemCode: null, componentId: PT, weight: 60, status: 'matched' },
      { key: 'EX', itemCode: 'ST1', componentId: ST1, weight: 30, status: 'matched' },
      { key: 'EX', itemCode: 'ST2', componentId: ST2, weight: 30, status: 'matched' },
      { key: 'EX', itemCode: 'TE', componentId: TE, weight: 40, status: 'matched' },
    ],
    learners: [
      { row: 12, raw: 'Cruz, Andres', sex: 'male', status: 'matched',
        candidates: [{ studentId: 's1', enrollmentId: 'e1', displayName: 'Cruz, Andres', lrn: null, studentNumber: null }] },
      // Row 13 is the row whose TERM1 exam score is blank in the
      // fixture, and it is deliberately a MATCH here so that the blank
      // travels all the way into the payload and can be asserted on.
      { row: 13, raw: 'Reyes, Bayani', sex: 'male', status: 'matched',
        candidates: [{ studentId: 's2', enrollmentId: 'e2', displayName: 'Reyes, Bayani', lrn: null, studentNumber: null }] },
      { row: 14, raw: 'Santos, Carlo', sex: 'male', status: 'ambiguous',
        candidates: [
          { studentId: 's3', enrollmentId: 'e3', displayName: 'Santos, Carlo', lrn: '1', studentNumber: null },
          { studentId: 's4', enrollmentId: 'e4', displayName: 'Santos, Carlo', lrn: '2', studentNumber: null }] },
      { row: 63, raw: 'Aquino, Divina', sex: 'female', status: 'new', candidates: [] },
      { row: 64, raw: 'Bautista, Elena', sex: 'female', status: 'new', candidates: [] },
    ],
    assessments: [],
    permissions: { runImport: true, createClass: true, createStudent: true, writeMarks: true },
    issues: [],
    ...over,
  };
}

function plan(res = resolution(), choices?: Choices) {
  const p = parsed();
  const c = choices ?? defaultChoices(res);
  return { parsed: p, res, choices: c, plan: buildPlan(p, res, c) };
}

describe('default choices', () => {
  it('links a single match, creates a new learner, and never guesses an ambiguous one', () => {
    expect(defaultChoices(resolution())).toEqual({
      12: { action: 'link', enrollmentId: 'e1' },
      13: { action: 'link', enrollmentId: 'e2' },
      14: { action: 'skip' },
      63: { action: 'create' },
      64: { action: 'create' },
    });
  });

  it('skips new learners when the account cannot create them', () => {
    const res = resolution();
    res.permissions.createStudent = false;
    expect(defaultChoices(res)[63]).toEqual({ action: 'skip' });
  });
});

describe('the plan', () => {
  it('carries every included learner and every term', () => {
    const { plan: p } = plan();
    expect(p.learners.map((l) => [l.row, l.action])).toEqual([
      [12, 'link'], [13, 'link'], [14, 'skip'], [63, 'create'], [64, 'create'],
    ]);
    expect(p.periods.map((x) => x.periodId)).toEqual(['p1', 'p2', 'p3']);
  });

  it('splits a created learner into last and first name, and carries their sex', () => {
    const { plan: p } = plan();
    expect(p.learners.find((l) => l.row === 63)?.student)
      .toEqual({ lastName: 'Aquino', firstName: 'Divina', sex: 'female' });
  });

  it('gives each child component ordinal 1 and numbers the rest in column order', () => {
    const term1 = plan().plan.periods[0];
    const byComponent = (id: string) =>
      term1?.assessments.filter((a) => a.componentId === id).map((a) => a.ordinal);
    expect(byComponent(WW)).toEqual([1, 2, 3, 4, 5]);
    expect(byComponent(PT)).toEqual([1, 2, 3]);
    expect(byComponent(ST1)).toEqual([1]);
    expect(byComponent(TE)).toEqual([1]);
  });

  it('keys marks by workbook row, because a learner being created has no id yet', () => {
    const term1 = plan().plan.periods[0];
    const created = term1?.marks.filter((m) => m.row === 63);
    expect(created?.length).toBe(11);
    expect(term1?.marks.every((m) => typeof m.row === 'number')).toBe(true);
  });

  it('drops a skipped learner’s marks with them, rather than shifting them onto someone else', () => {
    const { plan: p } = plan();
    for (const period of p.periods) {
      expect(period.marks.some((m) => m.row === 14)).toBe(false);
    }
    // 4 included learners x 11 items x 3 terms.
    expect(p.periods.reduce((n, x) => n + x.marks.length, 0)).toBe(132);
  });

  it('keeps a blank as null all the way into the payload', () => {
    const te = plan().plan.periods[0]?.marks.find(
      (m) => m.componentId === TE && m.row === 13);
    expect(te).toBeDefined();
    expect(te?.raw).toBeNull();
  });

  it('leaves out a period that is no longer editable, entirely', () => {
    const res = resolution();
    res.periods[0]!.editable = false;
    const { plan: p } = plan(res);
    expect(p.periods.map((x) => x.periodId)).toEqual(['p2', 'p3']);
    expect(p.periods.some((x) => x.periodId === 'p1')).toBe(false);
  });

  it('writes nothing for a component the scheme does not declare', () => {
    const res = resolution();
    res.components = res.components.map((c) =>
      (c.itemCode === 'TE' ? { ...c, componentId: null, status: 'missing' as const } : c));
    const term1 = plan(res).plan.periods[0];
    expect(term1?.assessments.some((a) => a.componentId === TE)).toBe(false);
    // …and no orphan marks are queued against it either.
    expect(term1?.marks.some((m) => m.componentId === TE)).toBe(false);
  });
});

describe('the summary', () => {
  it('counts what the plan will actually do', () => {
    const { parsed: pw, res, choices, plan: p } = plan();
    const s = summarise(pw, res, choices, p);
    expect(s.classLabel).toBe('Grade 7 – Masipag · EPP');
    expect(s.classAction).toBe('update an existing class');
    expect(s.learners).toEqual({ matched: 2, created: 2, ambiguous: 1, skipped: 0 });
    expect(s.marks.total).toBe(132);
    expect(s.marks.blank).toBe(1);
    expect(canCommit(s)).toBe(true);
  });

  it('says a matched learner was matched by NAME, every time', () => {
    const { parsed: pw, res, choices, plan: p } = plan();
    expect(summarise(pw, res, choices, p).warnings.join(' '))
      .toMatch(/2 learners were matched BY NAME/);
  });

  it('blocks when the account cannot create the class the workbook needs', () => {
    const res = resolution();
    res.class = { ...res.class, status: 'willCreate', classId: null };
    res.permissions.createClass = false;
    const { parsed: pw, choices, plan: p } = plan(res);
    const s = summarise(pw, res, choices, p);
    expect(s.classAction).toBe('create a class');
    expect(s.blockers.join(' ')).toMatch(/cannot create classes/);
    expect(canCommit(s)).toBe(false);
  });

  it('blocks on a parser error, quoting where in the workbook it is', () => {
    const { res, choices, plan: p } = plan();
    const pw = parsed();
    pw.issues.push({
      severity: 'error', code: 'non-numeric-score',
      message: 'Cruz, Andres has something that is not a number', where: 'TERM1!F12',
    });
    const s = summarise(pw, res, choices, p);
    expect(s.blockers[0]).toContain('TERM1!F12');
    expect(canCommit(s)).toBe(false);
  });

  it('names a period it is leaving out, and why', () => {
    const res = resolution();
    res.periods[2]!.editable = false;
    const { parsed: pw, choices, plan: p } = plan(res);
    const s = summarise(pw, res, choices, p);
    expect(s.periods.find((x) => x.name === 'Term 3'))
      .toEqual({ name: 'Term 3', included: false, reason: 'already submitted — take the record back first' });
  });

  it('refuses to commit a plan that would import nobody', () => {
    const res = resolution();
    const choices: Choices = Object.fromEntries(
      res.learners.map((l) => [l.row, { action: 'skip' as const }]));
    const { parsed: pw, plan: p } = plan(res, choices);
    expect(canCommit(summarise(pw, res, choices, p))).toBe(false);
  });
});
