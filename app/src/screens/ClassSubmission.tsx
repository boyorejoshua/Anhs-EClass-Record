import { useCallback, useState } from 'react';
import type { AcademicPeriod, ClassSummary, SubmissionStatus, ValidationReport } from '../data/types';
import { StatusBadge } from '../components/StatusBadge';
import { Async, useAsync } from '../components/Async';
import { STATUS_MEANING, canRecall, custodian, isEditable, missingCount, pct } from '../lib/status';

interface Props {
  cls: ClassSummary;
  period: AcademicPeriod;
  status: SubmissionStatus;
  validate: () => Promise<ValidationReport>;
  submit: (acknowledgeWarnings: boolean) => Promise<void>;
  /** Take it back. Only offered while nobody has signed for the record. */
  recall: (reason?: string) => Promise<void>;
  onSubmitted: () => void;
  onReviewMissing: () => void;
  /** When the class adviser signed for it, if they have. */
  receivedAt?: string | null;
  /** When the registrar signed for it, if they have. */
  registrarReceivedAt?: string | null;
}

/** "22 Aug, 8:04 pm" — enough to match against a memory, no more. */
function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });
}

/**
 * The submission panel.
 *
 * Before this, "Submit Term 2" was a `<button>` with no onClick. It
 * looked identical to a working control, which is worse than no button:
 * a teacher who believes grades were submitted stops chasing them.
 *
 * The flow is deliberately three explicit steps rather than one click:
 *
 *   1. VALIDATE against the server, not against local state. The client
 *      cannot see what another tab has done, and validate_submission is
 *      the same function submit_grades runs before it commits.
 *   2. CONFIRM, showing exactly what is about to be sent and what will
 *      be locked. Submission is not a save; it takes the gradebook away
 *      from the teacher until a registrar returns it.
 *   3. SUBMIT via the RPC, then re-read the real status.
 *
 * Errors block. Warnings require an explicit acknowledgement, which the
 * server also enforces — passing p_acknowledge_warnings is not a client
 * courtesy, it is an argument submit_grades checks.
 */
