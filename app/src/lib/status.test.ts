import { describe, expect, it } from 'vitest';
import { TRANSITIONS, canTransition, displayStatus, isEditable, missingCount, pct } from './status';
import { TRANSITIONS as FIXTURE_TRANSITIONS } from '../data/fixtures';
import type { ClassSummary, SubmissionStatus } from '../data/types';

function cls(status: SubmissionStatus, scored: number, total: number): ClassSummary {
  return {
    id: 'c1', gradeLevel: 'Grade 10', section: 'Pearl', subject: 'Mathematics 10',
    subjectCode: 'MATH10', studentCount: 20, scheduleNote: null, room: null,
    status: { p1: status },
    completeness: { p1: { scored, total } },
  };
}

describe('completeness', () => {
  it('reports zero rather than NaN when a period has no assessments', () => {
    // total = 0 is the empty-period case; a naive scored/total renders
    // "NaN%" in the UI, which is how this kind of bug reaches a school.
    expect(pct({ scored: 0, total: 0 })).toBe(0);
    expect(pct(undefined)).toBe(0);
  });

  it('rounds to whole percent', () => {
    expect(pct({ scored: 1, total: 3 })).toBe(33);
    expect(pct({ scored: 2, total: 3 })).toBe(67);
    expect(pct({ scored: 200, total: 200 })).toBe(100);
  });

  it('never reports a negative number of missing scores', () => {
    // scored > total is not supposed to happen, but a stale cached
    // summary can produce it, and "-3 missing" is worse than "0".
    expect(missingCount({ scored: 210, total: 200 })).toBe(0);
    expect(missingCount({ scored: 142, total: 200 })).toBe(58);
    expect(missingCount(undefined)).toBe(0);
  });
});

describe('displayStatus', () => {
  it('promotes an untouched draft to draft', () => {
    expect(displayStatus(cls('draft', 0, 200), 'p1')).toBe('draft');
  });

  it('promotes a partly-marked draft to in_progress', () => {
    // in_progress is NOT a database status — migration 0007's CHECK does
    // not include it. It is derived here so a teacher can tell an
    // untouched class from a half-finished one.
    expect(displayStatus(cls('draft', 142, 200), 'p1')).toBe('in_progress');
  });

  it('never overrides a status the workflow set', () => {
    // A returned submission with partial scores is still RETURNED —
    // that is the thing the teacher has to act on.
    for (const s of ['submitted', 'returned', 'approved', 'finalized', 'published', 'reopened'] as const) {
      expect(displayStatus(cls(s, 5, 200), 'p1')).toBe(s);
    }
  });

  it('defaults to draft for a period with no submission row', () => {
    expect(displayStatus(cls('draft', 0, 0), 'nonexistent-period')).toBe('draft');
  });
});

describe('editability', () => {
  it('allows editing exactly when the database does', () => {
    // Mirrors app.submission_is_editable (migration 0007).
    expect(isEditable('draft')).toBe(true);
    expect(isEditable('in_progress')).toBe(true);
    expect(isEditable('returned')).toBe(true);
    expect(isEditable('reopened')).toBe(true);

    expect(isEditable('submitted')).toBe(false);
    expect(isEditable('approved')).toBe(false);
    expect(isEditable('finalized')).toBe(false);
    expect(isEditable('published')).toBe(false);
  });
});

describe('the state machine', () => {
  it('matches app.assert_transition from migration 0010', () => {
    // Transcribed from the migration. If the database rules change and
    // this is not updated, the UI starts offering buttons the server
    // refuses — which reads to a registrar as the app being broken.
    const fromMigration: Record<string, string[]> = {
      draft:     ['submitted'],
      returned:  ['submitted'],
      reopened:  ['submitted'],
      submitted: ['returned', 'approved'],
      approved:  ['finalized', 'returned'],
      finalized: ['published', 'reopened'],
      published: ['reopened'],
    };
    for (const [from, tos] of Object.entries(fromMigration)) {
      expect([...TRANSITIONS[from as SubmissionStatus]].sort()).toEqual([...tos].sort());
    }
  });

  it('keeps the fixture source on the same rules as the UI', () => {
    // The fixtures run their own copy so offline development exercises
    // the real constraints. Drift between them would mean the UI is
    // developed against rules the server does not have.
    for (const [from, tos] of Object.entries(FIXTURE_TRANSITIONS)) {
      expect([...TRANSITIONS[from as SubmissionStatus]].sort()).toEqual([...tos].sort());
    }
  });

  it('refuses the transitions that would skip the workflow', () => {
    expect(canTransition('draft', 'published')).toBe(false);   // skips review entirely
    expect(canTransition('draft', 'approved')).toBe(false);
    expect(canTransition('submitted', 'published')).toBe(false);
    expect(canTransition('submitted', 'finalized')).toBe(false);
    expect(canTransition('published', 'submitted')).toBe(false);
  });

  it('allows the intended path end to end', () => {
    expect(canTransition('draft', 'submitted')).toBe(true);
    expect(canTransition('submitted', 'approved')).toBe(true);
    expect(canTransition('approved', 'finalized')).toBe(true);
    expect(canTransition('finalized', 'published')).toBe(true);
  });

  it('allows correction routes back to the teacher', () => {
    expect(canTransition('submitted', 'returned')).toBe(true);
    expect(canTransition('approved', 'returned')).toBe(true);
    expect(canTransition('returned', 'submitted')).toBe(true);
    expect(canTransition('published', 'reopened')).toBe(true);
    expect(canTransition('reopened', 'submitted')).toBe(true);
  });

  it('derives in_progress to the same transitions as draft', () => {
    expect([...TRANSITIONS.in_progress]).toEqual([...TRANSITIONS.draft]);
  });
});
