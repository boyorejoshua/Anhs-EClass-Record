import { useState } from 'react';
import type {
  SchoolProfile, SchoolProfileEdit, SubjectCatalogue, SubjectDraft,
} from '../data/types';
import { Async, useAsync } from '../components/Async';

interface Props {
  load: () => Promise<SchoolProfile>;
  save: (edit: SchoolProfileEdit) => Promise<void>;
  onSaved?: () => void;
  loadSubjects: () => Promise<SubjectCatalogue>;
  addSubject: (draft: SubjectDraft) => Promise<string>;
  setSubjectActive: (subjectId: string, isActive: boolean) => Promise<void>;
}

/**
 * School Setup.
 *
 * `nav.ts` carried this as `planned` for the whole build, with the note
 * "School profile and settings are currently configured during
 * onboarding". True — and it stopped being good enough the moment these
 * fields started PRINTING. The school name, government school ID,
 * region and division are the header of every SF form the school files,
 * so a typo set during onboarding was a support ticket rather than an
 * edit.
 *
 * `school.config.read` and `school.config.write` have been in the
 * permission catalogue since migration 0002 and were called by nothing.
 * This is the screen they were seeded for.
 */
export function SchoolSetup({
  load, save, onSaved, loadSubjects, addSubject, setSubjectActive,
}: Props) {
  const [state, retry] = useAsync(load, [load]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="greeting">School Setup</h1>
          <p className="page-sub">
            The details that head every form this school files. Getting them right
            here is what stops a division office returning an SF10 over a spelling.
          </p>
        </div>
      </div>

      <Async state={state} retry={retry} rows={5}>
        {(profile) => (
          <SchoolForm
            profile={profile}
            save={save}
            // Deliberately NOT retry(). Re-reading would put the Async
            // back into its loading state, unmounting the form — which
            // takes its "Saved." confirmation with it and leaves the
            // person believing nothing happened. The form already holds
            // what was written, and `save` throws if the write failed,
            // so there is nothing a re-read would tell us. `onSaved`
            // still refreshes the SHELL, where the school name shows.
            onSaved={() => onSaved?.()}
          />
        )}
      </Async>

      <Subjects
        load={loadSubjects} add={addSubject} setActive={setSubjectActive}
      />
    </div>
  );
}

/* ==================================================================== *
 * THE SUBJECT CATALOGUE
 *
 * A teacher imported their real GMRC workbook and was told "ask an
 * administrator to add it". The administrator had no way to add it
 * either — there was no create-subject anywhere in the product, and
 * subjects existed only because they were seeded. This is the screen
 * that makes that sentence true.
 *
 * It lives under School Setup because the school said so: the registrar
 * creates sections, the administrator holds school-wide configuration.
 * ==================================================================== */

