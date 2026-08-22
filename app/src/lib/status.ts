/**
 * Submission status: what the database stores vs. what a person needs.
 *
 * The database has ten statuses (migration 0022's CHECK):
 *
 *   draft · submitted · received · forwarded · registrar_received ·
 *   returned · approved · finalized · published · reopened
 *
 * Three of them exist because a record now has a chain of custody:
 * somebody signs for it at each hand-off, the way they would on paper.
 *
 * `in_progress` is NOT one of them, though the TypeScript union and the
 * old fixtures both carried it. It cannot arrive from a query, so
 * treating it as a stored value meant writing branches that never ran
 * and, in the fixtures, emitting a status the real backend can never
 * produce — the exact drift a fixture layer exists to avoid.
 *
 * It is a real distinction, though: an untouched class and a
 * three-quarters-marked one are both `draft`, and a teacher scanning a
 * list cares about the difference far more than about the word "draft".
 *
 * So it lives here, derived, in one place — never stored, never sent.
 */
import type { ClassSummary, SubmissionStatus } from '../data/types';

export interface Completeness { scored: number; total: number }

/** Percentage of scores entered, 0 when a period has no assessments. */
export function pct(c: Completeness | undefined): number {
  if (!c || c.total === 0) return 0;
  return Math.round((c.scored / c.total) * 100);
}

export function missingCount(c: Completeness | undefined): number {
  if (!c) return 0;
  return Math.max(0, c.total - c.scored);
}

/**
 * The status to SHOW for a class in a period.
 *
 * Only ever promotes `draft` to `in_progress`. Every other status is
 * passed through untouched — a returned submission with partial scores
 * is still `returned`, because that is the thing the teacher must act
 * on.
 */
export function displayStatus(cls: ClassSummary, periodId: string): SubmissionStatus {
  const stored = cls.status[periodId] ?? 'draft';
  if (stored !== 'draft') return stored;
  const done = cls.completeness[periodId];
  return done && done.scored > 0 ? 'in_progress' : 'draft';
}

/** Whether the gradebook accepts edits, mirroring app.submission_is_editable. */
export function isEditable(status: SubmissionStatus): boolean {
  return status === 'draft' || status === 'in_progress'
    || status === 'returned' || status === 'reopened';
}

/**
 * The legal transitions, mirroring app.assert_transition (migration
 * 0010). The UI uses this only to decide which buttons to OFFER — the
 * database refuses an illegal transition regardless of what the client
 * sends, and that refusal is the actual control.
 */
export const TRANSITIONS: Record<SubmissionStatus, readonly SubmissionStatus[]> = {
  draft:       ['submitted'],
  in_progress: ['submitted'],   // derived alias of draft
  returned:    ['submitted'],
  reopened:    ['submitted'],
  // 'draft' here is the RECALL. It is legal from `submitted` and from
  // nowhere else, which is exactly the window in which nobody has taken
  // responsibility for the record.
  submitted:          ['draft', 'received', 'returned'],
  received:           ['forwarded', 'returned'],
  forwarded:          ['received', 'registrar_received', 'returned'],
  registrar_received: ['approved', 'returned'],
  approved:           ['finalized', 'returned'],
  finalized:          ['published', 'reopened'],
  published:          ['reopened'],
};

/**
 * Can the teacher still pull this back themselves?
 *
 * The single question the Submission tab has to answer, and the reason
 * the receipt is worth showing at all. Once the adviser has signed, the
 * answer is no and the route is a return request instead.
 */
export function canRecall(status: SubmissionStatus): boolean {
  return status === 'submitted';
}

/** Who is holding the record right now, in words a teacher would use. */
export function custodian(status: SubmissionStatus): string | null {
  switch (status) {
    case 'submitted':          return 'Waiting for the class adviser to receive it';
    case 'received':           return 'With the class adviser';
    case 'forwarded':          return 'Sent to the registrar, not yet received';
    case 'registrar_received': return 'With the registrar';
    default:                   return null;
  }
}

export function canTransition(from: SubmissionStatus, to: SubmissionStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Plain-language description of where a submission stands. */
export const STATUS_MEANING: Record<SubmissionStatus, string> = {
  draft:       'Not started. Nothing has been entered for this period yet.',
  in_progress: 'Being entered. Not yet sent to the registrar.',
  submitted:   'Sent to the class adviser, who has not yet received it. '
             + 'You can still recall it.',
  received:    'The class adviser has received it. Editing is locked and it '
             + 'can no longer be recalled — ask the adviser to return it.',
  forwarded:   'The adviser has passed it to the registrar, who has not yet '
             + 'received it.',
  registrar_received:
               'The registrar has received it and is reviewing.',
  returned:    'Sent back for correction. Editing is open again.',
  approved:    'Reviewed and accepted by the registrar. Not yet final.',
  finalized:   'Closed for the period. Awaiting release to learners.',
  published:   'Released. Learners can see these grades in their portal.',
  reopened:    'Unlocked after finalization so a correction can be made.',
};
