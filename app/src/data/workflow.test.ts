import { beforeEach, describe, expect, it } from 'vitest';
import { createFixtureSource } from './fixtures';
import type { DataSource } from './source';

/**
 * Submission validation and the student visibility rules.
 *
 * Run against the fixture source, which deliberately enforces the same
 * rules as the database. The point is not that fixtures work — it is
 * that the UI is developed against the real constraints, so a screen
 * cannot be built on a permission the server will refuse.
 */

let source: DataSource;
beforeEach(() => { source = createFixtureSource(); });

describe('submission validation', () => {
  it('blocks a period that has no assessments', () => {
    // An empty period is an ERROR, not a warning: there is nothing to
    // grade, so a "submission" would assert completeness of nothing.
    return source.validateSubmission('c-math10-pearl', 'no-such-period').then((r) => {
      expect(r.ok).toBe(false);
      expect(r.errors.map((e) => e.code)).toContain('no_assessments');
    });
  });

  it('warns rather than blocks when scores are merely missing', async () => {
    // Schools genuinely submit with gaps — a learner who never sat a
    // quiz. Blocking would push teachers to invent a zero, which is a
    // mark the learner did not earn.
    const r = await source.validateSubmission('c-math10-pearl', 'p2');
    expect(r.ok).toBe(true);
    expect(r.warnings.map((w) => w.code)).toContain('missing_scores');
    expect(r.warnings[0]!.message).toMatch(/\d+ score/);
  });

  it('reports a fully-marked period as clean', async () => {
    const r = await source.validateSubmission('c-math10-diamond', 'p2');
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
    expect(r.warnings).toHaveLength(0);
  });
});

describe('submitting', () => {
  it('refuses to submit a period with blocking errors', async () => {
    await expect(source.submitGrades('c-math10-pearl', 'no-such-period', true))
      .rejects.toThrow(/no assessments/i);
  });

  it('refuses to submit with gaps unless the warnings are acknowledged', async () => {
    // The acknowledgement is a real argument the server checks, not a
    // client-side courtesy — submit_grades takes p_acknowledge_warnings.
    await expect(source.submitGrades('c-math10-pearl', 'p2', false))
      .rejects.toThrow(/warning/i);
  });

  it('submits with gaps once acknowledged', async () => {
    await source.submitGrades('c-math10-pearl', 'p2', true);
    const classes = await source.getClasses('year-anhs');
    expect(classes.find((c) => c.id === 'c-math10-pearl')!.status.p2).toBe('submitted');
  });

  it('refuses to submit a period that is already submitted', async () => {
    // draft → submitted is legal; submitted → submitted is not. Without
    // this, a double-click would re-open a closed workflow step.
    await expect(source.submitGrades('c-math10-diamond', 'p2', true))
      .rejects.toThrow(/illegal transition/i);
  });
});

describe('the registrar queue', () => {
  it('excludes classes that were never submitted', async () => {
    const q = await source.getSubmissionQueue('year-anhs');
    // p3 is draft everywhere in the fixture and must not appear.
    expect(q.some((r) => r.periodId === 'p3')).toBe(false);
  });

  it('carries the reason on a returned submission', async () => {
    const q = await source.getSubmissionQueue('year-anhs');
    const returned = q.find((r) => r.status === 'returned');
    expect(returned).toBeDefined();
    expect(returned!.returnReason).toBeTruthy();
  });

  it('shows the registrar nothing until the adviser has forwarded it', async () => {
    // The strict chain, from the registrar's side. A submitted or
    // received record belongs to the teacher and the adviser; the
    // registrar's queue must not invite them to act on it.
    const q = await source.getSubmissionQueue('year-anhs');
    for (const st of ['draft', 'submitted', 'received']) {
      expect(q.some((r) => r.status === st), `${st} must not reach the registrar`).toBe(false);
    }
  });

  /** Walk a class from draft to the registrar's desk, the way people do. */
  async function handToRegistrar(classId: string, periodId: string) {
    await source.submitGrades(classId, periodId, true);
    const id = `sub-${classId}-${periodId}`;
    await source.receiveSubmission(id);
    await source.forwardSubmission(id);
    await source.registrarReceiveSubmission(id);
    return id;
  }

  it('refuses to return a submission without a reason', async () => {
    // The database rejects it too. A teacher cannot act on "returned"
    // with nothing to act on.
    const id = await handToRegistrar('c-math10-pearl', 'p2');
    await expect(source.returnSubmission(id, '   '))
      .rejects.toThrow(/reason is required/i);
  });

  it('walks approve → finalize → publish in order', async () => {
    const id = await handToRegistrar('c-math10-pearl', 'p2');

    await source.approveSubmission(id);
    await source.finalizeSubmission(id);
    await source.publishSubmission(id);

    const after = await source.getSubmissionQueue('year-anhs');
    expect(after.find((r) => r.submissionId === id)!.status).toBe('published');
  });

  it('refuses to publish something that was never finalized', async () => {
    const id = await handToRegistrar('c-math10-pearl', 'p2');
    await expect(source.publishSubmission(id)).rejects.toThrow(/illegal transition/i);
  });

  it('refuses to approve a record the registrar has not signed for', async () => {
    await source.submitGrades('c-math10-pearl', 'p2', true);
    const id = 'sub-c-math10-pearl-p2';
    await source.receiveSubmission(id);
    await source.forwardSubmission(id);
    // Forwarded, but not yet received. Approving now would skip the
    // signature that makes the hand-off a hand-off.
    await expect(source.approveSubmission(id)).rejects.toThrow(/illegal transition/i);
  });
});

