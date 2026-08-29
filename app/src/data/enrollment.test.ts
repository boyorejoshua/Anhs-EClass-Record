/**
 * The enrolment lifecycle, against the fixture source.
 *
 * These assert the RULES, not the demo data: every expectation here has
 * a matching guard in migration 0041, and the fixture implements the
 * same refusals so a demo teaches the real behaviour rather than a
 * friendlier one. The database's own version is verified separately
 * against a real Postgres — this is the layer the screens talk to.
 */
import { describe, expect, it } from 'vitest';
import { createFixtureSource } from './fixtures';

const YEAR = 'year-anhs';

/** A fresh source per test: the fixture store is module-level and mutable. */
const fresh = () => createFixtureSource();

async function admitInto(
  src: ReturnType<typeof createFixtureSource>,
  names: { firstName: string; lastName: string; lrn?: string },
  sectionId: string | null,
) {
  const result = await src.admitStudent(
    { ...names },
    sectionId
      ? { academicYearId: YEAR, gradeLevelId: 'gl-10', sectionId }
      : { academicYearId: YEAR, gradeLevelId: 'gl-10' },
    true,
  );
  if (result.status !== 'created') throw new Error('expected a created learner');
  return result;
}

describe('admitting a learner', () => {
  it('creates the person and the enrolment as separate records', async () => {
    const src = fresh();
    const r = await admitInto(src, { firstName: 'Juan', lastName: 'Dela Cruz' }, 'sec-pearl');
    expect(r.studentId).toBeTruthy();
    expect(r.enrollmentId).toBeTruthy();

    const record = await src.getStudentRecord(r.studentId);
    expect(record?.student.displayName).toBe('Dela Cruz, Juan');
    expect(record?.history).toHaveLength(1);
  });

  it('creates a person with NO enrolment when no year is named', async () => {
    const src = fresh();
    const r = await src.admitStudent(
      { firstName: 'Ana', lastName: 'Reyes' }, null, true);
    expect(r.status).toBe('created');
    if (r.status !== 'created') return;
    expect(r.enrollmentId).toBeNull();

    // The person exists and is findable; they simply have no place yet.
    const record = await src.getStudentRecord(r.studentId);
    expect(record?.student.displayName).toBe('Reyes, Ana');
    expect(record?.history).toHaveLength(0);
  });

  it('REFUSES a duplicate LRN — an identifier is a certainty', async () => {
    const src = fresh();
    await admitInto(src, { firstName: 'Juan', lastName: 'Dela Cruz', lrn: '123456789012' }, 'sec-pearl');
    await expect(src.admitStudent(
      { firstName: 'Different', lastName: 'Person', lrn: '123456789012' },
      { academicYearId: YEAR, gradeLevelId: 'gl-10' }, true,
    )).rejects.toThrow(/already exists/i);
  });

  it('WARNS about a namesake and does not refuse it', async () => {
    const src = fresh();
    await admitInto(src, { firstName: 'Juan', lastName: 'Dela Cruz' }, 'sec-pearl');

    const warned = await src.admitStudent(
      { firstName: 'juan', lastName: 'DELA CRUZ' },
      { academicYearId: YEAR, gradeLevelId: 'gl-10' });
    expect(warned.status).toBe('needs_confirmation');
    if (warned.status !== 'needs_confirmation') return;
    expect(warned.reason).toBe('namesake');
    expect(warned.matches[0]?.displayName).toBe('Dela Cruz, Juan');

    // Confirmed, the second person is created. Real namesakes exist and
    // refusing them would leave a registrar stuck.
    const made = await src.admitStudent(
      { firstName: 'Juan', lastName: 'Dela Cruz' },
      { academicYearId: YEAR, gradeLevelId: 'gl-10' }, true);
    expect(made.status).toBe('created');
  });

  it('does not warn when the birth dates differ', async () => {
    const src = fresh();
    await src.admitStudent(
      { firstName: 'Maria', lastName: 'Santos', birthDate: '2010-01-01' },
      { academicYearId: YEAR, gradeLevelId: 'gl-10' }, true);
    const r = await src.admitStudent(
      { firstName: 'Maria', lastName: 'Santos', birthDate: '2011-06-15' },
      { academicYearId: YEAR, gradeLevelId: 'gl-10' });
    expect(r.status).toBe('created');
  });
});

describe('enrolment', () => {
  it('refuses a second enrolment in the same school year', async () => {
    const src = fresh();
    const r = await admitInto(src, { firstName: 'Juan', lastName: 'Cruz' }, 'sec-pearl');
    await expect(src.enrolStudent(r.studentId, {
      academicYearId: YEAR, gradeLevelId: 'gl-10',
    })).rejects.toThrow(/already enrolled/i);
  });

  it('records the enrolment itself as an event', async () => {
    const src = fresh();
    const r = await admitInto(src, { firstName: 'Juan', lastName: 'Cruz' }, 'sec-pearl');
    const events = await src.getEnrollmentHistory(r.studentId);
    expect(events.map((e) => e.eventType)).toEqual(
      expect.arrayContaining(['enrolled', 'section_change']));

    // A first section is an ASSIGNMENT, not a move: `from` is null so a
    // reader is not told the learner came from somewhere.
    const assigned = events.find((e) => e.eventType === 'section_change');
    expect(assigned?.from).toBeNull();
    expect(assigned?.to).toBe('Pearl');
  });
});

