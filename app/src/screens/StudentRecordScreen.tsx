import { useCallback, useMemo, useState } from 'react';
import type {
  EnrollmentEvent, EnrollmentOptions, EnrollmentRow, StudentRecord,
} from '../data/types';
import { Async, EmptyState, useAsync } from '../components/Async';

/**
 * Everything the registrar can DO to an enrolment, passed in rather
 * than reached for, so this screen renders identically for a teacher
 * (who gets none of them) without a second component.
 */
export interface RegistrarActions {
  loadOptions: (yearId: string) => Promise<EnrollmentOptions>;
  transferSection: (
    enrollmentId: string, sectionId: string,
    effectiveDate?: string | null, reason?: string | null,
  ) => Promise<{ from: string | null; to: string;
                 classesLeft: number; classesJoined: number }>;
  withdraw: (
    enrollmentId: string, kind: 'transferred_out' | 'dropped',
    effectiveDate: string | null, reason: string, destination?: string | null,
  ) => Promise<{ status: string; classesClosed: number }>;
  reenrol: (
    enrollmentId: string, effectiveDate?: string | null, reason?: string | null,
  ) => Promise<{ status: string; classesRejoined: number }>;
  createPortalAccount: (
    studentId: string, email: string, password: string,
  ) => Promise<{ userId: string; warning?: string }>;
  unlinkPortalAccount: (studentId: string, reason: string) => Promise<void>;
}

interface Props {
  studentId: string;
  load: (studentId: string) => Promise<StudentRecord | null>;
  loadHistory: (studentId: string) => Promise<EnrollmentEvent[]>;
  onBack: () => void;
  /** Absent for a teacher: the screen then shows the record and no controls. */
  actions?: RegistrarActions;
  canProvisionPortal?: boolean;
}

/**
 * One learner, whole.
 *
 * The shape of this screen is the shape of the schema, and that is the
 * point: identity at the top because there is one of it, then a row per
 * school year because there are many, then the grades those years
 * produced. A reader who has never seen the database should come away
 * knowing that moving section did not make a second learner.
 *
 * What is visible is decided by RLS, not here. A registrar opens anyone;
 * a teacher opens learners in their own classes; a learner opens
 * themselves. Anyone else gets the same answer as for a learner who does
 * not exist, which is the correct answer to give.
 */
export function StudentRecordScreen({
  studentId, load, loadHistory, onBack, actions, canProvisionPortal,
}: Props) {
  const [state, retry] = useAsync(() => load(studentId), [studentId]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <button className="link link-back" onClick={onBack}>← Students</button>
        </div>
      </div>

      <Async state={state} retry={retry} rows={8}>
        {(record) => (record === null ? (
          <div className="panel">
            <EmptyState title="Learner not found">
              This learner does not exist, or your account does not have access
              to their record.
            </EmptyState>
          </div>
        ) : (
          <Record
            record={record} studentId={studentId} loadHistory={loadHistory}
            actions={actions} canProvisionPortal={canProvisionPortal}
            onChanged={retry}
          />
        ))}
      </Async>
    </div>
  );
}