describe('student visibility', () => {
  it('shows a grade only for a published period', async () => {
    // The fixture mirrors what the RLS policies do: an unpublished
    // period arrives as null rather than being filtered after arrival.
    const grades = await source.getMyGrades();
    expect(grades.length).toBeGreaterThan(0);

    for (const row of grades) {
      const published = row.periods.filter((p) => p.grade != null);
      const withheld = row.periods.filter((p) => p.grade == null);
      expect(published.length + withheld.length).toBe(row.periods.length);
    }

    // p1 is published in the fixture; p2 and p3 are not.
    const first = grades[0]!;
    expect(first.periods.find((p) => p.shortName === 'T1')!.grade).not.toBeNull();
    expect(first.periods.find((p) => p.shortName === 'T3')!.grade).toBeNull();
  });

  it('takes no student id on any portal call', () => {
    // The signature IS the security property. A student id parameter
    // would be an IDOR the frontend could not defend against, so the
    // server resolves the learner from the verified JWT instead.
    expect(source.getMyProfile.length).toBe(0);
    expect(source.getMyHistory.length).toBe(0);
    // getMyGrades takes an optional YEAR id — never a student id.
    expect(source.getMyGrades.length).toBeLessThanOrEqual(1);
  });

  it('returns the learner their own enrolment history', async () => {
    const history = await source.getMyHistory();
    expect(history.length).toBeGreaterThan(0);
    // Includes a year spent at another school — that is part of the
    // permanent record, not a separate student.
    expect(history.some((h) => h.schoolName !== 'Angono National High School')).toBe(true);
  });
});

describe('attendance', () => {
  it('marks a weekend as not a class day', async () => {
    // 2026-06-13 is a Saturday. Recording attendance on a non-class day
    // would corrupt the expected-days denominator SF2 and SF4 divide by.
    const day = await source.getAttendance('c-math10-pearl', '2026-06-13');
    expect(day.isClassDay).toBe(false);
    expect(day.dayType).toBe('non_teaching');
  });

  it('returns a roster and the school-configured statuses on a class day', async () => {
    const day = await source.getAttendance('c-math10-pearl', '2026-06-10');
    expect(day.isClassDay).toBe(true);
    expect(day.roster.length).toBeGreaterThan(0);
    // Statuses are per-school rows, not hard-coded letters.
    expect(day.statuses.map((s) => s.code)).toEqual(['P', 'A', 'L', 'E']);
    expect(day.statuses.every((s) => ['present', 'absent', 'neutral'].includes(s.countsAs))).toBe(true);
  });

  it('persists a mark and reads it back', async () => {
    const before = await source.getAttendance('c-math10-pearl', '2026-06-10');
    const first = before.roster[0]!;
    expect(first.statusId).toBeNull();

    await source.saveAttendance('c-math10-pearl', '2026-06-10',
      [{ enrollmentId: first.enrollmentId, statusId: 'as-a' }]);

    const after = await source.getAttendance('c-math10-pearl', '2026-06-10');
    expect(after.roster[0]!.statusId).toBe('as-a');
  });
});
