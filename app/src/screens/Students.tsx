import { useMemo, useState } from 'react';
import type {
  DirectoryStudent, EnrollmentDraft, EnrollmentOptions, GradeLevelCensus,
  StudentDraft, StudentQuery, AdmitResult, NamesakeMatch,
} from '../data/types';
import { Async, EmptyState, useAsync } from '../components/Async';

/**
 * How many rows one request may return. A safety net rather than a page
 * size — there is no paging yet, and the screen says so out loud when it
 * hits this rather than quietly dropping the rest.
 */
const PAGE_LIMIT = 500;

interface Props {
  yearId: string;
  yearLabel: string;
  load: (yearId: string, query?: StudentQuery) => Promise<DirectoryStudent[]>;
  loadCensus: (yearId: string) => Promise<GradeLevelCensus[]>;
  loadOptions: (yearId: string) => Promise<EnrollmentOptions>;
  admit: (
    student: StudentDraft, enrollment: EnrollmentDraft | null,
    confirmNamesake?: boolean,
  ) => Promise<AdmitResult>;
  onOpenStudent: (studentId: string) => void;
  /** Only shown to roles that hold students.write. */
  canAdmit: boolean;
}

/**
 * The learner directory, and the way in.
 *
 * THE SCREEN DOES NOT OPEN ON A LIST. It opens on the school's grade
 * levels with a count each, and asks which one you want.
 *
 * That is a deliberate reversal. The first version loaded every learner
 * enrolled in the year the moment the menu item was clicked, then let
 * three dropdowns hide most of them again. Against seven demo learners
 * that reads as instant; against a real school of 1,500 it is a slow
 * screen that has also shipped every learner's LRN to the browser so
 * that the browser could decline to display them. RLS permitted the
 * read, so this was never a hole — but there was no reason to make it,
 * and no registrar has ever opened this screen wanting all 1,500 at
 * once. They want one grade level, and usually one section inside it.
 *
 * So: grade level first, and the filter runs in Postgres.
 *
 * Search is the exception and stays global — searching by name or LRN
 * is exactly the case where you do NOT know which grade level the
 * learner is in, and making someone guess before they may search would
 * be a worse screen than the one this replaces.
 */