function Record({
  record, studentId, loadHistory, actions, canProvisionPortal, onChanged,
}: {
  record: StudentRecord;
  studentId: string;
  loadHistory: (studentId: string) => Promise<EnrollmentEvent[]>;
  actions?: RegistrarActions;
  canProvisionPortal?: boolean;
  onChanged: () => void;
}) {
  const { student, history, grades } = record;

  // The most recent year is the current one; the rest is history. The
  // list is already ordered newest-first by the contract.
  const current = history[0];
  const earlier = history.slice(1);

  /** Grades grouped by year and subject, so a row reads like a report card. */
  const byYear = useMemo(() => {
    const out = new Map<string, Map<string, typeof grades>>();
    for (const g of grades) {
      const year = out.get(g.academicYear) ?? new Map();
      year.set(g.subject, [...(year.get(g.subject) ?? []), g]);
      out.set(g.academicYear, year);
    }
    return out;
  }, [grades]);

  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <div>
            <h1 className="greeting">{student.displayName}</h1>
            <p className="page-sub">
              {student.studentNumber ?? 'no student number'}
              {' · '}
              {student.lrn ? `LRN ${student.lrn}` : 'LRN not yet issued'}
              {student.hasPortalAccount && ' · has a portal account'}
            </p>
          </div>
          <div className="spacer" />
          <span className="pill" data-tone={student.status === 'active' ? 'ok' : undefined}>
            {student.status}
          </span>
        </div>

        <div className="panel-body">
          <dl className="detail-grid">
            <Detail label="Sex" value={student.sex} />
            <Detail label="Date of birth" value={student.birthDate} />
            <Detail label="Place of birth" value={student.birthPlace} />
            <Detail label="Mother tongue" value={student.motherTongue} />
            <Detail label="Contact" value={student.contactNumber} />
            <Detail label="Email" value={student.email} />
            <Detail
              label="Address"
              value={[student.addressLine, student.barangay, student.municipality, student.province]
                .filter(Boolean).join(', ') || null}
            />
          </dl>
        </div>
      </div>

      {/*
        CURRENT ENROLMENT — where this learner is now. Separated from the
        identity above because it is a different row with a different
        lifetime, and separated from the history below because it is the
        one a registrar acts on.
      */}
      <div className="panel">
        <div className="panel-head"><h2>Current enrolment</h2></div>
        {current ? (
          <div className="panel-body">
            <dl className="detail-grid">
              <Detail label="School year" value={current.academicYear} />
              <Detail label="Grade level" value={current.gradeLevel} />
              <Detail label="Section" value={current.section ?? 'Unassigned'} />
              <Detail label="Status" value={current.status} />
              <Detail label="Date enrolled" value={current.dateEnrolled} />
              <Detail label="General average" value={
                current.generalAverage == null ? null : String(current.generalAverage)} />
            </dl>
          </div>
        ) : (
          <EmptyState title="Not currently enrolled">
            This learner has an identity record but no enrolment in any school year.
          </EmptyState>
        )}
      </div>

      {actions && current && (
        <EnrolmentActions
          enrollment={current} actions={actions} onChanged={onChanged}
        />
      )}

      {canProvisionPortal && actions && (
        <PortalAccount
          studentId={studentId}
          displayName={student.displayName}
          hasAccount={student.hasPortalAccount}
          email={student.email}
          actions={actions}
          onChanged={onChanged}
        />
      )}

      <EnrolmentTimeline studentId={studentId} load={loadHistory} />

      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Academic history</h2>
            <p className="page-sub">
              One row per school year, all against this one learner.
            </p>
          </div>
        </div>
        {earlier.length === 0 ? (
          <EmptyState title="No earlier years">
            {current
              ? `${current.academicYear} is this learner's first year on record here.`
              : 'Nothing on record yet.'}
          </EmptyState>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th scope="col">School year</th>
                  <th scope="col">Grade level</th>
                  <th scope="col">Section</th>
                  <th scope="col">Status</th>
                  <th scope="col">Promotion</th>
                  <th scope="col" className="num">General average</th>
                </tr>
              </thead>
              <tbody>
                {earlier.map((e: EnrollmentRow) => (
                  <tr key={e.enrollmentId}>
                    <th scope="row">{e.academicYear}</th>
                    <td>{e.gradeLevel}</td>
                    <td>{e.section ?? <span className="faint">—</span>}</td>
                    <td>{e.status}</td>
                    <td>{e.promotionStatus ?? <span className="faint">—</span>}</td>
                    <td className="num mono">
                      {e.generalAverage ?? <span className="faint">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Grades</h2>
            <p className="page-sub">
              Recorded period grades, as the server computed them. What appears
              here is what your account is permitted to see.
            </p>
          </div>
        </div>
        {grades.length === 0 ? (
          <EmptyState title="No grades recorded">
            Nothing has been computed and filed for this learner yet, or none of
            it is visible to your account.
          </EmptyState>
        ) : (
          [...byYear.entries()].map(([year, subjects]) => (
            <div key={year} className="tbl-wrap">
              <h3 className="loa-title">SY {year}</h3>
              <table className="tbl">
                <thead>
                  <tr>
                    <th scope="col">Subject</th>
                    <th scope="col" className="num">Grade</th>
                    <th scope="col">Period</th>
                    <th scope="col">Descriptor</th>
                  </tr>
                </thead>
                <tbody>
                  {[...subjects.entries()].map(([subject, entries]) =>
                    entries
                      .sort((a, b) => a.periodOrdinal - b.periodOrdinal)
                      .map((g, i) => (
                        <tr key={`${subject}-${g.period}`}>
                          {i === 0
                            ? <th scope="row" rowSpan={entries.length}>{subject}</th>
                            : null}
                          <td className="num mono">
                            {g.grade == null ? <span className="faint">—</span> : (
                              <span className="gb-chip" data-band={
                                g.passed === false ? 'low' : g.grade >= 90 ? 'high' : 'mid'
                              }>{g.grade}</span>
                            )}
                          </td>
                          <td>{g.period}</td>
                          <td>{g.descriptor ?? <span className="faint">—</span>}</td>
                        </tr>
                      )),
                  )}
                </tbody>
              </table>
            </div>
          ))
        )}
      </div>
    </>
  );
}

/* ==================================================================== *
 * THE ENROLMENT, AS ACTS
 *
 * `updateEnrollment` can already change any field, and it stays. What
 * it cannot do is make a TRANSFER mean what a transfer means: leave the
 * old section's class rosters, join the new section's, and say why. So
 * the acts a registrar actually performs get their own controls, each
 * carrying the one thing a field edit has no room for — the reason.
 * ==================================================================== */
function EnrolmentActions({ enrollment, actions, onChanged }: {
  enrollment: EnrollmentRow;
  actions: RegistrarActions;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState<'transfer' | 'withdraw' | 'reenrol' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const closed = enrollment.status === 'transferred_out'
    || enrollment.status === 'dropped';

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setError(null);
    try {
      setNote(await fn());
      setOpen(null);
      onChanged();
    } catch (err) {
      // The server writes these for a registrar — "That section is not
      // available for this learner's year and grade level." — so show
      // them as written.
      setError(err instanceof Error ? err.message : 'That could not be done.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Enrolment actions</h2>
          <p className="page-sub">
            Each of these records what changed, when, and why. Nothing is
            deleted: a learner who leaves a class keeps every mark they earned
            in it.
          </p>
        </div>
        <div className="spacer" />
        <div className="row-actions">
          {!closed && (
            <button className="btn" onClick={() => setOpen(open === 'transfer' ? null : 'transfer')}>
              Transfer section
            </button>
          )}
          {!closed && (
            <button className="btn" onClick={() => setOpen(open === 'withdraw' ? null : 'withdraw')}>
              Withdraw
            </button>
          )}
          {closed && (
            <button className="btn btn-primary" onClick={() => setOpen(open === 'reenrol' ? null : 'reenrol')}>
              Re-enrol
            </button>
          )}
        </div>
      </div>

      {error && <div className="err-banner" role="alert"><span>{error}</span></div>}
      {note && (
        <div className="notice" role="status">
          <span>{note}</span>
          <button className="btn btn-sm" onClick={() => setNote(null)}>Dismiss</button>
        </div>
      )}

      {open === 'transfer' && (
        <TransferForm
          enrollment={enrollment} actions={actions} busy={busy}
          onCancel={() => setOpen(null)}
          onSubmit={(sectionId, date, reason) => run(async () => {
            const r = await actions.transferSection(
              enrollment.enrollmentId, sectionId, date, reason);
            return `Moved from ${r.from ?? 'no section'} to ${r.to}. `
              + `Left ${r.classesLeft} class${r.classesLeft === 1 ? '' : 'es'}, `
              + `joined ${r.classesJoined}.`;
          })}
        />
      )}

      {open === 'withdraw' && (
        <WithdrawForm
          busy={busy}
          onCancel={() => setOpen(null)}
          onSubmit={(kind, date, reason, destination) => run(async () => {
            const r = await actions.withdraw(
              enrollment.enrollmentId, kind, date, reason, destination);
            return `Enrolment closed as ${r.status}. `
              + `${r.classesClosed} class${r.classesClosed === 1 ? '' : 'es'} closed; `
              + 'every mark already recorded is kept.';
          })}
        />
      )}

      {open === 'reenrol' && (
        <ReenrolForm
          busy={busy}
          onCancel={() => setOpen(null)}
          onSubmit={(date, reason) => run(async () => {
            const r = await actions.reenrol(enrollment.enrollmentId, date, reason);
            return `Re-enrolled. Rejoined ${r.classesRejoined} `
              + `class${r.classesRejoined === 1 ? '' : 'es'}, with earlier marks intact.`;
          })}
        />
      )}
    </div>
  );
}

function TransferForm({ enrollment, actions, busy, onCancel, onSubmit }: {
  enrollment: EnrollmentRow;
  actions: RegistrarActions;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (sectionId: string, date: string | null, reason: string) => void;
}) {
  const read = useCallback(
    () => actions.loadOptions(enrollment.academicYearId),
    [actions, enrollment.academicYearId]);
  const [options] = useAsync(read, [read]);
  const [sectionId, setSectionId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');

  // Only sections at THIS learner's grade level, and never the one they
  // are already in. The server refuses both; offering them anyway would
  // be a dropdown built to be rejected.
  const choices = options.status === 'ready'
    ? options.data.sections.filter(
        (x) => x.gradeLevelId === enrollment.gradeLevelId && x.id !== enrollment.sectionId)
    : [];

  return (
    <div className="inline-form">
      <div className="form-grid">
        <label className="field">
          <span className="field-label">Move to *</span>
          <select
            className="input" value={sectionId} disabled={busy}
            onChange={(e) => setSectionId(e.target.value)}
          >
            <option value="">Choose a section…</option>
            {choices.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <span className="field-hint">
            {enrollment.gradeLevel} only. A move across grade levels is a
            grade-level change, not a transfer.
          </span>
        </label>
        <label className="field">
          <span className="field-label">Effective date</span>
          <input
            className="input" type="date" value={date} disabled={busy}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Reason</span>
          <input
            className="input" value={reason} disabled={busy}
            placeholder="Parent request"
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
      </div>
      <div className="row-actions">
        <button className="btn" type="button" onClick={onCancel} disabled={busy}>Cancel</button>
        <button
          className="btn btn-primary" type="button" disabled={!sectionId || busy}
          onClick={() => onSubmit(sectionId, date || null, reason)}
        >
          {busy ? 'Moving…' : 'Transfer'}
        </button>
      </div>
    </div>
  );
}

function WithdrawForm({ busy, onCancel, onSubmit }: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (
    kind: 'transferred_out' | 'dropped', date: string | null,
    reason: string, destination: string | null,
  ) => void;
}) {
  const [kind, setKind] = useState<'transferred_out' | 'dropped'>('transferred_out');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [destination, setDestination] = useState('');

  return (
    <div className="inline-form">
      <div className="form-grid">
        <label className="field">
          <span className="field-label">What happened *</span>
          <select
            className="input" value={kind} disabled={busy}
            onChange={(e) => setKind(e.target.value as 'transferred_out' | 'dropped')}
          >
            <option value="transferred_out">Transferred to another school</option>
            <option value="dropped">Dropped out</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Effective date</span>
          <input
            className="input" type="date" value={date} disabled={busy}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        {kind === 'transferred_out' && (
          <label className="field">
            <span className="field-label">Receiving school</span>
            <input
              className="input" value={destination} disabled={busy}
              placeholder="Taytay National High School"
              onChange={(e) => setDestination(e.target.value)}
            />
          </label>
        )}
        <label className="field">
          <span className="field-label">Reason *</span>
          <input
            className="input" value={reason} disabled={busy}
            placeholder="Family moved"
            onChange={(e) => setReason(e.target.value)}
          />
          {/*
            Required, and the server requires it too. "Why did this
            learner leave" is the one question the record exists to
            answer, and a blank is not an answer.
          */}
          <span className="field-hint">
            Recorded on the enrolment history, which SF10 is built from.
          </span>
        </label>
      </div>
      <div className="row-actions">
        <button className="btn" type="button" onClick={onCancel} disabled={busy}>Cancel</button>
        <button
          className="btn btn-primary" type="button" disabled={!reason.trim() || busy}
          onClick={() => onSubmit(kind, date || null, reason, destination || null)}
        >
          {busy ? 'Recording…' : 'Withdraw'}
        </button>
      </div>
    </div>
  );
}

function ReenrolForm({ busy, onCancel, onSubmit }: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (date: string | null, reason: string) => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  return (
    <div className="inline-form">
      <p className="page-sub">
        Re-opens this school year&rsquo;s enrolment and puts the learner back on
        their section&rsquo;s class rosters. Marks recorded before they left are
        still there — the class membership is re-opened, not replaced.
      </p>
      <div className="form-grid">
        <label className="field">
          <span className="field-label">Effective date</span>
          <input
            className="input" type="date" value={date} disabled={busy}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Reason</span>
          <input
            className="input" value={reason} disabled={busy}
            placeholder="Returned in January"
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
      </div>
      <div className="row-actions">
        <button className="btn" type="button" onClick={onCancel} disabled={busy}>Cancel</button>
        <button
          className="btn btn-primary" type="button" disabled={busy}
          onClick={() => onSubmit(date || null, reason)}
        >
          {busy ? 'Re-enrolling…' : 'Re-enrol'}
        </button>
      </div>
    </div>
  );
}

/* ==================================================================== *
 * THE TIMELINE
 *
 * `enrollment_events` has been in the schema since migration 0005 and
 * was read by nothing until this phase. It is the answer to "where was
 * this learner in October", which the enrolment row alone cannot give:
 * that row only ever holds where they are NOW.
 * ==================================================================== */
const EVENT_LABEL: Record<string, string> = {
  enrolled: 'Enrolled',
  transfer_in: 'Transferred in',
  transfer_out: 'Transferred out',
  drop: 'Dropped out',
  re_entry: 'Re-enrolled',
  section_change: 'Section',
  grade_level_change: 'Grade level',
};

function EnrolmentTimeline({ studentId, load }: {
  studentId: string;
  load: (studentId: string) => Promise<EnrollmentEvent[]>;
}) {
  const read = useCallback(() => load(studentId), [load, studentId]);
  const [state, retry] = useAsync(read, [read]);

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Enrolment history</h2>
          <p className="page-sub">
            Every move, with who recorded it and when. This is the record SF10
            is built from, kept separately from the audit trail.
          </p>
        </div>
      </div>
      <Async state={state} retry={retry} rows={3}>
        {(events) => (events.length === 0 ? (
          <EmptyState title="Nothing recorded yet">
            Enrolment events start being recorded from the moment a learner is
            enrolled. A learner enrolled before this was built has none.
          </EmptyState>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">School year</th>
                  <th scope="col">What happened</th>
                  <th scope="col">Change</th>
                  <th scope="col">Reason</th>
                  <th scope="col">Recorded by</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <th scope="row" className="mono">{e.eventDate}</th>
                    <td>{e.academicYear}</td>
                    <td>{EVENT_LABEL[e.eventType] ?? e.eventType}</td>
                    <td>
                      {/*
                        A null `from` is an ASSIGNMENT, not a move: the
                        learner had no section before. Rendering it as
                        "— → Pearl" would read as a transfer from nowhere.
                      */}
                      {e.from
                        ? <>{e.from} <span className="faint">→</span> {e.to ?? '—'}</>
                        : (e.to ?? <span className="faint">—</span>)}
                    </td>
                    <td>{e.notes ?? <span className="faint">—</span>}</td>
                    <td>{e.recordedBy ?? <span className="faint">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </Async>
    </div>
  );
}

/* ==================================================================== *
 * THE WAY IN
 *
 * `students.portal_user_id` has been the link between a learner and a
 * login since migration 0005, and until this phase nothing in the
 * product could set it — an entire role with no door. This is the door.
 * ==================================================================== */
function PortalAccount({
  studentId, displayName, hasAccount, email, actions, onChanged,
}: {
  studentId: string;
  displayName: string;
  hasAccount: boolean;
  email: string | null;
  actions: RegistrarActions;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [addr, setAddr] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const r = await actions.createPortalAccount(studentId, addr.trim(), password);
      setNote(r.warning
        ?? `${displayName} can now sign in with ${addr.trim()}. `
           + 'They will be asked to choose their own password.');
      setOpen(false);
      setAddr('');
      setPassword('');
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the account.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Portal account</h2>
          <p className="page-sub">
            {hasAccount
              ? 'This learner can sign in and see their published grades.'
              : 'This learner has no way to sign in yet.'}
          </p>
        </div>
        <div className="spacer" />
        {!hasAccount && !open && (
          <button className="btn btn-primary" onClick={() => setOpen(true)}>
            Create portal account
          </button>
        )}
      </div>

      {error && <div className="err-banner" role="alert"><span>{error}</span></div>}
      {note && (
        <div className="notice" role="status">
          <span>{note}</span>
          <button className="btn btn-sm" onClick={() => setNote(null)}>Dismiss</button>
        </div>
      )}

      {hasAccount ? (
        <div className="panel-body">
          <dl className="detail-grid">
            <Detail label="Signs in as" value={email} />
            <Detail label="Sees" value="Published grades only" />
          </dl>
          <p className="menu-note">
            Forgotten password? Reset it on the Users screen. Creating a second
            account would sign in and resolve to nobody.
          </p>
        </div>
      ) : open ? (
        <div className="inline-form">
          <div className="form-grid">
            <label className="field">
              <span className="field-label">Email address *</span>
              <input
                className="input" type="email" value={addr} disabled={busy}
                placeholder="learner@example.com"
                onChange={(e) => setAddr(e.target.value)}
              />
              <span className="field-hint">
                Their sign-in name. Every account across all schools needs its own.
              </span>
            </label>
            <label className="field">
              <span className="field-label">Temporary password *</span>
              <input
                className="input" type="text" value={password} disabled={busy}
                onChange={(e) => setPassword(e.target.value)}
              />
              {/*
                Shown, not hidden: the registrar has to read it out or
                write it down for the learner. It is replaced on first
                sign-in and is never stored in an academic table.
              */}
              <span className="field-hint">
                At least 8 characters. They must change it when they first sign in.
              </span>
            </label>
          </div>
          <div className="row-actions">
            <button className="btn" type="button" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button
              className="btn btn-primary" type="button"
              disabled={busy || !addr.trim() || password.length < 8}
              onClick={() => { void create(); }}
            >
              {busy ? 'Creating…' : 'Create account'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="detail">
      <dt>{label}</dt>
      <dd>{value ?? <span className="faint">—</span>}</dd>
    </div>
  );
}
