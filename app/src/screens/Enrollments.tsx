import { useCallback, useState } from 'react';
import type {
  EnrollmentOptions, PortalAccountList, PortalCandidate,
} from '../data/types';
import { Async, EmptyState, useAsync } from '../components/Async';

interface Props {
  yearId: string;
  yearLabel: string;
  loadOptions: (yearId: string) => Promise<EnrollmentOptions>;
  loadCandidates: (sectionId: string) => Promise<PortalAccountList>;
  createAccount: (
    studentId: string, email: string, password: string,
  ) => Promise<{ userId: string; warning?: string }>;
  onOpenStudent: (studentId: string) => void;
}

/**
 * Enrollments — a section at a time.
 *
 * `nav.ts` carried this as `planned` with the note that enrolling in
 * bulk needs the import pipeline, and that is still true: this screen
 * does not enrol anybody. What it does is answer the question a
 * registrar asks once a section is filled — WHO IN HERE CAN ACTUALLY
 * SIGN IN — which had no answer at all, because nothing in the product
 * could give a learner a portal account.
 *
 * A section at a time, deliberately. A registrar provisions Grade 10
 * Pearl on a Monday, not fifteen hundred learners at once; the query
 * stays bounded and the credentials stay to one printable page.
 *
 * Individual provisioning only, for now. The data model is ready for a
 * bulk action — `portal_account_candidates` already returns the whole
 * section with a `hasAccount` flag per learner — but handing out four
 * hundred passwords in one click is a decision to make with a school in
 * front of you, not one to build speculatively.
 */
export function Enrollments({
  yearId, yearLabel, loadOptions, loadCandidates, createAccount, onOpenStudent,
}: Props) {
  const read = useCallback(() => loadOptions(yearId), [loadOptions, yearId]);
  const [options, retryOptions] = useAsync(read, [read]);
  const [sectionId, setSectionId] = useState('');

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="greeting">Enrollments</h1>
          <p className="page-sub">
            SY {yearLabel}. Pick a section to see who is in it and who can sign
            in to the student portal.
          </p>
        </div>
      </div>

      <Async state={options} retry={retryOptions} rows={2}>
        {(opts) => (
          <>
            <div className="panel">
              <div className="panel-head">
                <div>
                  <h2>Section</h2>
                  <p className="page-sub">
                    Nothing loads until a section is chosen — a school year is
                    too many learners to list at once.
                  </p>
                </div>
                <div className="spacer" />
                <label className="picker">
                  <span className="sr-only">Section</span>
                  <select
                    className="input" value={sectionId} aria-label="Section"
                    onChange={(e) => setSectionId(e.target.value)}
                  >
                    <option value="">Choose a section…</option>
                    {opts.sections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.gradeLevel} – {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {opts.sections.length === 0 && (
                <EmptyState title="No sections yet">
                  Sections are created on Classes &amp; Sections. A learner
                  cannot be enrolled into one that does not exist.
                </EmptyState>
              )}
            </div>

            {sectionId && (
              <SectionRoll
                key={sectionId}
                sectionId={sectionId}
                load={loadCandidates}
                createAccount={createAccount}
                onOpenStudent={onOpenStudent}
              />
            )}
          </>
        )}
      </Async>
    </div>
  );
}

