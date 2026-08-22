import { useCallback, useState } from 'react';
import type { SubmissionRow } from '../data/types';
import { StatusBadge } from '../components/StatusBadge';
import { Async, EmptyState, useAsync } from '../components/Async';

export interface AdviserActions {
  receiveSubmission: (id: string) => Promise<void>;
  forwardSubmission: (id: string) => Promise<void>;
  unforwardSubmission: (id: string) => Promise<void>;
}

interface Props {
  yearId: string;
  load: (yearId: string) => Promise<SubmissionRow[]>;
  actions: AdviserActions;
  onOpenClass: (classId: string, periodId: string) => void;
}

/** "22 Aug, 8:04 pm" — enough to match against a memory, no more. */
function when(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });
}

/**
 * The class adviser's desk.
 *
 * Every subject teacher in this adviser's sections submits their grades
 * to them; the adviser signs for each one, then passes the section up to
 * the registrar. Both signatures are what let the person on the other
 * end stop wondering — the teacher sees that their grades landed, and
 * the adviser sees that the registrar has theirs.
 *
 * Deliberately NOT a review screen. Receiving is acknowledging that a
 * record arrived, not judging it; the adviser cannot read another
 * teacher's marks here and has no Approve button. Returning a record for
 * correction stays with the registrar, who holds `grades.return`.
 *
 * Which buttons appear is decided by the status, and the database
 * refuses anything else regardless — a modified client gains nothing by
 * rendering a button it should not have.
 */
export function AdviserQueue({ yearId, load, actions, onOpenClass }: Props) {
  const [state, retry] = useAsync(() => load(yearId), [yearId]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    setError(null);
    try {
      await fn();
      retry();                        // re-read the real status, never assume it
    } catch (e) {
      // The database writes these refusals for a person — "the registrar
      // has already received this; ask for it to be returned instead" —
      // so pass them through rather than flattening them.
      setError(e instanceof Error ? e.message : 'That action did not complete.');
    } finally {
      setBusy(null);
    }
  }, [retry]);

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Incoming Grades</h2>
          <p className="page-sub">
            Grades submitted by the subject teachers in your advisory sections.
            Receive each one, then forward the section to the registrar.
          </p>
        </div>
      </div>

      {error && (
        <div className="err-banner" role="alert">
          <span>{error}</span>
          <button className="btn btn-sm" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <Async state={state} retry={retry} rows={6}>
        {(rows) => (rows.length === 0 ? (
          <EmptyState title="Nothing has been submitted yet">
            When a subject teacher submits grades for one of your sections,
            it appears here for you to receive.
          </EmptyState>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th scope="col">Class</th>
                  <th scope="col">Subject</th>
                  <th scope="col">Teacher</th>
                  <th scope="col">Period</th>
                  <th scope="col">Status</th>
                  <th scope="col">Chain</th>
                  <th scope="col" className="num">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isBusy = busy === r.submissionId;
                  const received = when(r.receivedAt);
                  const withRegistrar = when(r.registrarReceivedAt);
                  const forwarded = when(r.forwardedAt);
                  return (
                    <tr key={r.submissionId}>
                      <th scope="row">
                        <button className="link" onClick={() => onOpenClass(r.classId, r.periodId)}>
                          {r.gradeLevel} – {r.section}
                        </button>
                      </th>
                      <td>{r.subject}</td>
                      <td>{r.teacher ?? <span className="faint">—</span>}</td>
                      <td>{r.periodName}</td>
                      <td><StatusBadge status={r.status} /></td>
                      <td className="tbl-date">
                        {/*
                          The trail, most recent signature first. An adviser
                          scanning this column is answering one question:
                          has the registrar got it yet?
                        */}
                        {/*
                          A record that predates the chain — or one
                          already published — has no signatures, and
                          "Waiting for you" would be flatly untrue of it.
                          Only say that when it is actually waiting.
                        */}
                        {withRegistrar ? `Registrar signed ${withRegistrar}`
                          : forwarded ? `Sent ${forwarded} — not yet received`
                          : received ? `You received it ${received}`
                          : r.status === 'submitted'
                            ? <span className="faint">Waiting for you</span>
                            : <span className="faint">—</span>}
                      </td>
                      <td className="num">
                        <div className="row-actions">
                          {r.status === 'submitted' && (
                            <button
                              className="btn btn-primary btn-sm" disabled={isBusy}
                              onClick={() => void run(r.submissionId,
                                () => actions.receiveSubmission(r.submissionId))}
                            >
                              {isBusy ? '…' : 'Receive'}
                            </button>
                          )}
                          {r.status === 'received' && (
                            <button
                              className="btn btn-primary btn-sm" disabled={isBusy}
                              onClick={() => void run(r.submissionId,
                                () => actions.forwardSubmission(r.submissionId))}
                            >
                              {isBusy ? '…' : 'Forward to registrar'}
                            </button>
                          )}
                          {r.status === 'forwarded' && (
                            <button
                              className="btn btn-sm" disabled={isBusy}
                              title="The registrar has not signed for this yet, so you can still take it back"
                              onClick={() => void run(r.submissionId,
                                () => actions.unforwardSubmission(r.submissionId))}
                            >
                              {isBusy ? '…' : 'Take back'}
                            </button>
                          )}
                          {/*
                            Everything from registrar_received onward is
                            out of the adviser's hands. Saying so beats an
                            empty cell, which reads as a missing button.
                          */}
                          {!['submitted', 'received', 'forwarded'].includes(r.status) && (
                            <span className="faint">With the registrar</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </Async>
    </div>
  );
}
