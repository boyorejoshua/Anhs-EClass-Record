import { useCallback, useMemo, useState } from 'react';
import type { SubmissionRow, SubmissionStatus } from '../data/types';
import { StatusBadge } from '../components/StatusBadge';
import { Async, EmptyState, useAsync } from '../components/Async';
import { canTransition, pct } from '../lib/status';

export interface QueueActions {
  /** Sign for it. The chain's first registrar step, before any review. */
  registrarReceiveSubmission: (id: string) => Promise<void>;
  returnSubmission: (id: string, reason: string) => Promise<void>;
  approveSubmission: (id: string) => Promise<void>;
  finalizeSubmission: (id: string) => Promise<void>;
  publishSubmission: (id: string) => Promise<void>;
}

interface Props {
  yearId: string;
  load: (yearId: string) => Promise<SubmissionRow[]>;
  actions: QueueActions;
  onOpenClass: (classId: string, periodId: string) => void;
}

/** Which action a registrar may take, from the state machine — never guessed. */
type ActionKey = 'receive' | 'return' | 'approve' | 'finalize' | 'publish';

const ACTION_TARGET: Record<ActionKey, SubmissionStatus> = {
  receive: 'registrar_received',
  return: 'returned', approve: 'approved', finalize: 'finalized', publish: 'published',
};

const ACTION_LABEL: Record<ActionKey, string> = {
  // "Receive" is a signature, not a judgement — it says the record
  // arrived, which is what the adviser is waiting to see. Approval is a
  // separate act and stays a separate button.
  receive: 'Receive',
  return: 'Return', approve: 'Approve', finalize: 'Finalize', publish: 'Publish',
};

/** Is there anything the registrar can do to this row right now? */
function actionable(r: SubmissionRow): boolean {
  return (Object.keys(ACTION_TARGET) as ActionKey[])
    .some((k) => canTransition(r.status, ACTION_TARGET[k]));
}

/**
 * The grade submission queue.
 *
 * This is the registrar's entire job during grading season, and it was a
 * menu entry with a hard-coded badge of "8" that rendered the dashboard.
 *
 * Which buttons appear comes from the same transition table the database
 * enforces (app.assert_transition, migration 0010). The UI uses it to
 * decide what to OFFER; the refusal itself happens in the database, so a
 * modified client gains nothing by showing a button it should not.
 */
