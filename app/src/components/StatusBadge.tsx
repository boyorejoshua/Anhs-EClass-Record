import type { SubmissionStatus } from '../data/types';

/**
 * Status is glyph + word + colour — never colour alone — so it survives
 * greyscale printing and colour-blind readers (handoff, "Status system").
 * The glyph is aria-hidden; the word carries the meaning.
 */
const MAP: Record<SubmissionStatus, { glyph: string; label: string; cls: string; title?: string }> = {
  draft:       { glyph: '○', label: 'Draft',        cls: 'badge-draft',     title: 'Not yet started' },
  in_progress: { glyph: '◐', label: 'In progress',  cls: 'badge-progress',  title: 'Partly entered, not submitted' },
  submitted:   { glyph: '↑', label: 'Submitted',    cls: 'badge-submitted', title: 'Sent to the class adviser, not yet received' },
  // A signed-for record reads differently from one still in transit, so
  // the glyph changes with it: ↑ in flight, ✎ signed for, ⇥ handed on.
  received:    { glyph: '✎', label: 'With adviser',  cls: 'badge-submitted', title: 'The class adviser has received it' },
  forwarded:   { glyph: '⇥', label: 'Forwarded',     cls: 'badge-submitted', title: 'Sent to the registrar, not yet received' },
  registrar_received:
               { glyph: '✎', label: 'With registrar', cls: 'badge-submitted', title: 'The registrar has received it and is reviewing' },
  returned:    { glyph: '↺', label: 'Returned',     cls: 'badge-returned',  title: 'Sent back for revision' },
  approved:    { glyph: '✓', label: 'Approved',     cls: 'badge-approved' },
  finalized:   { glyph: '✓', label: 'Finalized',    cls: 'badge-finalized', title: 'Locked; not yet visible to learners' },
  published:   { glyph: '✓', label: 'Published',    cls: 'badge-published', title: 'Visible to learners' },
  reopened:    { glyph: '↺', label: 'Reopened',     cls: 'badge-returned',  title: 'Reopened for correction; hidden from learners again' },
};

export function StatusBadge({ status }: { status: SubmissionStatus }) {
  const s = MAP[status];
  return (
    <span className={`badge ${s.cls}`} title={s.title ?? s.label}>
      <span aria-hidden="true">{s.glyph}</span>
      {s.label}
    </span>
  );
}