export function Students({
  yearId, yearLabel, load, loadCensus, loadOptions, admit, onOpenStudent, canAdmit,
}: Props) {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [gradeId, setGradeId] = useState('');
  const [section, setSection] = useState('');
  const [adding, setAdding] = useState(false);

  const [census, retryCensus] = useAsync(() => loadCensus(yearId), [yearId, loadCensus]);

  // A search is school-wide and ignores the chosen grade level; without
  // one, nothing is fetched until a grade level is picked. `enabled` is
  // what keeps the "no list yet" state from being an empty-looking list.
  const enabled = !!gradeId || !!submitted;
  const [state, retry] = useAsync(
    () => (enabled
      ? load(yearId, {
        search: submitted || undefined,
        gradeLevelId: submitted ? undefined : gradeId,
        limit: PAGE_LIMIT,
      })
      : Promise.resolve([] as DirectoryStudent[])),
    [yearId, submitted, gradeId, load],
  );

  const levels = census.status === 'ready' ? census.data : [];
  const total = levels.reduce((n, g) => n + g.enrolled, 0);
  const chosen = levels.find((g) => g.id === gradeId);

  const rows = state.status === 'ready' ? state.data : [];
  // Section still narrows in the browser, and that is correct now: the
  // rows in hand are one grade level, so the list being filtered is
  // already the list on screen. This is the round trip that would be
  // worse than useless, as opposed to the one that was.
  const sections = useMemo(
    () => [...new Set(rows.map((r) => r.section).filter((x): x is string => !!x))].sort(),
    [rows],
  );
  const shown = rows.filter((r) => !section || r.section === section);

  // The cap is a safety net, not a paging model, and a truncated list
  // that does not say it is truncated is the worst of both. A registrar
  // concluding a learner is not enrolled because row 501 was dropped is
  // exactly the kind of quiet wrong answer this product exists to stop.
  const capped = rows.length >= PAGE_LIMIT;

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

      {/*
        The grade level bar. Every level the school runs, in order, with
        its own count — including the ones with nobody in them, because a
        school that has just been given Grades 11 and 12 needs to see
        that they are there and empty rather than assume they are
        missing.
      */}
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Grade levels</h2>
            <p className="page-sub">
              {total} learner{total === 1 ? '' : 's'} enrolled across the school.
              Choose a level to open its list.
            </p>
          </div>
        </div>
        <Async state={census} retry={retryCensus} rows={1}>
          {(all) => (
            <div className="panel-body">
              <div className="level-bar" role="group" aria-label="Grade level">
                {all.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className="level-chip"
                    aria-pressed={gradeId === g.id}
                    data-empty={g.enrolled === 0 ? 'true' : undefined}
                    onClick={() => {
                      // Choosing a level clears a running search, because
                      // the two answer different questions and showing a
                      // search result under a level heading would be a lie
                      // about what is on screen.
                      setGradeId(gradeId === g.id ? '' : g.id);
                      setSection('');
                      setQuery('');
                      setSubmitted('');
                    }}
                  >
                    <span className="level-name">{g.name}</span>
                    <span className="level-count mono">{g.enrolled}</span>
                    <span className="level-meta">
                      {g.sections} section{g.sections === 1 ? '' : 's'}
                      {g.keyStage === 'SHS' && <span className="level-tag">Senior High</span>}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </Async>
      </div>

      <div className="panel">
        <div className="gb-toolbar">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              // A search is school-wide, so it drops the level: the
              // learner you are hunting for is very often not in the
              // level you were last looking at.
              setSubmitted(query);
              if (query.trim()) { setGradeId(''); setSection(''); }
            }}
            style={{ display: 'contents' }}
          >
            <input
              className="input" type="search" value={query}
              placeholder="Search the whole school by name, LRN or student number"
              aria-label="Search learners"
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="btn btn-sm" type="submit">Search</button>
          </form>

          {(submitted || gradeId) && (
            <button
              className="btn btn-sm" type="button"
              onClick={() => {
                setQuery(''); setSubmitted(''); setGradeId(''); setSection('');
              }}
            >
              Clear
            </button>
          )}

          <select
            className="input" value={section} aria-label="Filter by section"
            disabled={!gradeId || sections.length === 0}
            onChange={(e) => setSection(e.target.value)}
          >
            <option value="">
              {gradeId ? 'All sections' : 'Choose a grade level first'}
            </option>
            {sections.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          <div className="spacer" />
          <span className="faint mono">
            {enabled
              ? `${shown.length}${shown.length !== rows.length ? ` of ${rows.length}` : ''}`
              : '—'}
          </span>
        </div>

        {capped && (
          <div className="err-banner" data-tone="warning" role="status">
            <span>
              Showing the first {PAGE_LIMIT} by name — there are more. Narrow this
              by section, or search for the learner you want. (Paging this list
              properly is not built yet.)
            </span>
          </div>
        )}

        {!enabled ? (
          <EmptyState title="Choose a grade level">
            Pick one above to see the learners in it, or search by name or LRN to
            look across the whole school. Nothing is loaded until you do —
            a school of 1,500 has no business sending all 1,500 to a screen
            showing forty.
          </EmptyState>
        ) : (
        <Async state={state} retry={retry} rows={8}>
          {() => (shown.length === 0 ? (
            <EmptyState title={submitted ? 'No learner matches' : `Nobody in ${chosen?.name ?? 'this level'} yet`}>
              {submitted
                ? `Nothing in SY ${yearLabel} matches “${submitted}”.`
                : section
                  ? 'Nobody in that section. Try another, or clear the section filter.'
                  : 'This grade level exists but has no learners enrolled this year. '
                    + 'Add one with “+ Add student”, or import a class list.'}
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
        )}
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
  admit: (
    s: StudentDraft, e: EnrollmentDraft | null, confirmNamesake?: boolean,
  ) => Promise<AdmitResult>;
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
  /*
    A namesake is not an error, so it does not go in `error`. It is a
    question with evidence attached: here are the learners already on
    file with this name — is yours one of them?
  */
  const [namesake, setNamesake] = useState<
    { message: string; matches: NamesakeMatch[] } | null>(null);

  const set = (k: keyof StudentDraft) => (e: { target: { value: string } }) =>
    setStudent((s) => ({ ...s, [k]: e.target.value }));

  const opts = options.status === 'ready'
    ? options.data : { gradeLevels: [], sections: [] };
  const sectionsForGrade = opts.sections.filter(
    (s) => !enrol.gradeLevelId || s.gradeLevelId === enrol.gradeLevelId);

  const ready = student.firstName.trim() && student.lastName.trim() && enrol.gradeLevelId;

  async function submit(e: React.FormEvent, confirmed = false) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    if (confirmed) setNamesake(null);
    try {
      const result = await admit(student, enrol, confirmed);
      if (result.status === 'needs_confirmation') {
        setNamesake({ message: result.message, matches: result.matches });
        return;
      }
      onAdded(result.studentId);
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

        {/*
          THE NAMESAKE WARNING.

          Deliberately not an error banner and deliberately not a
          refusal. A duplicate LRN is a certainty and throws; a duplicate
          NAME is a suspicion, and refusing it would leave a registrar
          unable to admit a real learner who happens to share a name with
          one already here. So the records are shown and the person
          decides — which is the only way this can be decided.
        */}
        {namesake && (
          <div className="panel" data-tone="warning">
            <div className="panel-head">
              <div>
                <h2>Someone by this name is already on file</h2>
                <p className="page-sub">{namesake.message}</p>
              </div>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th scope="col">Learner</th>
                    <th scope="col">LRN</th>
                    <th scope="col">Student number</th>
                    <th scope="col">Date of birth</th>
                  </tr>
                </thead>
                <tbody>
                  {namesake.matches.map((m) => (
                    <tr key={m.studentId}>
                      <th scope="row">{m.displayName}</th>
                      <td className="mono">{m.lrn ?? <span className="faint">none</span>}</td>
                      <td className="mono">{m.studentNumber ?? <span className="faint">none</span>}</td>
                      <td className="mono">{m.birthDate ?? <span className="faint">not recorded</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="panel-body row-actions">
              <button className="btn" type="button" onClick={() => setNamesake(null)}>
                Go back and check
              </button>
              <button
                className="btn btn-primary" type="button" disabled={busy}
                onClick={(e) => { void submit(e, true); }}
              >
                {busy ? 'Adding…' : 'This is a different person — add anyway'}
              </button>
            </div>
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
