import type { AcademicYear, ClassSummary } from '../data/types';
import { StatusBadge } from '../components/StatusBadge';

interface Props {
  teacherName: string;
  year: AcademicYear;
  periodId: string;
  classes: ClassSummary[];
  onOpenClass: (classId: string) => void;
}

/**
 * The teacher's landing page. The most common session is "continue what
 * I was doing", so the primary action is resuming a class — not a tour
 * of the product.
 */
export function TeacherDashboard({ teacherName, year, periodId, classes, onOpenClass }: Props) {
  const period = year.periods.find((p) => p.id === periodId);
  const outstanding = classes.filter(
    (c) => c.status[periodId] !== 'published' && c.status[periodId] !== 'submitted',
  );
  const totalGaps = classes.reduce((sum, c) => {
    const p = c.completeness[periodId];
    return sum + (p ? p.total - p.scored : 0);
  }, 0);

  return (
    <div className="page">
      <h1 className="greeting">Good morning, {teacherName.split(' ')[0]}.</h1>
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>
        {period?.name} · SY {year.label} ·{' '}
        {period && `${new Date(period.startDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – ${new Date(period.endDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`}
      </p>

      <div className="stat-row">
        <div className="stat"><b>{classes.length}</b><span>My classes</span></div>
        <div className="stat"><b>{classes.reduce((s, c) => s + c.studentCount, 0)}</b><span>Learners</span></div>
        <div className="stat"><b>{outstanding.length}</b><span>Not yet submitted</span></div>
        <div className="stat"><b>{totalGaps}</b><span>Missing scores</span></div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>My classes</h2>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{period?.name}</span>
        </div>
        <div className="panel-body">
          <div className="grid-cards">
            {classes.map((c) => {
              const done = c.completeness[periodId];
              const pct = done && done.total > 0 ? Math.round((done.scored / done.total) * 100) : 0;
              return (
                <button key={c.id} className="class-card" onClick={() => onOpenClass(c.id)}>
                  <div className="row">
                    <h3>{c.gradeLevel} – {c.section}</h3>
                    <div className="spacer" />
                    <StatusBadge status={c.status[periodId] ?? 'draft'} />
                  </div>
                  <div className="meta">{c.subject}</div>
                  <div className="row">
                    <span className="meta mono">{c.studentCount} learners</span>
                    <span className="meta">{c.scheduleNote}</span>
                    <div className="spacer" />
                    <span className="mono" style={{ fontSize: 12, color: pct === 100 ? 'var(--success)' : 'var(--muted)' }}>
                      {pct}% entered
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
