import type { AcademicYear, ClassSummary, SubmissionRow } from '../data/types';
import { StatusBadge } from '../components/StatusBadge';
import { Async, EmptyState, useAsync } from '../components/Async';
import { displayStatus, missingCount, pct } from '../lib/status';
import type { ClassTab } from '../nav';

/**
 * Dashboards.
 *
 * The rule applied throughout: every tile and every card is a control
 * that goes somewhere useful. The previous dashboard had four stat tiles
 * that were `<div>`s — a count of missing scores with no way to reach
 * them is a reproach, not a feature.
 */

/* ------------------------------------------------------------------ *
 * Teacher / adviser
 * ------------------------------------------------------------------ */

export function TeacherDashboard({ teacherName, year, periodId, classes, onOpenClass, onGoClasses }: {
  teacherName: string;
  year: AcademicYear;
  periodId: string;
  classes: ClassSummary[];
  onOpenClass: (classId: string, tab: ClassTab) => void;
  onGoClasses: () => void;
}) {
  const period = year.periods.find((p) => p.id === periodId);

  const needsWork = classes.filter((c) => {
    const s = displayStatus(c, periodId);
    return s === 'draft' || s === 'in_progress' || s === 'returned';
  });
  const returned = classes.filter((c) => displayStatus(c, periodId) === 'returned');
  const totalGaps = classes.reduce((sum, c) => sum + missingCount(c.completeness[periodId]), 0);
  const worstGap = [...classes].sort(
    (a, b) => missingCount(b.completeness[periodId]) - missingCount(a.completeness[periodId]),
  )[0];

  return (
    <div className="page">
      <h1 className="greeting">Good day, {teacherName.split(' ')[0]}.</h1>
      <p className="page-sub">
        {period?.name} · SY {year.label}
        {period && ` · ${fmt(period.startDate)} – ${fmt(period.endDate)}`}
      </p>

      <div className="stat-row">
        <button className="stat stat-btn" onClick={onGoClasses}>
          <b>{classes.length}</b><span>My classes</span>
        </button>
        <button className="stat stat-btn" onClick={onGoClasses}>
          <b>{classes.reduce((s, c) => s + c.studentCount, 0)}</b><span>Learners</span>
        </button>
        <button
          className="stat stat-btn"
          disabled={needsWork.length === 0}
          onClick={() => needsWork[0] && onOpenClass(needsWork[0].id, 'submission')}
        >
          <b data-warn={needsWork.length > 0}>{needsWork.length}</b><span>Not yet submitted</span>
        </button>
        <button
          className="stat stat-btn"
          disabled={totalGaps === 0}
          onClick={() => worstGap && onOpenClass(worstGap.id, 'gradebook')}
        >
          <b data-warn={totalGaps > 0}>{totalGaps}</b><span>Missing scores</span>
        </button>
      </div>

      {returned.length > 0 && (
        <div className="callout" data-tone="warn">
          <b>{returned.length} submission{returned.length === 1 ? '' : 's'} returned for correction</b>
          <ul>
            {returned.map((c) => (
              <li key={c.id}>
                {c.gradeLevel} – {c.section} · {c.subject}
                <button className="btn btn-sm" onClick={() => onOpenClass(c.id, 'gradebook')}>
                  Open gradebook
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <h2>My classes</h2>
          <div className="spacer" />
          <button className="btn btn-sm" onClick={onGoClasses}>See all</button>
        </div>
        {classes.length === 0 ? (
          <EmptyState title="No classes assigned">
            An administrator assigns teaching loads. Once a class is yours it appears here.
          </EmptyState>
        ) : (
          <div className="panel-body">
            <div className="grid-cards">
              {classes.map((c) => {
                const p = pct(c.completeness[periodId]);
                return (
                  <button key={c.id} className="class-card" onClick={() => onOpenClass(c.id, 'gradebook')}>
                    <div className="row">
                      <h3>{c.gradeLevel} – {c.section}</h3>
                      <div className="spacer" />
                      <StatusBadge status={displayStatus(c, periodId)} />
                    </div>
                    <div className="meta">{c.subject}</div>
                    <div className="cc-meta">
                      <span>{c.studentCount} learners</span>
                      {c.scheduleNote && <span>{c.scheduleNote}</span>}
                    </div>
                    <div className="cc-progress">
                      <div className="cc-bar"><span style={{ width: `${p}%` }} data-full={p === 100} /></div>
                      <span className="mono cc-pct">{p}%</span>
                    </div>
                  </button>
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
 * Registrar
 * ------------------------------------------------------------------ */

export function RegistrarDashboard({ year, yearId, loadQueue, onGoQueue, onGoStudents }: {
  year: AcademicYear;
  yearId: string;
  loadQueue: (yearId: string) => Promise<SubmissionRow[]>;
  onGoQueue: () => void;
  onGoStudents: () => void;
}) {
  const [state, retry] = useAsync(() => loadQueue(yearId), [yearId]);

  return (
    <div className="page">
      <h1 className="greeting">Registrar</h1>
      <p className="page-sub">SY {year.label}</p>

      <Async state={state} retry={retry} rows={3}>
        {(rows) => {
          const by = (s: string) => rows.filter((r) => r.status === s).length;
          return (
            <>
              <div className="stat-row">
                <button className="stat stat-btn" onClick={onGoQueue}>
                  <b data-warn={by('submitted') > 0}>{by('submitted')}</b><span>Awaiting review</span>
                </button>
                <button className="stat stat-btn" onClick={onGoQueue}>
                  <b>{by('approved')}</b><span>Approved</span>
                </button>
                <button className="stat stat-btn" onClick={onGoQueue}>
                  <b>{by('finalized')}</b><span>Ready to publish</span>
                </button>
                <button className="stat stat-btn" onClick={onGoQueue}>
                  <b>{by('returned')}</b><span>Returned</span>
                </button>
              </div>

              <div className="panel">
                <div className="panel-head">
                  <h2>Needs your attention</h2>
                  <div className="spacer" />
                  <button className="btn btn-sm" onClick={onGoStudents}>Students</button>
                  <button className="btn btn-primary btn-sm" onClick={onGoQueue}>Open queue</button>
                </div>
                {rows.filter((r) => r.status === 'submitted' || r.status === 'finalized').length === 0 ? (
                  <EmptyState title="Nothing waiting">
                    No submission needs review or publication right now.
                  </EmptyState>
                ) : (
                  <div className="panel-body">
                    <ul className="plain-list">
                      {rows
                        .filter((r) => r.status === 'submitted' || r.status === 'finalized')
                        .slice(0, 6)
                        .map((r) => (
                          <li key={r.submissionId}>
                            <span>
                              <b>{r.gradeLevel} – {r.section}</b> · {r.subject} · {r.periodName}
                              <span className="tbl-sub">{r.teacher ?? 'Unassigned'}</span>
                            </span>
                            <div className="spacer" />
                            <StatusBadge status={r.status} />
                            <button className="btn btn-sm" onClick={onGoQueue}>Review</button>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </div>
            </>
          );
        }}
      </Async>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * School administrator
 * ------------------------------------------------------------------ */

export function AdminDashboard({ year, schoolName, periodId }: {
  year: AcademicYear; schoolName: string; periodId: string;
}) {
  const period = year.periods.find((p) => p.id === periodId);
  return (
    <div className="page">
      <h1 className="greeting">{schoolName}</h1>
      <p className="page-sub">SY {year.label} · {year.periodStructure} · {period?.name}</p>

      <div className="panel">
        <div className="panel-head"><h2>Academic year</h2></div>
        <div className="panel-body">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th scope="col">Period</th><th scope="col">Starts</th>
                  <th scope="col">Ends</th><th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {year.periods.map((p) => (
                  <tr key={p.id}>
                    <th scope="row">{p.name}</th>
                    <td className="mono">{p.startDate}</td>
                    <td className="mono">{p.endDate}</td>
                    <td><span className="pill" data-tone={p.status === 'active' ? 'ok' : 'muted'}>{p.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="menu-note" style={{ marginTop: 12 }}>
            This school runs a {year.periodStructure} calendar with {year.periods.length} grading
            periods. Periods are rows in the database, not a hard-coded shape — a school on a
            different structure renders differently here with no code change. Editing them is
            not yet available; see the Academic Years entry in the menu.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function fmt(d: string): string {
  return new Date(d).toLocaleDateString('en-PH', { day: 'numeric', month: 'short' });
}
