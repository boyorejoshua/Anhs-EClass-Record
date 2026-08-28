import { useState } from 'react';
import type {
  ClassDraft, SectionDraft, SectionSetupOptions, SubjectCatalogue, SubjectDraft,
} from '../data/types';
import { Async, EmptyState, useAsync } from '../components/Async';
import { Subjects } from './SchoolSetup';

interface Props {
  yearId: string;
  yearLabel: string;
  load: (yearId: string) => Promise<SectionSetupOptions>;
  createSection: (draft: SectionDraft) => Promise<string>;
  createClass: (draft: ClassDraft) => Promise<string>;
  /* The subject list, mounted here as well as on School Setup — this is
     where a registrar discovers a subject is missing, mid-way through
     creating the class that needs it. */
  loadSubjects: () => Promise<SubjectCatalogue>;
  addSubject: (draft: SubjectDraft) => Promise<string>;
  setSubjectActive: (subjectId: string, isActive: boolean) => Promise<void>;
}

/**
 * Where a class actually comes from.
 *
 * Before this screen, nothing in the product created a class or a
 * section — not for a teacher, not for a registrar. The only way one
 * came to exist was seed data, or an import that happened to name one.
 * A school with no workbook yet, or a class the workbook doesn't
 * describe (a school introducing a new elective, say), had no way to
 * start.
 *
 * `classes.assign` gates both writes here, same as it already gates
 * `import_commit`'s create-a-class path — this is the direct route to
 * the same act, not a second one. Deliberately narrow: it works against
 * grade levels, subjects and teacher accounts that already exist. It
 * does not create those — that is a one-time curriculum/onboarding
 * step, not something a registrar does mid-term.
 */