describe('section transfer', () => {
  it('moves the learner and records where they came from', async () => {
    const src = fresh();
    const r = await admitInto(src, { firstName: 'Juan', lastName: 'Cruz' }, 'sec-pearl');
    const moved = await src.transferSection(
      r.enrollmentId!, 'sec-diamond', '2026-10-01', 'Parent request');
    expect(moved.from).toBe('Pearl');
    expect(moved.to).toBe('Diamond');

    const record = await src.getStudentRecord(r.studentId);
    expect(record?.history[0]?.section).toBe('Diamond');

    const events = await src.getEnrollmentHistory(r.studentId);
    const move = events.find((e) => e.from === 'Pearl' && e.to === 'Diamond');
    expect(move?.notes).toBe('Parent request');
    expect(move?.eventDate).toBe('2026-10-01');
    expect(move?.recordedBy).toBeTruthy();
  });

  it('refuses a section at a different grade level', async () => {
    const src = fresh();
    const r = await admitInto(src, { firstName: 'Juan', lastName: 'Cruz' }, 'sec-pearl');
    // sec-ruby is Grade 9; the learner is Grade 10. A section IS a grade
    // level and a name, so this is not a transfer.
    await expect(src.transferSection(r.enrollmentId!, 'sec-ruby'))
      .rejects.toThrow(/not available for this learner/i);
  });

  it('refuses a move to the section they are already in', async () => {
    const src = fresh();
    const r = await admitInto(src, { firstName: 'Juan', lastName: 'Cruz' }, 'sec-pearl');
    await expect(src.transferSection(r.enrollmentId!, 'sec-pearl'))
      .rejects.toThrow(/already in Pearl/i);
  });
});

describe('withdrawal and return', () => {
  it('requires a reason', async () => {
    const src = fresh();
    const r = await admitInto(src, { firstName: 'Juan', lastName: 'Cruz' }, 'sec-pearl');
    await expect(src.withdrawStudent(r.enrollmentId!, 'dropped', null, '   '))
      .rejects.toThrow(/reason is required/i);
  });

  it('closes the enrolment and records the destination', async () => {
    const src = fresh();
    const r = await admitInto(src, { firstName: 'Juan', lastName: 'Cruz' }, 'sec-pearl');
    const out = await src.withdrawStudent(
      r.enrollmentId!, 'transferred_out', '2026-11-04', 'Family moved', 'Taytay NHS');
    expect(out.status).toBe('transferred_out');

    const events = await src.getEnrollmentHistory(r.studentId);
    expect(events[0]?.eventType).toBe('transfer_out');
    expect(events[0]?.notes).toContain('Taytay NHS');
  });

  it('refuses to close an enrolment twice', async () => {
    const src = fresh();
    const r = await admitInto(src, { firstName: 'Juan', lastName: 'Cruz' }, 'sec-pearl');
    await src.withdrawStudent(r.enrollmentId!, 'dropped', null, 'Left');
    await expect(src.withdrawStudent(r.enrollmentId!, 'dropped', null, 'Again'))
      .rejects.toThrow(/already closed/i);
  });

  it('re-opens a closed enrolment rather than making a second one', async () => {
    const src = fresh();
    const r = await admitInto(src, { firstName: 'Juan', lastName: 'Cruz' }, 'sec-pearl');
    await src.withdrawStudent(r.enrollmentId!, 'dropped', null, 'Left in October');
    await src.reenrolStudent(r.enrollmentId!, '2027-01-05', 'Returned in January');

    const record = await src.getStudentRecord(r.studentId);
    // ONE enrolment for the year, not two. The learner is the same
    // person and the year is the same year.
    expect(record?.history).toHaveLength(1);
    expect(record?.history[0]?.status).toBe('enrolled');

    const events = await src.getEnrollmentHistory(r.studentId);
    expect(events[0]?.eventType).toBe('re_entry');
  });

  it('refuses to re-enrol somebody who never left', async () => {
    const src = fresh();
    const r = await admitInto(src, { firstName: 'Juan', lastName: 'Cruz' }, 'sec-pearl');
    await expect(src.reenrolStudent(r.enrollmentId!))
      .rejects.toThrow(/not closed/i);
  });

  it('keeps the whole story in order, newest first', async () => {
    const src = fresh();
    const r = await admitInto(src, { firstName: 'Juan', lastName: 'Cruz' }, 'sec-pearl');
    await src.transferSection(r.enrollmentId!, 'sec-diamond', '2026-10-01', 'Moved');
    await src.withdrawStudent(r.enrollmentId!, 'dropped', '2026-11-01', 'Left');
    await src.reenrolStudent(r.enrollmentId!, '2027-01-05', 'Back');

    const events = await src.getEnrollmentHistory(r.studentId);
    expect(events).toHaveLength(5);
    expect(events[0]?.eventType).toBe('re_entry');
    expect(events.at(-1)?.eventType).toBe('enrolled');
  });
});

