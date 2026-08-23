import { useMemo, useState } from 'react';
import type {
  DirectoryStudent, EnrollmentDraft, EnrollmentOptions, StudentDraft,
} from '../data/types';
import { Async, EmptyState, useAsync } from '../components/Async';

interface Props {
  yearId: string;
  yearLabel: string;
  load: (yearId: string, search?: string) => Promise<DirectoryStudent[]>;
  loadOptions: (yearId: string) => Promise<EnrollmentOptions>;
  admit: (
    student: StudentDraft, enrollment: EnrollmentDraft,
  ) => Promise<{ studentId: string; enrollmentId: string }>;
  onOpenStudent: (studentId: string) => void;
  /** Only shown to roles that hold students.write. */
  canAdmit: boolean;
}

/**
 * The learner directory, and the way in.
 *
 * Search runs on the server, not against a client-side array: a school
 * with 1,500 learners cannot ship the whole directory to the browser to
 * filter it, and doing so would hand every LRN to anyone who opens
 * devtools. RLS would have permitted the read; there is no reason to
 * make it.
 *
 * Grade level and section filter in the browser, because those come back
 * with the rows already and a round trip to narrow a list the user can
 * see is worse than useless.
 */
export function Students({
  yearId, yearLabel, load, loadOptions, admit, onOpenStudent, canAdmit,
}: Props) {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [grade, setGrade] = useState('');
  const [section, setSection] = useState('');
  const [adding, setAdding] = useState(false);
  const [state, retry] = useAsync(() => load(yearId, submitted), [yearId, submitted]);

  const rows = state.status === 'ready' ? state.data : [];
  const grades = useMemo(
    () => [...new Set(rows.map((r) => r.gradeLevel))].sort(), [rows],
  );
  const sections = useMemo(
    () => [...new Set(rows.filter((r) => !grade || r.gradeLevel === grade)
      .map((r) => r.section).filter((s): s is string => !!s))].sort(),
    [rows, grade],
  );
  const shown = rows.filter((r) =>
    (!grade || r.gradeLevel === grade) && (!section || r.section === section));

  if (adding) {
    return (
      <AddStudent
        yearId={yearId} yearLabel={yearLabel} loadOptions={loadOptions} admit={admit}
        onCancel={() => setAdding(false)}
        onAdded={(id) => { setAdding(false); retry(); onOpenStudent(id); }}
      />
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="greeting">Students</h1>
          <p className="page-sub">
            Learners enrolled for SY {yearLabel}. A learner keeps one record across
            years — moving section or grade level changes their enrolment, not their
            identity.
          </p>
        </div>
        <div className="spacer" />
        {canAdmit && (
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            + Add student
          </button>
        )}
      </div>

      <div className="panel">
        <div className="gb-toolbar">
          <form
            onSubmit={(e) => { e.preventDefault(); setSubmitted(query); }}
            style={{ display: 'contents' }}
          >
            <input
              className="input" type="search" value={query}
              placeholder="Search name, LRN or student number"
              aria-label="Search learners"
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="btn btn-sm" type="submit">Search</button>
          </form>

          <select
            className="input" value={grade} aria-label="Filter by grade level"
            onChange={(e) => { setGrade(e.target.value); setSection(''); }}
          >
            <option value="">All grade levels</option>
            {grades.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>

          <select
            className="input" value={section} aria-label="Filter by section"
            onChange={(e) => setSection(e.target.value)}
          >
            <option value="">All sections</option>
            {sections.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          <div className="spacer" />
          <span className="faint mono">
            {shown.length}{shown.length !== rows.length ? ` of ${rows.length}` : ''}
          </span>
        </div>

        <Async state={state} retry={retry} rows={8}>
          {() => (shown.length === 0 ? (
            <EmptyState title="No learners match">
              {submitted || grade || section
                ? 'Try a wider search, or clear the filters.'
                : 'Nobody is enrolled for this school year yet.'}
            </EmptyState>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th scope="col">Learner</th>
                    <th scope="col">Student no.</th>
                    <th scope="col">LRN</th>
                    <th scope="col">Grade &amp; section</th>
                    <th scope="col">Enrolment</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.studentId}>
                      <th scope="row">
                        <button className="link" onClick={() => onOpenStudent(r.studentId)}>
                          {r.displayName}
                        </button>
                      </th>
                      <td className="mono">{r.studentNumber ?? <span className="faint">—</span>}</td>
                      <td className="mono">{r.lrn ?? <span className="faint">not yet issued</span>}</td>
                      <td>{r.gradeLevel}{r.section ? ` – ${r.section}` : ''}</td>
                      <td><span className="pill" data-tone={r.enrollmentStatus === 'enrolled' ? 'ok' : undefined}>
                        {r.enrollmentStatus}
                      </span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </Async>
      </div>
    </div>
  );
}

/* ================================================================== *
 * ADD STUDENT
 * ================================================================== */

/**
 * Two panels, in the order the record is built: who the person is, then
 * where they are going. That order is not cosmetic — it is the schema.
 * The server creates a `students` row and an `enrollments` row, and the
 * form is shaped so a registrar can see that is what they are doing.
 */
function AddStudent({ yearId, yearLabel, loadOptions, admit, onCancel, onAdded }: {
  yearId: string;
  yearLabel: string;
  loadOptions: (yearId: string) => Promise<EnrollmentOptions>;
  admit: (s: StudentDraft, e: EnrollmentDraft) => Promise<{ studentId: string }>;
  onCancel: () => void;
  onAdded: (studentId: string) => void;
}) {
  const [options, retryOptions] = useAsync(() => loadOptions(yearId), [yearId]);
  const [student, setStudent] = useState<StudentDraft>({ firstName: '', lastName: '' });
  const [enrol, setEnrol] = useState<EnrollmentDraft>({
    academicYearId: yearId, gradeLevelId: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof StudentDraft) => (e: { target: { value: string } }) =>
    setStudent((s) => ({ ...s, [k]: e.target.value }));

  const opts = options.status === 'ready'
    ? options.data : { gradeLevels: [], sections: [] };
  const sectionsForGrade = opts.sections.filter(
    (s) => !enrol.gradeLevelId || s.gradeLevelId === enrol.gradeLevelId);

  const ready = student.firstName.trim() && student.lastName.trim() && enrol.gradeLevelId;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { studentId } = await admit(student, enrol);
      onAdded(studentId);
    } catch (err) {
      // "A learner with that LRN already exists in this school (Cruz, Juan)"
      // is written for a registrar. Show it as written.
      setError(err instanceof Error ? err.message : 'Could not add this learner.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <button className="link link-back" onClick={onCancel}>← Students</button>
          <h1 className="greeting">Add student</h1>
          <p className="page-sub">
            Creates the learner and enrols them for SY {yearLabel}.
          </p>
        </div>
      </div>

      <form onSubmit={submit}>
        {error && (
          <div className="err-banner" role="alert">
            <span>{error}</span>
            <button className="btn btn-sm" type="button" onClick={() => setError(null)}>
              Dismiss
            </button>
          </div>
        )}

        <div className="panel">
          <div className="panel-head"><h2>Learner</h2></div>
          <div className="panel-body form-grid">
            <Field label="Last name" required>
              <input className="input" value={student.lastName} onChange={set('lastName')} required />
            </Field>
            <Field label="First name" required>
              <input className="input" value={student.firstName} onChange={set('firstName')} required />
            </Field>
            <Field label="Middle name">
              <input className="input" value={student.middleName ?? ''} onChange={set('middleName')} />
            </Field>
            <Field label="Suffix" hint="Jr., III">
              <input className="input" value={student.suffix ?? ''} onChange={set('suffix')} />
            </Field>
            <Field label="LRN" hint="12 digits. Leave blank if not yet issued.">
              <input
                className="input mono" inputMode="numeric" maxLength={12}
                value={student.lrn ?? ''} onChange={set('lrn')}
              />
            </Field>
            <Field label="Student number">
              <input className="input mono" value={student.studentNumber ?? ''} onChange={set('studentNumber')} />
            </Field>
            <Field label="Sex">
              <select className="input" value={student.sex ?? ''} onChange={set('sex')}>
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </Field>
            <Field label="Date of birth">
              <input className="input" type="date" value={student.birthDate ?? ''} onChange={set('birthDate')} />
            </Field>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Enrolment</h2>
              <p className="page-sub">
                Where this learner sits for SY {yearLabel}. Next year is a new
                enrolment against the same learner, not a new learner.
              </p>
            </div>
          </div>
          <Async state={options} retry={retryOptions} rows={2}>
            {() => (
              <div className="panel-body form-grid">
                <Field label="Grade level" required>
                  <select
                    className="input" required value={enrol.gradeLevelId}
                    onChange={(e) => setEnrol((x) => ({
                      ...x, gradeLevelId: e.target.value, sectionId: '',
                    }))}
                  >
                    <option value="">Choose…</option>
                    {opts.gradeLevels.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Section"
                  hint={enrol.gradeLevelId ? undefined : 'Choose a grade level first'}
                >
                  <select
                    className="input" value={enrol.sectionId ?? ''}
                    disabled={!enrol.gradeLevelId}
                    onChange={(e) => setEnrol((x) => ({ ...x, sectionId: e.target.value }))}
                  >
                    <option value="">Unassigned</option>
                    {sectionsForGrade.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Date enrolled">
                  <input
                    className="input" type="date" value={enrol.dateEnrolled ?? ''}
                    onChange={(e) => setEnrol((x) => ({ ...x, dateEnrolled: e.target.value }))}
                  />
                </Field>
                <Field label="Previous school" hint="For a transferee">
                  <input
                    className="input" value={enrol.previousSchool ?? ''}
                    onChange={(e) => setEnrol((x) => ({ ...x, previousSchool: e.target.value }))}
                  />
                </Field>
              </div>
            )}
          </Async>
        </div>

        <div className="form-actions">
          <button className="btn" type="button" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" type="submit" disabled={!ready || busy}>
            {busy ? 'Adding…' : 'Add student'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, hint, required, children }: {
  label: string; hint?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">
        {label}{required && <span className="field-req" aria-hidden="true"> *</span>}
      </span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}
