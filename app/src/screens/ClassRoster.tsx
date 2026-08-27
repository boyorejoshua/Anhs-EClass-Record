import { useMemo, useState } from 'react';
import type { LearnerNameFix, LearnerToAdd, MyClassRoster } from '../data/types';
import { Async, EmptyState, useAsync } from '../components/Async';

interface Props {
  classId: string;
  load: (classId: string) => Promise<MyClassRoster>;
  add: (learner: LearnerToAdd) => Promise<string>;
  remove: (classEnrollmentId: string) => Promise<void>;
  rename: (fix: LearnerNameFix) => Promise<void>;
}

/**
 * Who is in this class — and the way to change that.
 *
 * ⚠️ THIS EXISTS BECAUSE THE PREVIOUS RELEASE HAD A DEAD END. A teacher
 * could create their own class in a section they named themselves, and
 * the roster fills from the section's enrolment — which for a brand-new
 * section is nobody. So the feature's happy path was: make a class,
 * land in an empty gradebook, and find no way at all to put a learner
 * in it.
 *
 * THE ORDER OF THE TWO PATHS IS THE DESIGN. Picking an existing learner
 * comes first and typing a name is the fallback, because typing a name
 * that already exists is exactly how a school ends up with two records
 * for one child — the defect an LRN exists to prevent and the one V0
 * shipped. The server refuses a same-name match outright unless the
 * teacher confirms it really is a different learner.
 *
 * A learner added by typing has NO LRN. That is not a gap this screen
 * papers over: it says so on the row, because the registrar has to
 * finish the record before the division office can reconcile it.
 */