function Subjects({ load, add, setActive }: {
  load: () => Promise<SubjectCatalogue>;
  add: (draft: SubjectDraft) => Promise<string>;
  setActive: (subjectId: string, isActive: boolean) => Promise<void>;
}) {
  const [state, retry] = useAsync(load, [load]);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(id: string, next: boolean) {
    setBusyId(id);
    setError(null);
    try {
      await setActive(id, next);
      retry();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That could not be changed.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Async state={state} retry={retry} rows={4}>
      {(cat) => (
        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Subjects</h2>
              <p className="page-sub">
                What this school teaches. A class can only be created for a subject
                on this list, and an import will never invent one — a typo would
                become a subject and then a column on somebody's report card.
              </p>
            </div>
            <div className="spacer" />
            {cat.permissions.canWrite && !adding && (
              <button className="btn btn-primary" onClick={() => setAdding(true)}>
                + Add subject
              </button>
            )}
          </div>

          {error && <div className="err-banner" role="alert"><span>{error}</span></div>}

          {adding && (
            <AddSubject
              categories={cat.categories}
              add={add}
              onCancel={() => setAdding(false)}
              onAdded={() => { setAdding(false); retry(); }}
            />
          )}

          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th scope="col">Subject</th>
                  <th scope="col">Code</th>
                  <th scope="col">Category — and how it is graded</th>
                  <th scope="col" className="num">Classes</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {cat.subjects.map((s) => {
                  const weights = cat.categories.find((c) => c.id === s.categoryId)?.weights;
                  return (
                    <tr key={s.id} data-retired={!s.isActive || undefined}>
                      <th scope="row">
                        {s.title}
                        {!s.isActive && <span className="tbl-sub">retired — kept for the records that use it</span>}
                      </th>
                      <td className="mono">{s.code}</td>
                      <td>
                        {s.category}
                        {weights && <span className="tbl-sub mono">{weights}</span>}
                      </td>
                      <td className="num mono">{s.classCount}</td>
                      <td>
                        {/*
                          The flex lives on a DIV inside the cell, not on
                          the cell. `display: flex` on a <td> takes it out
                          of the table layout algorithm, and the column
                          renders as a floating block over the rows —
                          which is exactly what it did until this comment.
                        */}
                        <div className="row-actions">
                          {cat.permissions.canWrite && (
                            <button
                              className="btn btn-sm"
                              disabled={busyId === s.id}
                              onClick={() => toggle(s.id, !s.isActive)}
                            >
                              {busyId === s.id ? '…' : s.isActive ? 'Retire' : 'Restore'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!cat.permissions.canWrite && (
            <p className="menu-note">
              You can see this list but not change it — adding a subject is an
              administrator's, because the category chosen decides how every
              learner taking it is graded.
            </p>
          )}
        </div>
      )}
    </Async>
  );
}

function AddSubject({ categories, add, onCancel, onAdded }: {
  categories: SubjectCatalogue['categories'];
  add: (draft: SubjectDraft) => Promise<string>;
  onCancel: () => void;
  onAdded: () => void;
}) {
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [units, setUnits] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = code.trim() && title.trim() && categoryId;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await add({
        code: code.trim(),
        title: title.trim(),
        categoryId,
        units: units.trim() ? Number(units) : null,
      });
      onAdded();
    } catch (err) {
      // "This school already has that subject (GMRC — Good Manners…)"
      // is written for an administrator. Show it as written.
      setError(err instanceof Error ? err.message : 'That subject could not be added.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="inline-form" onSubmit={submit}>
      {error && <div className="err-banner" role="alert"><span>{error}</span></div>}

      <div className="form-grid">
        <label className="field">
          <span className="field-label">Title *</span>
          <input className="input" value={title} disabled={busy}
                 placeholder="Good Manners and Right Conduct"
                 onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label className="field">
          <span className="field-label">Code *</span>
          <input className="input mono" value={code} disabled={busy}
                 placeholder="GMRC"
                 onChange={(e) => setCode(e.target.value)} required />
          <span className="field-hint">Short, and unique in this school. Stored uppercase.</span>
        </label>
        <label className="field">
          <span className="field-label">Category *</span>
          <select className="input" value={categoryId} disabled={busy}
                  onChange={(e) => setCategoryId(e.target.value)} required>
            <option value="">Choose…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.weights ? ` — ${c.weights}` : ' — no grading scheme'}
              </option>
            ))}
          </select>
          {/*
            The weights are IN the option text, not in a footnote. This
            choice sets how every learner taking the subject is graded,
            and a bare list of category names would hide that.
          */}
          <span className="field-hint">
            This decides the grading weights. It cannot be changed from here later.
          </span>
        </label>
        <label className="field">
          <span className="field-label">Units</span>
          <input className="input" value={units} disabled={busy} inputMode="decimal"
                 onChange={(e) => setUnits(e.target.value)} />
        </label>
      </div>

      <div className="row-actions">
        <button className="btn" type="button" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" type="submit" disabled={!ready || busy}>
          {busy ? 'Adding…' : 'Add subject'}
        </button>
      </div>
    </form>
  );
}

function SchoolForm({ profile, save, onSaved }: {
  profile: SchoolProfile;
  save: (edit: SchoolProfileEdit) => Promise<void>;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    name: profile.name,
    govtSchoolId: profile.govtSchoolId ?? '',
    region: profile.region ?? '',
    division: profile.division ?? '',
    district: profile.district ?? '',
    address: profile.address ?? '',
    contactEmail: profile.contactEmail ?? '',
    contactPhone: profile.contactPhone ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const editable = profile.permissions.canWrite;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setSaved(false);
    setF((prev) => ({ ...prev, [k]: e.target.value }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await save({
        name: f.name,
        govtSchoolId: f.govtSchoolId || null,
        region: f.region || null,
        division: f.division || null,
        district: f.district || null,
        address: f.address || null,
        contactEmail: f.contactEmail || null,
        contactPhone: f.contactPhone || null,
      });
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the school profile.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/*
        The header exactly as it will print, above the fields that feed
        it. Region and division are free text on purpose — DepEd's own
        spellings vary between issuances, and a dropdown built from our
        guess at the list would be wrong for somebody. Showing the
        result is the check that actually matters.
      */}
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>How this prints</h2>
            <p className="page-sub">The heading block on every SF form.</p>
          </div>
        </div>
        <div className="panel-body">
          <div className="form-preview">
            <b>{f.name || <span className="faint">(the school needs a name)</span>}</b>
            <span>
              {[f.region, f.division && `Division of ${f.division}`, f.district]
                .filter(Boolean).join(' · ') || <span className="faint">Region · Division · District</span>}
            </span>
            <span className="mono">
              School ID: {f.govtSchoolId || <span className="faint">not set</span>}
            </span>
          </div>
        </div>
      </div>

      <form className="panel" onSubmit={submit}>
        <div className="panel-head">
          <div>
            <h2>School details</h2>
            {!editable && (
              <p className="page-sub">
                You can see these but not change them — that is an administrator's.
              </p>
            )}
          </div>
        </div>

        {error && <div className="err-banner" role="alert"><span>{error}</span></div>}

        <div className="form-grid">
          <label className="picker">
            <span className="field-label">School name *</span>
            <input className="input" value={f.name} onChange={set('name')}
                   disabled={busy || !editable} required />
          </label>
          <label className="picker">
            <span className="field-label">Government school ID</span>
            <input className="input" value={f.govtSchoolId} onChange={set('govtSchoolId')}
                   disabled={busy || !editable} placeholder="301417" />
          </label>
          <label className="picker">
            <span className="field-label">Region</span>
            <input className="input" value={f.region} onChange={set('region')}
                   disabled={busy || !editable} placeholder="IV-A CALABARZON" />
          </label>
          <label className="picker">
            <span className="field-label">Division</span>
            <input className="input" value={f.division} onChange={set('division')}
                   disabled={busy || !editable} placeholder="Rizal" />
          </label>
          <label className="picker">
            <span className="field-label">District</span>
            <input className="input" value={f.district} onChange={set('district')}
                   disabled={busy || !editable} placeholder="Angono" />
          </label>
          <label className="picker">
            <span className="field-label">Address</span>
            <input className="input" value={f.address} onChange={set('address')}
                   disabled={busy || !editable} />
          </label>
          <label className="picker">
            <span className="field-label">Contact email</span>
            <input className="input" type="email" value={f.contactEmail}
                   onChange={set('contactEmail')} disabled={busy || !editable} />
          </label>
          <label className="picker">
            <span className="field-label">Contact number</span>
            <input className="input" value={f.contactPhone} onChange={set('contactPhone')}
                   disabled={busy || !editable} />
          </label>
        </div>

        {/*
          Shown, and shown as fixed. A person hunting for "change our
          subdomain" needs to be told it is not theirs to change, not
          left to conclude the field is missing.
        */}
        <div className="form-grid">
          <div className="picker">
            <span className="field-label">Sign-in address</span>
            <p className="mono">{profile.code}</p>
            <p className="faint">
              Fixed. It is part of how this school's data is kept separate, and
              changing it would sign everyone out. Ask Mendtrix.
            </p>
          </div>
          <div className="picker">
            <span className="field-label">Status</span>
            <p className="mono">{profile.status}</p>
            <p className="faint">Set by Mendtrix.</p>
          </div>
        </div>

        {editable && (
          <div className="row-actions">
            <button className="btn btn-primary" type="submit" disabled={busy || !f.name.trim()}>
              {busy ? 'Saving…' : 'Save school details'}
            </button>
            {saved && <span className="faint" role="status">Saved.</span>}
          </div>
        )}
      </form>
    </>
  );
}

/**
 * The same details, read-only, for a teacher's class record book.
 *
 * The legacy Setup screen let a teacher type all of this per record
 * book — which is how one school ended up with three spellings of its
 * own name across three teachers' files. Here it is shown, not typed:
 * a teacher can see exactly what will print on their forms, and is told
 * where each part is actually edited.
 */
export function SchoolInformation({ school, teacherName }: {
  school: {
    name: string; govtSchoolId: string | null;
    region: string | null; division: string | null; district: string | null;
  };
  teacherName: string;
}) {
  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>School information</h2>
          <p className="page-sub">What prints at the head of this class's forms.</p>
        </div>
      </div>
      <div className="panel-body">
        <dl className="detail-grid detail">
          <div><dt>School</dt><dd>{school.name}</dd></div>
          <div>
            <dt>School ID</dt>
            <dd className="mono">{school.govtSchoolId ?? <span className="faint">—</span>}</dd>
          </div>
          <div><dt>Region</dt><dd>{school.region ?? <span className="faint">—</span>}</dd></div>
          <div><dt>Division</dt><dd>{school.division ?? <span className="faint">—</span>}</dd></div>
          <div><dt>District</dt><dd>{school.district ?? <span className="faint">—</span>}</dd></div>
          <div><dt>Teacher</dt><dd>{teacherName}</dd></div>
        </dl>
        <p className="menu-note" style={{ marginBottom: 0 }}>
          Read-only here on purpose. The school's details are set once under
          <b> School Setup</b> by an administrator, and your own name under
          <b> My Account</b> — so they read the same on every teacher's forms
          rather than once per record book.
        </p>
      </div>
    </div>
  );
}
