import { useState } from 'react';
import type { AcademicYear, ClassSummary, GradebookData } from '../data/types';
import type { ScoreEdit } from '../data/source';
import { StatusBadge } from '../components/StatusBadge';
import { Gradebook } from './Gradebook';

type Tab = 'overview' | 'gradebook' | 'attendance' | 'students' | 'reports' | 'submission';

interface Props {
  cls: ClassSummary;
  year: AcademicYear;
  periodId: string;
  onPeriodChange: (id: string) => void;
  gradebook: GradebookData;
  onSaveScores: (edits: ScoreEdit[]) => Promise<{ written: number }>;
}

/**
 * The class is the unit of work.
 *
 * V0 keeps the active class in one global bar and the term in a second
 * global bar, so every page is "the current page for whatever class is
 * loaded" — and six screens show a "Select a class first" empty state.
 * Here the class is a route you open and the period is a property of the
 * gradebook inside it. That removes ~150px of permanent chrome and the
 * empty state entirely.
 */
export function ClassWorkspace({ cls, year, periodId, onPeriodChange, gradebook, onSaveScores }: Props) {
  const [tab, setTab] = useState<Tab>('gradebook');
  const status = cls.status[periodId] ?? 'draft';
  const period = year.periods.find((p) => p.id === periodId);

  const tabs: Array<[Tab, string]> = [
    ['overview', 'Overview'], ['gradebook', 'Gradebook'], ['attendance', 'Attendance'],
    ['students', 'Students'], ['reports', 'Reports'], ['submission', 'Submission'],
  ];

  return (
    <div className="page">
      <div className="panel">
        <div className="panel-head" style={{ borderBottom: 0, paddingBottom: 4 }}>
          <div>
            <div className="row" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>
                {cls.gradeLevel} – {cls.section} · {cls.subject}
              </h2>
              <StatusBadge status={status} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              {cls.studentCount} learners · {period?.name} · SY {year.label}
              {cls.scheduleNote ? ` · ${cls.scheduleNote}` : ''}{cls.room ? ` · ${cls.room}` : ''}
            </div>
          </div>
          <div className="spacer" />
          <button className="btn btn-sm">Export</button>
          <button className="btn btn-primary btn-sm" disabled={!gradebook.editable}>
            Submit {period?.name}
          </button>
        </div>

        <div style={{ padding: '10px 16px 0' }}>
          {/* Period is scoped to the class, not global — and the tabs
              come from the school year's structure, so a four-quarter
              school renders four without a code change. */}
          <div className="seg" role="group" aria-label="Grading period" style={{ marginBottom: 10 }}>
            {year.periods.map((p) => (
              <button key={p.id} aria-pressed={p.id === periodId} onClick={() => onPeriodChange(p.id)}>
                {p.name}
              </button>
            ))}
          </div>

          <div className="tabs" role="tablist">
            {tabs.map(([key, label]) => (
              <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === 'gradebook' ? (
        <Gradebook data={gradebook} onSaveScores={onSaveScores} />
      ) : (
        <div className="panel">
          <div className="empty">
            <strong>{tabs.find(([k]) => k === tab)?.[1]}</strong>
            Not built yet — this milestone covers the gradebook.
          </div>
        </div>
      )}
    </div>
  );
}