export function ClassRoster({ classId, load, add, remove, rename }: Props) {
  const [state, retry] = useAsync(() => load(classId), [classId, load]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      retry();
    } catch (e) {
      // The server writes these for a person — "Bautista, Nena is
      // already on file at this school" — so show them as they are.
      setError(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {error && (
        <div className="err-banner" role="alert">
          <span>{error}</span>
          <button className="btn btn-sm" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <Async state={state} retry={retry} rows={6}>
        {(data) => (
          <>
            {data.permissions.canWrite && (
              <AddLearner
                data={data}
                busy={busy === 'add'}
                onAdd={(learner) => run('add', () => add(learner))}
              />
            )}

            <div className="panel">
              <div className="panel-head">
                <div>
                  <h2>Class list</h2>
                  <p className="page-sub">
                    {data.roster.length} learner{data.roster.length === 1 ? '' : 's'}
                  </p>
                </div>
              </div>

              {data.roster.length === 0 ? (
                <EmptyState title="Nobody is in this class yet">
                  {data.permissions.canWrite
                    ? 'Add learners above. If the registrar has already admitted them, '
                      + 'pick them from the list rather than typing their name.'
                    : 'The registrar enrols learners into a section, and they appear here.'}
                </EmptyState>
              ) : (
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th scope="col">Learner</th>
                        <th scope="col">Sex</th>
                        <th scope="col">LRN</th>
                        {data.permissions.canWrite && <th scope="col" className="num" />}
                      </tr>
                    </thead>
                    <tbody>
                      {data.roster.map((r) => (editing === r.studentId ? (
                        <tr key={r.classEnrollmentId}>
                          <td colSpan={data.permissions.canWrite ? 4 : 3}>
                            <RenameLearner
                              row={r}
                              others={[...data.roster, ...data.candidates]
                                .filter((x) => ('studentId' in x ? x.studentId : '') !== r.studentId)}
                              busy={busy === `rename-${r.studentId}`}
                              onCancel={() => setEditing(null)}
                              onSave={(fix) => run(`rename-${r.studentId}`, async () => {
                                await rename(fix);
                                setEditing(null);
                              })}
                            />
                          </td>
                        </tr>
                      ) : (
                        <tr key={r.classEnrollmentId}>
                          <th scope="row">
                            {r.displayName}
                            {data.permissions.canWrite && (
                              <button
                                className="link tbl-inline-edit"
                                title="Correct the spelling"
                                onClick={() => setEditing(r.studentId)}
                              >
                                Edit name
                              </button>
                            )}
                          </th>
                          <td>{r.sex ?? <span className="faint">—</span>}</td>
                          <td className="mono">
                            {r.lrn ?? (
                              // Not decoration. Until the registrar
                              // supplies one, this learner cannot be
                              // reconciled with the division office.
                              <span className="pill" title="The registrar still owes this record an LRN">
                                Needs LRN
                              </span>
                            )}
                          </td>
                          {data.permissions.canWrite && (
                            <td className="num">
                              {r.hasScores ? (
                                <span
                                  className="faint"
                                  title="Removing them would delete their recorded work"
                                >
                                  Has marks
                                </span>
                              ) : (
                                <button
                                  className="btn btn-sm"
                                  disabled={busy === r.classEnrollmentId}
                                  onClick={() => run(r.classEnrollmentId,
                                    () => remove(r.classEnrollmentId))}
                                >
                                  {busy === r.classEnrollmentId ? '…' : 'Remove'}
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      )))}
                    </tbody>
                  </table>
                </div>
              )}

              {data.permissions.canWrite && (
                <div className="panel-body">
                  <p className="menu-note" style={{ margin: 0 }}>
                    <b>Edit name</b> corrects a spelling — nothing else. It cannot
                    reach the LRN, sex, birth date or enrolment, which are the
                    registrar's. Safe here in a way it was not in the old system,
                    where the name was the key and a correction orphaned the marks
                    filed under the old spelling.
                    <br /><br />
                    <b>Remove</b> takes a learner out of THIS class only. It never
                    withdraws them from the school, and it is refused once any mark
                    has been recorded — ask the registrar to transfer them instead.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </Async>
    </>
  );
}

/* ------------------------------------------------------------------ */

function AddLearner({ data, busy, onAdd }: {
  data: MyClassRoster;
  busy: boolean;
  onAdd: (learner: LearnerToAdd) => void;
}) {
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [studentId, setStudentId] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [sex, setSex] = useState<'' | 'male' | 'female'>('');
  const [confirmNew, setConfirmNew] = useState(false);

  // Warn before submitting rather than letting the server refuse: the
  // teacher can still switch to picking the existing learner instead.
  //
  // Scans the ROSTER as well as the candidates. Candidates are only the
  // learners NOT already in this class, so checking that list alone
  // would miss the commonest case of all — retyping the name of
  // somebody who is sitting in the class already. The server checks
  // every learner in the school; this has to match, or the client waves
  // through exactly what the server then refuses.
  const clash = useMemo(() => {
    if (mode !== 'new') return null;
    if (!firstName.trim() || !lastName.trim()) return null;
    const norm = (x: string) => x.toLowerCase().replace(/\s+/g, ' ').trim();
    const want = `${norm(lastName)}, ${norm(firstName)}`;
    const hit = [...data.roster, ...data.candidates]
      .find((c) => norm(c.displayName) === want);
    return hit?.displayName ?? null;
  }, [mode, firstName, lastName, data.roster, data.candidates]);

  const valid = mode === 'existing'
    ? studentId !== ''
    : firstName.trim() !== '' && lastName.trim() !== '' && (!clash || confirmNew);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onAdd(mode === 'existing'
      ? { classId: data.classId, studentId }
      : {
          classId: data.classId,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          sex: sex || null,
          confirmNewPerson: confirmNew,
        });
    setStudentId('');
    setFirstName('');
    setLastName('');
    setSex('');
    setConfirmNew(false);
  }

  return (
    <form className="panel" onSubmit={submit}>
      <div className="panel-head">
        <div>
          <h2>Add a learner</h2>
          <p className="page-sub">
            Pick someone the school already has on file. Type a name only if this
            learner is genuinely new — the registrar will need to add their LRN.
          </p>
        </div>
      </div>

      <div className="seg" role="group" aria-label="How to add" style={{ margin: '0 0 12px' }}>
        <button type="button" aria-pressed={mode === 'existing'} onClick={() => setMode('existing')}>
          Already on file ({data.candidates.length})
        </button>
        <button type="button" aria-pressed={mode === 'new'} onClick={() => setMode('new')}>
          New to the school
        </button>
      </div>

      {mode === 'existing' ? (
        data.candidates.length === 0 ? (
          <EmptyState title="Everyone on file is already in this class">
            Use “New to the school” for a learner the registrar has not admitted yet.
          </EmptyState>
        ) : (
          <div className="form-grid">
            <label className="picker">
              <span className="field-label">Learner *</span>
              <select
                className="input" value={studentId} disabled={busy}
                onChange={(e) => setStudentId(e.target.value)}
              >
                <option value="">Choose a learner…</option>
                {data.candidates.map((c) => (
                  <option key={c.studentId} value={c.studentId}>
                    {c.displayName}{c.lrn ? ` · ${c.lrn}` : ' · no LRN yet'}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )
      ) : (
        <>
          <div className="form-grid">
            <label className="picker">
              <span className="field-label">First name *</span>
              <input
                className="input" value={firstName} disabled={busy}
                onChange={(e) => { setConfirmNew(false); setFirstName(e.target.value); }}
              />
            </label>
            <label className="picker">
              <span className="field-label">Last name *</span>
              <input
                className="input" value={lastName} disabled={busy}
                onChange={(e) => { setConfirmNew(false); setLastName(e.target.value); }}
              />
            </label>
            <label className="picker">
              <span className="field-label">Sex</span>
              <select
                className="input" value={sex} disabled={busy}
                onChange={(e) => setSex(e.target.value as '' | 'male' | 'female')}
              >
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </label>
          </div>

          {clash && (
            <div className="notice" role="alert" style={{ borderLeftColor: 'var(--error)' }}>
              <label className="check">
                <input
                  type="checkbox" checked={confirmNew} disabled={busy}
                  onChange={(e) => setConfirmNew(e.target.checked)}
                />
                <span>
                  <b>{clash}</b> is already on file. Switch to “Already on file” and pick
                  them — or tick this if yours is a different learner with the same name.
                </span>
              </label>
            </div>
          )}

          <p className="field-hint">
            A learner added this way has no LRN yet. They will appear in the registrar's
            Students list marked “Needs LRN”.
          </p>
        </>
      )}

      <div className="row-actions">
        <button className="btn btn-primary" type="submit" disabled={busy || !valid}>
          {busy ? 'Adding…' : 'Add to class'}
        </button>
      </div>
    </form>
  );
}


/* ------------------------------------------------------------------ *
 * Correcting a spelling
 *
 * The legacy screen let a teacher retype any name in place, which was
 * the right capability on the wrong foundation: there the name WAS the
 * key, so a correction created a second learner and orphaned the marks
 * filed under the old spelling. Here identity is a uuid and scores hang
 * off the class-enrolment id, so this edits a display string and
 * nothing else.
 * ------------------------------------------------------------------ */
function RenameLearner({ row, others, busy, onCancel, onSave }: {
  row: MyClassRoster['roster'][number];
  others: Array<{ displayName: string }>;
  busy: boolean;
  onCancel: () => void;
  onSave: (fix: LearnerNameFix) => void;
}) {
  const [firstName, setFirstName] = useState(row.firstName);
  const [lastName, setLastName] = useState(row.lastName);
  const [confirmNamesake, setConfirmNamesake] = useState(false);

  // Renaming ONTO somebody else's name looks exactly like creating a
  // duplicate, so it is warned about the same way — and the server
  // refuses it identically if this is bypassed.
  const clash = useMemo(() => {
    const norm = (x: string) => x.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!firstName.trim() || !lastName.trim()) return null;
    const want = `${norm(lastName)}, ${norm(firstName)}`;
    return others.find((o) => norm(o.displayName) === want)?.displayName ?? null;
  }, [firstName, lastName, others]);

  const valid = firstName.trim() !== '' && lastName.trim() !== '' && (!clash || confirmNamesake);

  return (
    <div className="inline-form">
      <p className="field-label">Correcting the spelling of {row.displayName}</p>
      <div className="form-grid">
        <label className="picker">
          <span className="field-label">First name *</span>
          <input
            className="input" value={firstName} disabled={busy} autoFocus
            onChange={(e) => { setConfirmNamesake(false); setFirstName(e.target.value); }}
          />
        </label>
        <label className="picker">
          <span className="field-label">Last name *</span>
          <input
            className="input" value={lastName} disabled={busy}
            onChange={(e) => { setConfirmNamesake(false); setLastName(e.target.value); }}
          />
        </label>
      </div>

      {clash && (
        <div className="notice" role="alert" style={{ borderLeftColor: 'var(--error)' }}>
          <label className="check">
            <input
              type="checkbox" checked={confirmNamesake} disabled={busy}
              onChange={(e) => setConfirmNamesake(e.target.checked)}
            />
            <span>
              <b>{clash}</b> already has that name. Tick this only if they are
              genuinely two different learners.
            </span>
          </label>
        </div>
      )}

      <p className="field-hint">
        This changes the name only. Their marks, LRN and enrolment are untouched.
      </p>

      <div className="row-actions">
        <button
          className="btn btn-primary btn-sm" disabled={busy || !valid}
          onClick={() => onSave({
            studentId: row.studentId,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            confirmNamesake,
          })}
        >
          {busy ? 'Saving…' : 'Save name'}
        </button>
        <button className="btn btn-sm" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
