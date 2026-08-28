import { useEffect, useMemo, useState } from 'react';
import type {
  AcademicYear, ClassSummary, MyClassDraft, MyClassSetupOptions, SubmissionStatus,
} from '../data/types';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/Async';
import { displayStatus, pct } from '../lib/status';

interface Props {
  classes: ClassSummary[];
  year: AcademicYear;
  periodId: string;
  onOpenClass: (classId: string, tab?: 'gradebook' | 'attendance' | 'submission') => void;
  /** Set when the screen is being used to pick a class for a specific task. */
  purpose?: { label: string; tab: 'gradebook' | 'attendance' | 'submission' };
  /** Absent when the role has no teaching load to add to (a registrar picking a class). */
  addClass?: {
    loadOptions: (yearId: string) => Promise<MyClassSetupOptions>;
    create: (draft: MyClassDraft) => Promise<string>;
    onCreated: () => void;
  };
}

type Filter = 'all' | SubmissionStatus;

const FILTERS: Array<[Filter, string]> = [
  ['all', 'All'],
  ['draft', 'Draft'],
  ['in_progress', 'In progress'],
  ['returned', 'Returned'],
  ['submitted', 'Submitted'],
  ['approved', 'Approved'],
  ['finalized', 'Finalized'],
  ['published', 'Published'],
];

/**
 * My Classes.
 *
 * Previously a menu entry with no screen — it rendered the dashboard.
 *
 * The filter set includes `in_progress`, which is NOT a database status:
 * migration 0007's CHECK allows draft/submitted/returned/approved/
 * finalized/published/reopened and nothing else. It is derived here from
 * "draft, but some scores are in", because that is the distinction a
 * teacher actually cares about — an untouched class and a half-finished
 * one are the same row to the database and very different to a person.
 */