export function ClassesAndSections({
  yearId, yearLabel, load, createSection, createClass,
  loadSubjects, addSubject, setSubjectActive,
}: Props) {
  const [state, retry] = useAsync(() => load(yearId), [yearId]);
  const [addingSection, setAddingSection] = useState(false);
  const [addingClassFor, setAddingClassFor] = useState<string | null>(null);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="greeting">Classes &amp; Sections</h1>
          <p className="page-sub">
            SY {yearLabel}. A section belongs to one grade level; a class is one
            subject taught to one section. Creating a class here fills its roster
            automatically from the section's enrolment — nobody types a student
            list twice.
          </p>
        </div>
      </div>

      <Async state={state} retry={retry} rows={6}>
        {(options) => (options.permissions.canAssign ? (
          <>
            {addingSection && (
              <AddSection
                options={options}
                onCancel={() => setAddingSection(false)}
                onCreate={async (draft) => {
                  await createSection({ ...draft, academicYearId: yearId });
                  setAddingSection(false);
                  retry();
                }}
              />
            )}

            <div className="panel">
              <div className="panel-head">
                <div>
                  <h2>Sections</h2>
                  <p className="page-sub">{options.sections.length} this year</p>
                </div>
                <div className="spacer" />
                {!addingSection && (
                  <button className="btn btn-primary" onClick={() => setAddingSection(true)}>
                    + Add section
                  </button>
                )}
              </div>

              {options.sections.length === 0 ? (
                <EmptyState title="No sections yet">
                  Add the first section for SY {yearLabel} above.
                </EmptyState>
              ) : (
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th scope="col">Grade level</th>
                        <th scope="col">Section</th>
                        <th scope="col">Adviser</th>
                        <th scope="col">Room</th>
                        <th scope="col" className="num">Classes</th>
                        <th scope="col" />
                      </tr>
                    </thead>
                    <tbody>
                      {options.sections.map((sec) => (
                        <tr key={sec.id}>
                          <th scope="row">{sec.gradeLevel}</th>
                          <td>{sec.name}</td>
                          <td>{sec.adviserName ?? <span className="faint">unassigned</span>}</td>
                          <td>{sec.room ?? <span className="faint">—</span>}</td>
                          <td className="num mono">{sec.classCount}</td>
                          <td>
                            <button
                              className="btn btn-sm"
                              onClick={() => setAddingClassFor(
                                addingClassFor === sec.id ? null : sec.id)}
                            >
                              + Class
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {addingClassFor && (
              <AddClass
                section={options.sections.find((s) => s.id === addingClassFor)!}
                options={options}
                onCancel={() => setAddingClassFor(null)}
                onCreate={async (draft) => {
                  await createClass({ ...draft, academicYearId: yearId, sectionId: addingClassFor });
                  setAddingClassFor(null);
                  retry();
                }}
              />
            )}

            <div className="panel">
              <div className="panel-head">
                <div>
                  <h2>Classes</h2>
                  <p className="page-sub">{options.classes.length} this year</p>
                </div>
              </div>
              {options.classes.length === 0 ? (
                <EmptyState title="No classes yet">
                  Add a section above, then use its "+ Class" button.
                </EmptyState>
              ) : (
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th scope="col">Section</th>
                        <th scope="col">Subject</th>
                        <th scope="col">Teacher</th>
                      </tr>
                    </thead>
                    <tbody>
                      {options.classes.map((c) => {
                        const sec = options.sections.find((s) => s.id === c.sectionId);
                        return (
                          <tr key={c.id}>
                            <th scope="row">
                              {sec ? `${sec.gradeLevel} – ${sec.name}` : '—'}
                            </th>
                            <td>{c.subject}</td>
                            <td>{c.teacherName ?? <span className="faint">unassigned</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="panel">
            <EmptyState title="Not permitted">
              Your account cannot create classes or sections. Ask a registrar or
              administrator.
            </EmptyState>
          </div>
        ))}
      </Async>

      {/*
        Outside the Async above on purpose. That block renders "Not
        permitted" for an account that cannot create classes, and the
        subject list is readable by more people than that — hiding it
        behind a refusal about something else would be its own small lie.
      */}
      <Subjects load={loadSubjects} add={addSubject} setActive={setSubjectActive} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function AddSection({ options, onCancel, onCreate }: {
  options: SectionSetupOptions;
  onCancel: () => void;
  onCreate: (draft: Omit<SectionDraft, 'academicYearId'>) => Promise<void>;
}) {
  const [gradeLevelId, setGradeLevelId] = useState(options.gradeLevels[0]?.id ?? '');
  const [name, setName] = useState('');
  const [adviserUserId, setAdviserUserId] = useState('');
  const [room, setRoom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onCreate({
        gradeLevelId, name,
        adviserUserId: adviserUserId || null,
        room: room || null,
      });
    } catch (err) {
      // "a section named ... already exists" is written for a
      // registrar; show it as written.
      setError(err instanceof Error ? err.message : 'Could not create this section.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head"><h2>Add section</h2></div>
      <form onSubmit={submit}>
        {error && (
          <div className="err-banner" role="alert">
            <span>{error}</span>
            <button className="btn btn-sm" type="button" onClick={() => setError(null)}>
              Dismiss
            </button>
          </div>
        )}
        <div className="panel-body form-grid">
          <label className="field">
            <span className="field-label">Grade level</span>
            <select
              className="input" value={gradeLevelId}
              onChange={(e) => setGradeLevelId(e.target.value)}
            >
              {options.gradeLevels.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="field-label">
              Section name <span className="field-req" aria-hidden="true">*</span>
            </span>
            <input
              className="input" value={name} required
              placeholder="e.g. Pearl" onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">Adviser</span>
            <select
              className="input" value={adviserUserId}
              onChange={(e) => setAdviserUserId(e.target.value)}
            >
              <option value="">Unassigned</option>
              {options.teachers.map((t) => <option key={t.id} value={t.id}>{t.displayName}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Room</span>
            <input className="input" value={room} onChange={(e) => setRoom(e.target.value)} />
          </label>
        </div>
        <div className="form-actions">
          <button className="btn" type="button" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" type="submit" disabled={!gradeLevelId || !name.trim() || busy}>
            {busy ? 'Adding…' : 'Add section'}
          </button>
        </div>
      </form>
    </div>
  );
}

function AddClass({ section, options, onCancel, onCreate }: {
  section: SectionSetupOptions['sections'][number];
  options: SectionSetupOptions;
  onCancel: () => void;
  onCreate: (draft: Omit<ClassDraft, 'academicYearId' | 'sectionId'>) => Promise<void>;
}) {
  const available = options.subjects.filter((s) =>
    !options.classes.some((c) => c.sectionId === section.id && c.subjectId === s.id));
  const [subjectId, setSubjectId] = useState(available[0]?.id ?? '');
  const [teacherUserId, setTeacherUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onCreate({ subjectId, teacherUserId: teacherUserId || null });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create this class.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Add class</h2>
          <p className="page-sub">{section.gradeLevel} – {section.name}</p>
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
        {available.length === 0 ? (
          <div className="panel-body">
            <EmptyState title="Every subject already has a class here">
              This section already has a class for each subject this school offers.
            </EmptyState>
          </div>
        ) : (
          <>
            <div className="panel-body form-grid">
              <label className="field">
                <span className="field-label">Subject</span>
                <select
                  className="input" value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                >
                  {available.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Teacher</span>
                <select
                  className="input" value={teacherUserId}
                  onChange={(e) => setTeacherUserId(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {options.teachers.map((t) => <option key={t.id} value={t.id}>{t.displayName}</option>)}
                </select>
              </label>
            </div>
            <div className="form-actions">
              <button className="btn" type="button" onClick={onCancel} disabled={busy}>Cancel</button>
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? 'Adding…' : 'Add class'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
