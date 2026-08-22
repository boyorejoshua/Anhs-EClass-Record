/**
 * Submission status: what the database stores vs. what a person needs.
 *
 * The database has seven statuses (migration 0007's CHECK):
 *
 *   draft · submitted · returned · approved · finalized · published · reopened
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
  submitted:   ['returned', 'approved'],
  approved:    ['finalized', 'returned'],
  finalized:   ['published', 'reopened'],
  published:   ['reopened'],
};

export function canTransition(from: SubmissionStatus, to: SubmissionStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Plain-language description of where a submission stands. */
export const STATUS_MEANING: Record<SubmissionStatus, string> = {
  draft:       'Not started. Nothing has been entered for this period yet.',
  in_progress: 'Being entered. Not yet sent to the registrar.',
  submitted:   'Sent to the registrar and awaiting review. Editing is locked.',
  returned:    'Sent back for correction. Editing is open again.',
  approved:    'Reviewed and accepted by the registrar. Not yet final.',
  finalized:   'Closed for the period. Awaiting release to learners.',
  published:   'Released. Learners can see these grades in their portal.',
  reopened:    'Unlocked after finalization so a correction can be made.',
};