export function MyClasses({
  classes, year, periodId, onOpenClass, purpose, addClass,
}: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);

  const period = year.periods.find((p) => p.id === periodId);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return classes.filter((c) => {
      const shown = displayStatus(c, periodId);
      if (filter !== 'all' && shown !== filter) return false;
      if (!q) return true;
      return [c.subject, c.section, c.gradeLevel, c.subjectCode]
        .some((f) => f.toLowerCase().includes(q));
    });
  }, [classes, filter, query, periodId]);

  // Only offer filters that match something, so the control never leads
  // to a guaranteed-empty result.
  const available = useMemo(() => {
    const present = new Set(classes.map((c) => displayStatus(c, periodId)));
    return FILTERS.filter(([f]) => f === 'all' || present.has(f as SubmissionStatus));
  }, [classes, periodId]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="greeting">{purpose ? purpose.label : 'My classes'}</h1>
          <p className="page-sub">
            {period?.name} · SY {year.label} · {classes.length} class
            {classes.length === 1 ? '' : 'es'}
          </p>
        </div>
        {/*
          A teacher creates the class they themselves teach. The server
          forces them as its teacher (migration 0032), so this button
          cannot produce a class belonging to anybody else. Hidden when
          the screen is being used as a picker — adding a class is not
          what somebody choosing one came here to do.
        */}
        {addClass && !purpose && !adding && (
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            + Add class
          </button>
        )}
      </div>

      {addClass && adding && (
        <AddMyClass
          yearId={year.id}
          yearLabel={year.label}
          loadOptions={addClass.loadOptions}
          create={addClass.create}
          onCancel={() => setAdding(false)}
          onCreated={() => { setAdding(false); addClass.onCreated(); }}
        />
      )}

      <div className="panel">
        <div className="gb-toolbar">
          <div className="seg" role="group" aria-label="Filter by status">
            {available.map(([f, label]) => (
              <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {label}
              </button>
            ))}
          </div>
          <div className="spacer" />
          <label className="sr-only" htmlFor="class-search">Search classes</label>
          <input
            id="class-search"
            className="input"
            type="search"
            placeholder="Search subject or section…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title={classes.length === 0 ? 'No classes assigned' : 'Nothing matches'}
            action={
              classes.length > 0 && (
                <button className="btn btn-sm" onClick={() => { setFilter('all'); setQuery(''); }}>
                  Clear filters
                </button>
              )
            }
          >
            {classes.length === 0
              ? addClass
                // No longer true that only an administrator can do this,
                // and telling a teacher to go and wait for one when the
                // button is right there would be the worst of both.
                ? 'Add the class you teach, or wait for the registrar to assign you one.'
                : 'An administrator assigns teaching loads. Once a class is assigned to you it appears here.'
              : `No class matches this filter in ${period?.name}.`}
          </EmptyState>
        ) : (
          <div className="panel-body">
            <div className="grid-cards">
              {rows.map((c) => {
                const done = c.completeness[periodId];
                const p = pct(done);
                return (
                  <div className="class-card" key={c.id}>
                    <div className="row">
                      <h3>{c.gradeLevel} – {c.section}</h3>
                      <div className="spacer" />
                      <StatusBadge status={displayStatus(c, periodId)} />
                    </div>
                    <div className="meta">{c.subject}</div>

                    <div className="cc-meta">
                      <span>{c.studentCount} learners</span>
                      {c.scheduleNote && <span>{c.scheduleNote}</span>}
                      {c.room && <span>{c.room}</span>}
                    </div>

                    <div className="cc-progress" title={done ? `${done.scored} of ${done.total} scores entered` : undefined}>
                      <div className="cc-bar"><span style={{ width: `${p}%` }} data-full={p === 100} /></div>
                      <span className="mono cc-pct">{p}%</span>
                    </div>

                    <div className="cc-actions">
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => onOpenClass(c.id, purpose?.tab ?? 'gradebook')}
                      >
                        {purpose ? purpose.label.replace(/^Pick a class.*/, 'Open') : 'Open class'}
                      </button>
                      {!purpose && (
                        <button className="btn btn-sm" onClick={() => onOpenClass(c.id, 'submission')}>
                          Submission
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Add a class you teach
 *
 * The legacy Setup screen's top bar in one form: grade level, section,
 * subject, and you are teaching it. The legacy version took the section
 * as free text and made a new record book for every spelling of it, so
 * "PEARL", "Pearl" and "pearl" were three classes. Here the section is
 * a PICKER first and free text second — and even the free-text path is
 * matched case-insensitively on the server, so a typo joins the section
 * that exists rather than forking it.
 * ------------------------------------------------------------------ */
function AddMyClass({ yearId, yearLabel, loadOptions, create, onCancel, onCreated }: {
  yearId: string;
  yearLabel: string;
  loadOptions: (yearId: string) => Promise<MyClassSetupOptions>;
  create: (draft: MyClassDraft) => Promise<string>;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [options, setOptions] = useState<MyClassSetupOptions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sectionId, setSectionId] = useState('');
  const [gradeLevelId, setGradeLevelId] = useState('');
  const [sectionName, setSectionName] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [scheduleNote, setScheduleNote] = useState('');
  const [room, setRoom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Loaded here rather than by the parent: the options are only needed
  // once somebody opens the form, and a teacher who never adds a class
  // should not pay for the read on every visit to My Classes.
  //
  // `live` guards the setState against a form closed mid-flight, which
  // would otherwise warn about updating an unmounted component.
  useEffect(() => {
    let live = true;
    loadOptions(yearId)
      .then((o) => { if (live) setOptions(o); })
      .catch((e) => { if (live) setLoadError(e instanceof Error ? e.message : 'Could not load.'); });
    return () => { live = false; };
  }, [loadOptions, yearId]);

  const newSection = sectionId === '__new';
  const valid = subjectId !== ''
    && (newSection ? (gradeLevelId !== '' && sectionName.trim() !== '') : sectionId !== '');

  /*
    The grade the class is FOR — from the picked section, or from the
    grade the teacher chose when adding one that does not exist yet.
    Everything about the subject list follows from this.
  */
  const chosenGradeId = newSection
    ? gradeLevelId
    : options?.sections.find((x) => x.id === sectionId)?.gradeLevelId ?? '';

  // No grade picked yet means no narrowing to do — show everything.
  // An UNMAPPED subject (empty `gradeLevelIds`) is offered at every
  // grade, which is how the server reads an empty curriculum map.
  const subjectChoices = useMemo(() => {
    if (!options) return [];
    if (!chosenGradeId) return options.subjects;
    return options.subjects.filter(
      (x) => x.gradeLevelIds.length === 0 || x.gradeLevelIds.includes(chosenGradeId));
  }, [options, chosenGradeId]);

  // Changing the section can strand a subject that was valid a moment
  // ago. Clearing it is better than submitting a Grade 10 subject to a
  // Grade 7 section because the dropdown no longer showed it.
  useEffect(() => {
    if (subjectId && !subjectChoices.some((x) => x.id === subjectId)) setSubjectId('');
  }, [subjectChoices, subjectId]);

  // Warn BEFORE submitting rather than letting the server refuse: the
  // teacher can still fix the selection while the form is open.
  const already = useMemo(() => {
    if (!options || newSection || !sectionId || !subjectId) return false;
    return options.myClasses.some(
      (c) => c.sectionId === sectionId && c.subjectId === subjectId);
  }, [options, sectionId, subjectId, newSection]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await create({
        academicYearId: yearId,
        subjectId,
        sectionId: newSection ? null : sectionId,
        gradeLevelId: newSection ? gradeLevelId : null,
        sectionName: newSection ? sectionName.trim() : null,
        scheduleNote: scheduleNote.trim() || null,
        room: room.trim() || null,
      });
      onCreated();
    } catch (err) {
      // The server writes these for a person — "that subject is already
      // taught in this section by Maria Santos" — so show them as-is.
      setError(err instanceof Error ? err.message : 'Could not add the class.');
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="panel">
        <div className="err-banner" role="alert"><span>{loadError}</span></div>
        <div className="row-actions">
          <button className="btn" onClick={onCancel}>Close</button>
        </div>
      </div>
    );
  }
  if (!options) return <div className="panel"><p className="page-sub">Loading…</p></div>;

  return (
    <form className="panel" onSubmit={submit}>
      <div className="panel-head">
        <div>
          <h2>Add a class you teach</h2>
          <p className="page-sub">
            SY {yearLabel}. You will be its teacher. The roster fills itself from
            the section's enrolment — you never type a student list.
          </p>
        </div>
      </div>

      {error && <div className="err-banner" role="alert"><span>{error}</span></div>}

      <div className="form-grid">
        <label className="picker">
          <span className="field-label">Section *</span>
          <select
            className="input" value={sectionId} disabled={busy}
            onChange={(e) => setSectionId(e.target.value)}
          >
            <option value="">Choose a section…</option>
            {options.sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.gradeLevel} – {s.name} ({s.learnerCount} learners)
              </option>
            ))}
            <option value="__new">+ A section not listed…</option>
          </select>
        </label>

        {newSection && (
          <>
            <label className="picker">
              <span className="field-label">Grade level *</span>
              <select
                className="input" value={gradeLevelId} disabled={busy}
                onChange={(e) => setGradeLevelId(e.target.value)}
              >
                <option value="">Choose…</option>
                {options.gradeLevels.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </label>
            <label className="picker">
              <span className="field-label">Section name *</span>
              <input
                className="input" value={sectionName} disabled={busy}
                onChange={(e) => setSectionName(e.target.value)} placeholder="Sampaguita"
              />
            </label>
          </>
        )}

        <label className="picker">
          <span className="field-label">Subject *</span>
          <select
            className="input" value={subjectId} disabled={busy}
            onChange={(e) => setSubjectId(e.target.value)}
          >
            <option value="">Choose a subject…</option>
            {subjectChoices.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
          {chosenGradeId && subjectChoices.length === 0 && (
            <span className="field-hint">
              No subject is set up for that grade yet. A registrar or administrator
              can set which grades take a subject on the Subjects list.
            </span>
          )}
        </label>

        <label className="picker">
          <span className="field-label">Schedule</span>
          <input
            className="input" value={scheduleNote} disabled={busy}
            onChange={(e) => setScheduleNote(e.target.value)} placeholder="MWF 8:00-9:00"
          />
        </label>
        <label className="picker">
          <span className="field-label">Room</span>
          <input
            className="input" value={room} disabled={busy}
            onChange={(e) => setRoom(e.target.value)} placeholder="Room 204"
          />
        </label>
      </div>

      {newSection && (
        <p className="field-hint">
          If a section with this name already exists at that grade level, your class
          joins it — a different capitalisation will not create a second one. You do
          not become its adviser; the registrar appoints that.
        </p>
      )}
      {already && (
        <p className="signin-error">You already teach this subject in this section.</p>
      )}

      <div className="row-actions">
        <button className="btn btn-primary" type="submit" disabled={busy || !valid || already}>
          {busy ? 'Adding…' : 'Add class'}
        </button>
        <button className="btn" type="button" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