describe('portal accounts', () => {
  it('lists a section and marks who already has one', async () => {
    const src = fresh();
    const list = await src.getPortalCandidates('sec-pearl');
    expect(list.section?.name).toBe('Pearl');
    expect(list.learners.length).toBeGreaterThan(0);
    expect(list.learners.every((x) => typeof x.hasAccount === 'boolean')).toBe(true);
  });

  it('creates an account and links it to the learner', async () => {
    const src = fresh();
    const r = await admitInto(src, { firstName: 'Ana', lastName: 'Portalis' }, 'sec-pearl');
    await src.createStudentPortalAccount(r.studentId, 'ana@example.test', 'temporary1');

    const list = await src.getPortalCandidates('sec-pearl');
    const row = list.learners.find((x) => x.studentId === r.studentId);
    expect(row?.hasAccount).toBe(true);
    expect(row?.email).toBe('ana@example.test');
  });

  it('refuses a SECOND account for the same learner', async () => {
    const src = fresh();
    const r = await admitInto(src, { firstName: 'Ana', lastName: 'Portalis' }, 'sec-pearl');
    await src.createStudentPortalAccount(r.studentId, 'ana@example.test', 'temporary1');
    // A second account would sign in and resolve to nobody, because the
    // learner's portal_user_id points at the first one.
    await expect(src.createStudentPortalAccount(r.studentId, 'ana2@example.test', 'temporary1'))
      .rejects.toThrow(/already has a portal account/i);
  });

  it('refuses a password shorter than the auth provider accepts', async () => {
    const src = fresh();
    const r = await admitInto(src, { firstName: 'Ana', lastName: 'Portalis' }, 'sec-pearl');
    await expect(src.createStudentPortalAccount(r.studentId, 'ana@example.test', 'short'))
      .rejects.toThrow(/at least 8/i);
  });

  it('unlinking needs a reason and leaves the learner intact', async () => {
    const src = fresh();
    const r = await admitInto(src, { firstName: 'Ana', lastName: 'Portalis' }, 'sec-pearl');
    await src.createStudentPortalAccount(r.studentId, 'ana@example.test', 'temporary1');
    await expect(src.unlinkStudentPortalAccount(r.studentId, '')).rejects.toThrow(/reason/i);

    await src.unlinkStudentPortalAccount(r.studentId, 'Attached to the wrong learner');
    const record = await src.getStudentRecord(r.studentId);
    // The ACADEMIC RECORD is untouched — only the login stops resolving.
    expect(record?.student.displayName).toBe('Portalis, Ana');
    expect(record?.student.hasPortalAccount).toBe(false);
  });
});

describe('the student schedule', () => {
  it('is derived from the current enrolment, never chosen', async () => {
    const src = fresh();
    const s = await src.getMySchedule();
    expect(s.enrollment?.section).toBe('Pearl');
    expect(s.enrollment?.gradeLevel).toBe('Grade 10');
    // Every class on it belongs to that section. The learner picks
    // nothing: a student choosing classes would be choosing somebody's
    // timetable, and the only one they may see is their own.
    expect(s.classes.length).toBeGreaterThan(0);
  });

  it('shows the schedule note VERBATIM rather than parsing it', async () => {
    const src = fresh();
    const s = await src.getMySchedule();
    const math = s.classes.find((c) => c.subjectCode === 'MATH10');
    // 'MWF 8:00-9:00' as written. Turning that into a Monday 08:00 row
    // would invent structure the database does not hold — schedule_note
    // is free text with no validation.
    expect(math?.when).toBe('MWF 8:00-9:00');
  });

  it('handles a missing teacher without inventing one', async () => {
    const src = fresh();
    const s = await src.getMySchedule();
    const mapeh = s.classes.find((c) => c.subjectCode === 'MAPEH10');
    expect(mapeh).toBeDefined();
    expect(mapeh?.teacher).toBeNull();
  });

  it('handles a missing room without inventing one', async () => {
    const src = fresh();
    const s = await src.getMySchedule();
    const mapeh = s.classes.find((c) => c.subjectCode === 'MAPEH10');
    expect(mapeh?.room).toBeNull();
  });

  it('carries a class id for every row, so nothing is positional', async () => {
    const src = fresh();
    const s = await src.getMySchedule();
    const ids = s.classes.map((c) => c.classId);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is sorted by subject, so the list is stable between visits', async () => {
    const src = fresh();
    const s = await src.getMySchedule();
    const titles = s.classes.map((c) => c.subject);
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
  });
});