export function ClassSubmission({
  cls, period, status, validate, submit, recall, onSubmitted, onReviewMissing,
  receivedAt, registrarReceivedAt,
}: Props) {
  const [report, retry] = useAsync(validate, [cls.id, period.id, status]);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const done = cls.completeness[period.id];
  const progress = pct(done);
  const missing = missingCount(done);
  const editable = isEditable(status);
  const recallable = canRecall(status);
  const holder = custodian(status);

  const doSubmit = useCallback(async (acknowledge: boolean) => {
    setBusy(true);
    setFailure(null);
    try {
      await submit(acknowledge);
      setConfirming(false);
      onSubmitted();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : 'Could not submit.');
    } finally {
      setBusy(false);
    }
  }, [submit, onSubmitted]);

  const doRecall = useCallback(async () => {
    setBusy(true);
    setFailure(null);
    try {
      await recall();
      onSubmitted();     // same refresh: the status changed
    } catch (e) {
      // The server's refusal is written for a teacher — "ask for it to be
      // returned instead" — so show it rather than a generic message.
      setFailure(e instanceof Error ? e.message : 'Could not recall this submission.');
    } finally {
      setBusy(false);
    }
  }, [recall, onSubmitted]);

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Submission</h2>
        <div className="spacer" />
        <StatusBadge status={status} />
      </div>

      <div className="panel-body">
        <p className="sub-meaning">{STATUS_MEANING[status]}</p>

        <div className="sub-grid">
          <div className="sub-metric">
            <span className="sub-metric-label">Progress</span>
            <b className="mono">{progress}%</b>
            <div className="cc-bar"><span style={{ width: `${progress}%` }} data-full={progress === 100} /></div>
            <span className="sub-metric-note">
              {done ? `${done.scored} of ${done.total} scores entered` : 'No assessments yet'}
            </span>
          </div>
          <div className="sub-metric">
            <span className="sub-metric-label">Missing scores</span>
            <b className="mono" data-warn={missing > 0}>{missing}</b>
            {missing > 0 && (
              <button className="btn btn-sm" onClick={onReviewMissing}>Review missing</button>
            )}
          </div>
          <div className="sub-metric">
            <span className="sub-metric-label">Period</span>
            <b>{period.name}</b>
            <span className="sub-metric-note">{cls.studentCount} learners</span>
          </div>
        </div>

        {failure && (
          <div className="err-banner" role="alert">
            <span>{failure}</span>
            <button className="btn btn-sm" onClick={() => setFailure(null)}>Dismiss</button>
          </div>
        )}

        {/*
          THE CHAIN OF CUSTODY.

          A teacher who has submitted wants to know one thing: has anyone
          picked it up, and can I still pull it back? Showing the trail
          answers both without them having to ask anyone.
        */}
        {holder && (
          <ol className="chain" aria-label="Where this record is">
            <li data-done="true">
              <b>Submitted</b>
              <span>by you</span>
            </li>
            <li data-done={receivedAt ? 'true' : undefined}>
              <b>Class adviser</b>
              <span>{receivedAt ? `received ${when(receivedAt)}` : 'not yet received'}</span>
            </li>
            <li data-done={registrarReceivedAt ? 'true' : undefined}>
              <b>Registrar</b>
              <span>
                {registrarReceivedAt ? `received ${when(registrarReceivedAt)}`
                  : status === 'forwarded' ? 'sent, not yet received'
                  : 'not yet sent'}
              </span>
            </li>
          </ol>
        )}

        {!editable ? (
          <div className="sub-locked">
            <b>Editing is locked</b>
            <span>
              {recallable
                ? 'Nobody has received this yet, so you can still take it back and keep editing.'
                : status === 'received'
                  ? 'The class adviser has this record. If a correction is needed, ask them to return it.'
                  : status === 'forwarded' || status === 'registrar_received'
                    ? 'This record is with the registrar. If a correction is needed, ask them to return it.'
                    : 'This period is closed. A registrar can reopen it if a correction is needed.'}
            </span>
            {recallable && (
              <button className="btn btn-sm" onClick={doRecall} disabled={busy}>
                {busy ? 'Recalling…' : `Recall ${period.name}`}
              </button>
            )}
          </div>
        ) : (
          <Async state={report} retry={retry} rows={2}>
            {(r) => (
              <div className="sub-check">
                {r.errors.length > 0 && (
                  <div className="sub-block" data-kind="error">
                    <b>Cannot submit yet</b>
                    <ul>{r.errors.map((e) => <li key={e.code}>{e.message}</li>)}</ul>
                  </div>
                )}

                {r.errors.length === 0 && r.warnings.length > 0 && (
                  <div className="sub-block" data-kind="warn">
                    <b>Can submit, with gaps</b>
                    <ul>{r.warnings.map((w) => <li key={w.code}>{w.message}</li>)}</ul>
                    <span className="sub-block-note">
                      A learner with no score is graded on what was entered. If that is not
                      what you intend, enter the missing marks first.
                    </span>
                  </div>
                )}

                {r.errors.length === 0 && r.warnings.length === 0 && (
                  <div className="sub-block" data-kind="ok">
                    <b>Ready to submit</b>
                    <span>Every learner has a score for every assessment in this period.</span>
                  </div>
                )}

                {!confirming ? (
                  <button
                    className="btn btn-primary"
                    disabled={r.errors.length > 0}
                    onClick={() => setConfirming(true)}
                  >
                    Submit {period.name}
                  </button>
                ) : (
                  <div className="sub-confirm" role="group" aria-label="Confirm submission">
                    <b>Submit {period.name} for {cls.gradeLevel} – {cls.section}?</b>
                    <span>
                      The gradebook locks for this period. Only the registrar can return it
                      for correction.
                      {r.warnings.length > 0 && ' You are submitting with gaps.'}
                    </span>
                    <div className="sub-confirm-actions">
                      <button
                        className="btn btn-primary"
                        disabled={busy}
                        onClick={() => void doSubmit(r.warnings.length > 0)}
                      >
                        {busy ? 'Submitting…' : `Yes, submit ${period.name}`}
                      </button>
                      <button className="btn" disabled={busy} onClick={() => setConfirming(false)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Async>
        )}
      </div>
    </div>
  );
}