function SectionRoll({ sectionId, load, createAccount, onOpenStudent }: {
  sectionId: string;
  load: (sectionId: string) => Promise<PortalAccountList>;
  createAccount: (
    studentId: string, email: string, password: string,
  ) => Promise<{ userId: string; warning?: string }>;
  onOpenStudent: (studentId: string) => void;
}) {
  const read = useCallback(() => load(sectionId), [load, sectionId]);
  const [state, retry] = useAsync(read, [read]);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  return (
    <Async state={state} retry={retry} rows={6}>
      {(data) => {
        const without = data.learners.filter((x) => !x.hasAccount).length;
        return (
          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>
                  {data.section
                    ? `${data.section.gradeLevel} – ${data.section.name}`
                    : 'Section'}
                </h2>
                <p className="page-sub">
                  {data.learners.length} enrolled ·{' '}
                  {without === 0
                    ? 'every learner can sign in'
                    : `${without} without a portal account`}
                </p>
              </div>
            </div>

            {note && (
              <div className="notice" role="status">
                <span>{note}</span>
                <button className="btn btn-sm" onClick={() => setNote(null)}>Dismiss</button>
              </div>
            )}

            {data.learners.length === 0 ? (
              <EmptyState title="Nobody is enrolled in this section">
                Learners are placed into a section when they are admitted, or by
                transferring them from their record.
              </EmptyState>
            ) : (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th scope="col">Learner</th>
                      <th scope="col">LRN</th>
                      <th scope="col">Portal</th>
                      <th scope="col"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.learners.flatMap((x: PortalCandidate) => [
                      <tr key={x.studentId}>
                        <th scope="row">
                          <button className="link" onClick={() => onOpenStudent(x.studentId)}>
                            {x.displayName}
                          </button>
                        </th>
                        <td className="mono">
                          {x.lrn ?? <span className="faint">not yet issued</span>}
                        </td>
                        <td>
                          {x.hasAccount
                            ? <span className="mono">{x.email}</span>
                            : <span className="faint">no account</span>}
                        </td>
                        <td>
                          <div className="row-actions">
                            {!x.hasAccount && (
                              <button
                                className="btn btn-sm"
                                onClick={() => setOpenFor(openFor === x.studentId ? null : x.studentId)}
                              >
                                {openFor === x.studentId ? 'Close' : 'Give access'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>,
                      openFor === x.studentId ? (
                        <tr key={`${x.studentId}-form`} className="tbl-editor">
                          <td colSpan={4}>
                            <AccountForm
                              learner={x}
                              createAccount={createAccount}
                              onCancel={() => setOpenFor(null)}
                              onDone={(message) => {
                                setOpenFor(null);
                                setNote(message);
                                retry();
                              }}
                            />
                          </td>
                        </tr>
                      ) : null,
                    ])}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      }}
    </Async>
  );
}

function AccountForm({ learner, createAccount, onCancel, onDone }: {
  learner: PortalCandidate;
  createAccount: (
    studentId: string, email: string, password: string,
  ) => Promise<{ userId: string; warning?: string }>;
  onCancel: () => void;
  onDone: (message: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await createAccount(learner.studentId, email.trim(), password);
      onDone(r.warning
        ?? `${learner.displayName} can now sign in with ${email.trim()}. `
           + 'Give them the temporary password — they will choose their own.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the account.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-form">
      {error && <div className="err-banner" role="alert"><span>{error}</span></div>}
      <div className="form-grid">
        <label className="field">
          <span className="field-label">Email address *</span>
          <input
            className="input" type="email" value={email} disabled={busy}
            aria-label={`Email address for ${learner.displayName}`}
            onChange={(e) => setEmail(e.target.value)}
          />
          <span className="field-hint">
            Their sign-in name. Every account across all schools needs its own.
          </span>
        </label>
        <label className="field">
          <span className="field-label">Temporary password *</span>
          <input
            className="input" type="text" value={password} disabled={busy}
            aria-label={`Temporary password for ${learner.displayName}`}
            onChange={(e) => setPassword(e.target.value)}
          />
          <span className="field-hint">
            At least 8 characters, and read out rather than hidden — the learner
            has to be told it. They must change it on first sign-in.
          </span>
        </label>
      </div>
      <div className="row-actions">
        <button className="btn" type="button" onClick={onCancel} disabled={busy}>Cancel</button>
        <button
          className="btn btn-primary" type="button"
          disabled={busy || !email.trim() || password.length < 8}
          onClick={() => { void submit(); }}
        >
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </div>
    </div>
  );
}
