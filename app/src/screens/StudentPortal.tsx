import { useMemo, useState } from 'react';
import type { StudentGradeRow, StudentHistoryRow, StudentProfile } from '../data/types';
import { Async, EmptyState, useAsync } from '../components/Async';

/**
 * The student portal.
 *
 * ⚠️ The security note that governs all three screens:
 *
 * None of these calls takes a student id. `my_grades`, `my_profile` and
 * `my_academic_history` resolve the learner server-side from
 * app.current_student_id(), which reads the verified JWT. There is no
 * studentId in the route, no id in a query string, and nothing in this
 * file that could be tampered with to read another learner's record.
 *
 * The publication gate is likewise not enforced here. It lives in the
 * RLS policies on period_grades and final_subject_grades, so a direct
 * query returns exactly what this screen shows. A grade that has not
 * been published does not arrive — it is not filtered out after arrival.
 */

/* ------------------------------------------------------------------ *
 * My Grades
 * ------------------------------------------------------------------ */

export function StudentGrades({ load }: { load: () => Promise<StudentGradeRow[]> }) {
  const [state, retry] = useAsync(load, []);
  const [yearFilter, setYearFilter] = useState<string>('all');

  const years = useMemo(() => {
    if (state.status !== 'ready') return [];
    return [...new Map(state.data.map((r) => [r.academicYearId, r.academicYear])).entries()];
  }, [state]);

  const rows = useMemo(() => {
    if (state.status !== 'ready') return [];
    return yearFilter === 'all'
      ? state.data
      : state.data.filter((r) => r.academicYearId === yearFilter);
  }, [state, yearFilter]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="greeting">My grades</h1>
          <p className="page-sub">
            Only grades your school has released appear here. A period still being
            marked, or still with the registrar, is shown as “Not released”.
          </p>
        </div>
      </div>

      <div className="panel">
        {years.length > 1 && (
          <div className="gb-toolbar">
            <div className="seg" role="group" aria-label="Academic year">
              <button aria-pressed={yearFilter === 'all'} onClick={() => setYearFilter('all')}>All years</button>
              {years.map(([id, label]) => (
                <button key={id} aria-pressed={yearFilter === id} onClick={() => setYearFilter(id)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <Async
          state={state}
          retry={retry}
          isEmpty={() => rows.length === 0}
          empty={
            <EmptyState title="No subjects yet">
              Once you are enrolled in subjects for the school year, they appear here —
              with grades as each period is released.
            </EmptyState>
          }
        >
          {() => (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th scope="col">Subject</th>
                    {(rows[0]?.periods ?? []).map((p) => (
                      <th scope="col" className="num" key={p.ordinal} title={p.name}>{p.shortName}</th>
                    ))}
                    <th scope="col" className="num">Final</th>
                    <th scope="col">Remark</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.academicYearId}-${r.subjectCode}`}>
                      <th scope="row">
                        {r.subject}
                        <span className="tbl-sub">{r.gradeLevel}{r.section ? ` – ${r.section}` : ''}</span>
                      </th>
                      {r.periods.map((p) => (
                        <td className="num mono" key={p.ordinal}>
                          {p.grade == null
                            ? <span className="faint" title="Not released yet">—</span>
                            : <span className="gb-chip" data-band={p.grade >= 90 ? 'high' : p.grade >= 75 ? 'mid' : 'low'}>{p.grade}</span>}
                        </td>
                      ))}
                      <td className="num mono">{r.finalGrade ?? <span className="faint">—</span>}</td>
                      <td>{r.remark ?? <span className="faint">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Async>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * My Profile
 * ------------------------------------------------------------------ */

export function StudentProfileScreen({ load }: { load: () => Promise<StudentProfile> }) {
  const [state, retry] = useAsync(load, []);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="greeting">My profile</h1>
          <p className="page-sub">
            Your school holds this record. If something is wrong, the registrar corrects
            it — a learner cannot edit their own academic record.
          </p>
        </div>
      </div>

      <Async
        state={state}
        retry={retry}
        isEmpty={(d) => !d.student}
        empty={
          <div className="panel">
            <EmptyState title="No learner record linked to this account">
              This sign-in is not linked to a learner. Ask the registrar to connect it.
            </EmptyState>
          </div>
        }
      >
        {(d) => (
          <div className="two-col">
            <div className="panel">
              <div className="panel-head"><h2>Identity</h2></div>
              <div className="panel-body">
                <Facts rows={[
                  ['Name', d.student!.displayName],
                  ['LRN', d.student!.lrn ?? '—'],
                  ['Student number', d.student!.studentNumber ?? '—'],
                  ['Sex', d.student!.sex || '—'],
                  ['Date of birth', d.student!.birthDate ?? '—'],
                ]} />
              </div>
            </div>

            <div className="panel">
              <div className="panel-head"><h2>Enrolment</h2></div>
              <div className="panel-body">
                {d.enrollment ? (
                  <Facts rows={[
                    ['School year', d.enrollment.academicYear],
                    ['Grade level', d.enrollment.gradeLevel],
                    ['Section', d.enrollment.section ?? '—'],
                    ['Adviser', d.enrollment.adviser ?? '—'],
                    ['Status', d.enrollment.status],
                    ['Date enrolled', d.enrollment.dateEnrolled],
                  ]} />
                ) : (
                  <p className="page-sub">No active enrolment for the current school year.</p>
                )}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head"><h2>Address</h2></div>
              <div className="panel-body">
                <Facts rows={[
                  ['Barangay', d.student!.barangay ?? '—'],
                  ['Municipality', d.student!.municipality ?? '—'],
                  ['Province', d.student!.province ?? '—'],
                ]} />
              </div>
            </div>
          </div>
        )}
      </Async>
    </div>
  );
}

function Facts({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="facts">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------------------------------------------ *
 * Academic History
 * ------------------------------------------------------------------ */

export function StudentHistory({ load, loadGrades }: {
  load: () => Promise<StudentHistoryRow[]>;
  loadGrades: (yearId: string) => Promise<StudentGradeRow[]>;
}) {
  const [state, retry] = useAsync(load, []);
  const [selected, setSelected] = useState<string | null>(null);
  const [grades, retryGrades] = useAsync(
    () => (selected ? loadGrades(selected) : Promise.resolve([])),
    [selected],
  );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="greeting">Academic history</h1>
          <p className="page-sub">
            One row per school year you were enrolled — including years at another
            school, which are part of your permanent record.
          </p>
        </div>
      </div>

      <Async
        state={state}
        retry={retry}
        isEmpty={(d) => d.length === 0}
        empty={
          <div className="panel">
            <EmptyState title="No enrolment history">
              Your enrolment history appears here once the registrar records it.
            </EmptyState>
          </div>
        }
      >
        {(d) => (
          <>
            <div className="hist-list">
              {d.map((h) => (
                <button
                  key={h.academicYearId}
                  className="hist-row"
                  aria-expanded={selected === h.academicYearId}
                  onClick={() => setSelected(selected === h.academicYearId ? null : h.academicYearId)}
                >
                  <span className="hist-year mono">{h.academicYear}</span>
                  <span className="hist-main">
                    <b>{h.gradeLevel}{h.section ? ` – ${h.section}` : ''}</b>
                    <span className="tbl-sub">{h.schoolName}</span>
                  </span>
                  <span className="hist-meta">
                    {h.generalAverage != null && (
                      <span className="mono" title="General average">{h.generalAverage}</span>
                    )}
                    {h.promotionStatus && (
                      <span className="pill" data-tone={h.promotionStatus === 'promoted' ? 'ok' : 'muted'}>
                        {h.promotionStatus}
                      </span>
                    )}
                  </span>
                  <span aria-hidden="true" className="hist-caret">
                    {selected === h.academicYearId ? '▾' : '▸'}
                  </span>
                </button>
              ))}
            </div>

            {selected && (
              <div className="panel">
                <div className="panel-head">
                  <h2>{d.find((h) => h.academicYearId === selected)?.academicYear} grades</h2>
                </div>
                <Async
                  state={grades}
                  retry={retryGrades}
                  isEmpty={(g) => g.length === 0}
                  empty={
                    <EmptyState title="No released grades for this year">
                      Grades appear once the school publishes them. A year recorded at
                      another school may hold only a general average.
                    </EmptyState>
                  }
                >
                  {(g) => (
                    <div className="tbl-wrap">
                      <table className="tbl">
                        <thead>
                          <tr>
                            <th scope="col">Subject</th>
                            {(g[0]?.periods ?? []).map((p) => (
                              <th className="num" scope="col" key={p.ordinal}>{p.shortName}</th>
                            ))}
                            <th className="num" scope="col">Final</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.map((r) => (
                            <tr key={r.subjectCode}>
                              <th scope="row">{r.subject}</th>
                              {r.periods.map((p) => (
                                <td className="num mono" key={p.ordinal}>
                                  {p.grade ?? <span className="faint">—</span>}
                                </td>
                              ))}
                              <td className="num mono">{r.finalGrade ?? <span className="faint">—</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Async>
              </div>
            )}
          </>
        )}
      </Async>
    </div>
  );
}