export function RegistrarQueue({ yearId, load, actions, onOpenClass }: Props) {
  const [state, retry] = useAsync(() => load(yearId), [yearId]);
  const [filter, setFilter] = useState<'attention' | 'all'>('attention');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [returning, setReturning] = useState<SubmissionRow | null>(null);
  const [reason, setReason] = useState('');

  const run = useCallback(async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    setError(null);
    try {
      await fn();
      retry();                        // re-read the real status, never assume it
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That action did not complete.');
    } finally {
      setBusy(null);
    }
  }, [retry]);

  const doReturn = useCallback(async () => {
    if (!returning || !reason.trim()) return;
    const row = returning;
    const why = reason.trim();
    setReturning(null);
    setReason('');
    await run(row.submissionId, () => actions.returnSubmission(row.submissionId, why));
  }, [returning, reason, run, actions]);

  const rows = useMemo(() => {
    if (state.status !== 'ready') return [];
    // "Needs attention" is DERIVED: a row needs attention when there is a
    // button on it. It used to be a hard-coded list of three statuses,
    // which quietly emptied the whole queue when migration 0022 put the
    // adviser in the chain and `submitted` stopped arriving here.
    return filter === 'all' ? state.data : state.data.filter(actionable);
  }, [state, filter]);

  const counts = useMemo(() => {
    if (state.status !== 'ready') return null;
    const c: Partial<Record<SubmissionStatus, number>> = {};
    for (const r of state.data) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [state]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="greeting">Grade submissions</h1>
          <p className="page-sub">
            {counts
              ? `${counts.submitted ?? 0} awaiting review · ${counts.approved ?? 0} approved · ${counts.finalized ?? 0} to publish`
              : 'Loading…'}
          </p>
        </div>
      </div>

      {error && (
        <div className="err-banner" role="alert">
          <span>{error}</span>
          <button className="btn btn-sm" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <div className="panel">
        <div className="gb-toolbar">
          <div className="seg" role="group" aria-label="Filter">
            <button aria-pressed={filter === 'attention'} onClick={() => setFilter('attention')}>
              Needs attention
            </button>
            <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
              All
            </button>
          </div>
        </div>

        <Async
          state={state}
          retry={retry}
          isEmpty={() => rows.length === 0}
          empty={
            <EmptyState title={filter === 'attention' ? 'Nothing waiting' : 'No submissions yet'}>
              {filter === 'attention'
                ? 'Every submission has been dealt with. Switch to All to see the full history.'
                : 'Submissions appear here once a teacher sends a period for review.'}
            </EmptyState>
          }
        >
          {() => (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th scope="col">Class</th>
                    <th scope="col">Teacher</th>
                    <th scope="col">Period</th>
                    <th scope="col" className="num">Complete</th>
                    <th scope="col">Status</th>
                    <th scope="col">Submitted</th>
                    <th scope="col"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const p = pct(r.completeness);
                    const isBusy = busy === r.submissionId;
                    const available = (Object.keys(ACTION_TARGET) as ActionKey[])
                      .filter((k) => canTransition(r.status, ACTION_TARGET[k]));
                    return (
                      <tr key={r.submissionId}>
                        <th scope="row">
                          <button className="link" onClick={() => onOpenClass(r.classId, r.periodId)}>
                            {r.gradeLevel} – {r.section}
                          </button>
                          <span className="tbl-sub">{r.subject}</span>
                        </th>
                        <td>{r.teacher ?? '—'}</td>
                        <td>{r.periodName}</td>
                        <td className="num mono" data-warn={p < 100}>{p}%</td>
                        <td>
                          <StatusBadge status={r.status} />
                          {r.returnReason && r.status === 'returned' && (
                            <span className="tbl-sub" title={r.returnReason}>{r.returnReason}</span>
                          )}
                        </td>
                        <td className="mono tbl-date">
                          {r.submittedAt ? new Date(r.submittedAt).toLocaleDateString('en-PH', {
                            day: 'numeric', month: 'short', year: 'numeric',
                          }) : '—'}
                        </td>
                        <td>
                          <div className="row-actions">
                            <button className="btn btn-sm" onClick={() => onOpenClass(r.classId, r.periodId)}>
                              Review
                            </button>
                            {available.map((k) => (
                              <button
                                key={k}
                                className={k === 'return' ? 'btn btn-sm' : 'btn btn-primary btn-sm'}
                                disabled={isBusy}
                                onClick={() =>
                                  k === 'return'
                                    ? setReturning(r)
                                    : void run(r.submissionId, () =>
                                        k === 'receive' ? actions.registrarReceiveSubmission(r.submissionId)
                                        : k === 'approve' ? actions.approveSubmission(r.submissionId)
                                        : k === 'finalize' ? actions.finalizeSubmission(r.submissionId)
                                        : actions.publishSubmission(r.submissionId))
                                }
                              >
                                {isBusy ? '…' : ACTION_LABEL[k]}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Async>
      </div>

      {returning && (
        <div className="modal-bg" role="dialog" aria-modal="true" aria-labelledby="ret-title">
          <div className="modal panel">
            <div className="panel-head">
              <h2 id="ret-title">Return to {returning.teacher ?? 'the teacher'}</h2>
            </div>
            <div className="panel-body">
              <p className="page-sub">
                {returning.gradeLevel} – {returning.section} · {returning.subject} ·{' '}
                {returning.periodName}
              </p>
              <label htmlFor="ret-reason" className="topbar-label">
                Reason — the teacher sees this
              </label>
              <textarea
                id="ret-reason"
                className="input"
                rows={3}
                autoFocus
                placeholder="e.g. 5 missing scores in Written Works"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <p className="menu-note">
                A reason is required. The database rejects a return without one, and a
                teacher cannot act on “returned” with nothing to act on.
              </p>
              <div className="sub-confirm-actions">
                <button className="btn btn-primary" disabled={!reason.trim()} onClick={() => void doReturn()}>
                  Return submission
                </button>
                <button className="btn" onClick={() => { setReturning(null); setReason(''); }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
