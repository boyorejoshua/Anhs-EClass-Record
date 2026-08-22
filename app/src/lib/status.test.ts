import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS, canRecall, canTransition, custodian, displayStatus,
  isEditable, missingCount, pct,
} from './status';
import { TRANSITIONS as FIXTURE_TRANSITIONS } from '../data/fixtures';
import type { ClassSummary, SubmissionStatus } from '../data/types';

function cls(status: SubmissionStatus, scored: number, total: number): ClassSummary {
  return {
    id: 'c1', gradeLevel: 'Grade 10', section: 'Pearl', subject: 'Mathematics 10',
    subjectCode: 'MATH10', studentCount: 20, scheduleNote: null, room: null,
    status: { p1: status },
    receipts: {},
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
      // 0022: the chain of custody. 'submitted -> draft' is the recall,
      // legal from here and nowhere else.
      submitted:          ['draft', 'received', 'returned'],
      received:           ['forwarded', 'returned'],
      forwarded:          ['received', 'registrar_received', 'returned'],
      registrar_received: ['approved', 'returned'],
      approved:  ['finalized', 'returned'],
      finalized: ['published', 'reopened'],
      published: ['reopened'],
    };
    for (const [from, tos] of Object.entries(fromMigration)) {
      expect([...TRANSITIONS[from as SubmissionStatus]].sort()).toEqual([...tos].sort());
    }
  });

  it('keeps the fixture source on the same rules as the UI', () => {
    // The fixtures used to keep their OWN copy of this table, and it was
    // silently wrong the moment 0022 added three states. They now
    // re-export this one, so the assertion is that the re-export is
    // still the same object rather than a fresh divergence.
    expect(FIXTURE_TRANSITIONS).toBe(TRANSITIONS);
  });

  it('lets the teacher recall only while nobody has signed for it', () => {
    // The whole point of the receipt. Recall is legal from 'submitted'
    // and from no other state — once the adviser has the record, the
    // route back is a return, which carries a reason and is visible to
    // both parties.
    expect(canRecall('submitted')).toBe(true);
    expect(canTransition('submitted', 'draft')).toBe(true);
    for (const st of ['received', 'forwarded', 'registrar_received',
                      'approved', 'finalized', 'published'] as SubmissionStatus[]) {
      expect(canRecall(st), `${st} must not be recallable`).toBe(false);
      expect(canTransition(st, 'draft'), `${st} -> draft must be illegal`).toBe(false);
    }
  });

  it('keeps the chain strict — no desk can be skipped', () => {
    expect(canTransition('submitted', 'approved')).toBe(false);            // skips the adviser
    expect(canTransition('submitted', 'registrar_received')).toBe(false);
    expect(canTransition('received', 'registrar_received')).toBe(false);   // adviser must forward
    expect(canTransition('received', 'approved')).toBe(false);
    expect(canTransition('forwarded', 'approved')).toBe(false);            // registrar must sign
  });

  it('lets each holder hand the record back one step', () => {
    expect(canTransition('forwarded', 'received')).toBe(true);   // adviser withdraws
    // ...and every holder can return it to the teacher outright.
    for (const st of ['submitted', 'received', 'forwarded',
                      'registrar_received'] as SubmissionStatus[]) {
      expect(canTransition(st, 'returned'), `${st} must be returnable`).toBe(true);
    }
  });

  it('names who is holding the record', () => {
    expect(custodian('submitted')).toMatch(/waiting for the class adviser/i);
    expect(custodian('received')).toMatch(/with the class adviser/i);
    expect(custodian('forwarded')).toMatch(/not yet received/i);
    expect(custodian('registrar_received')).toMatch(/with the registrar/i);
    // Not a custody state — nobody is "holding" a draft or a published record.
    expect(custodian('draft')).toBeNull();
    expect(custodian('published')).toBeNull();
  });

  it('locks the gradebook the moment somebody signs for the record', () => {
    for (const st of ['submitted', 'received', 'forwarded',
                      'registrar_received'] as SubmissionStatus[]) {
      expect(isEditable(st), `${st} must not be editable`).toBe(false);
    }
    expect(isEditable('returned')).toBe(true);
    expect(isEditable('reopened')).toBe(true);
  });

  it('refuses the transitions that would skip the workflow', () => {
    expect(canTransition('draft', 'published')).toBe(false);   // skips review entirely
    expect(canTransition('draft', 'approved')).toBe(false);
    expect(canTransition('submitted', 'published')).toBe(false);
    expect(canTransition('submitted', 'finalized')).toBe(false);
    expect(canTransition('published', 'submitted')).toBe(false);
  });

  it('allows the intended path end to end', () => {
    // Every desk in order. Migration 0022 put the class adviser between
    // the teacher and the registrar, so submitted -> approved is no
    // longer one hop and must not become one again.
    const path: SubmissionStatus[] = [
      'draft', 'submitted', 'received', 'forwarded',
      'registrar_received', 'approved', 'finalized', 'published',
    ];
    for (let i = 1; i < path.length; i += 1) {
      expect(canTransition(path[i - 1]!, path[i]!),
        `${path[i - 1]} -> ${path[i]} must be legal`).toBe(true);
    }
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
