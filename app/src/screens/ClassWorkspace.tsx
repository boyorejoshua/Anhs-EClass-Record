import { useCallback, useState } from 'react';
import type {
  AcademicYear, AttendanceDay, AttendanceMark, ClassStudent, ClassSummary,
  GradebookData, ValidationReport,
} from '../data/types';
import type { ScoreEdit } from '../data/source';
import { StatusBadge } from '../components/StatusBadge';
import { Async, ErrorState, Loading } from '../components/Async';
import { Gradebook } from './Gradebook';
import { RecordBookSummary, RecordBookAnalytics, RecordBookLoa } from './RecordBook';
import { RecordBookSetup } from './RecordBookSetup';
import { StudentDetail } from './StudentDetail';
import type { SummaryRow } from '../lib/recordbook';
import type { AssessmentDraft } from '../data/source';
import { ClassSubmission } from './ClassSubmission';
import { ClassAttendance } from './ClassAttendance';
import { ClassStudents } from './ClassStudents';
import { CLASS_TABS, type ClassTab } from '../nav';
import { displayStatus, isEditable, missingCount, pct } from '../lib/status';
import { downloadCsv, gradebookCsv, slug, summaryCsv } from '../lib/export';
import type { AsyncState } from '../components/Async';

interface Props {
  cls: ClassSummary;
  year: AcademicYear;
  periodId: string;
  tab: ClassTab;
  onTabChange: (tab: ClassTab) => void;
  onPeriodChange: (id: string) => void;
  gradebook: AsyncState<GradebookData>;
  retryGradebook: () => void;
  onSaveScores: (edits: ScoreEdit[]) => Promise<{ written: number }>;
  onBack: () => void;
  /* data-layer calls, passed in so this screen never imports a source */
  validateSubmission: (classId: string, periodId: string) => Promise<ValidationReport>;
  submitGrades: (classId: string, periodId: string, ack: boolean) => Promise<void>;
  loadStudents: (classId: string) => Promise<ClassStudent[]>;
  saveAssessments: (
    classId: string, periodId: string, items: AssessmentDraft[],
  ) => Promise<{ written: number; removed: number }>;
  loadAttendance: (classId: string, date: string) => Promise<AttendanceDay>;
  saveAttendance: (classId: string, date: string, marks: AttendanceMark[]) => Promise<{ written: number }>;
  onWorkflowChange: () => void;
}

/**
 * The class is the unit of work.
 *
 * Every tab here previously rendered "Not built yet" except the
 * gradebook, and the two header buttons — Export and Submit — had no
 * handlers at all. Now the tab is part of the route, so opening a class
 * from the dashboard, from My Classes, or from a registrar queue row can
 * each land on the tab that makes sense for the journey.
 */
export function ClassWorkspace(props: Props) {
  const {
    cls, year, periodId, tab, onTabChange, onPeriodChange, gradebook, retryGradebook,
    onSaveScores, onBack, validateSubmission, submitGrades, loadStudents,
    loadAttendance, saveAttendance, onWorkflowChange, saveAssessments,
  } = props;

  const [exportOpen, setExportOpen] = useState(false);
  // Which learner the Summary drilled into. Cleared whenever the tab or
  // the period changes, so it can never show one period's breakdown under
  // another period's heading.
  const [detail, setDetail] = useState<SummaryRow | null>(null);
  const status = displayStatus(cls, periodId);
  const period = year.periods.find((p) => p.id === periodId);
  const done = cls.completeness[periodId];
  const missing = missingCount(done);

  const doExport = useCallback((kind: 'grid' | 'summary' | 'print') => {
    setExportOpen(false);
    if (kind === 'print') { window.print(); return; }
    if (gradebook.status !== 'ready' || !period) return;
    const ctx = {
      className: `${cls.gradeLevel} – ${cls.section}`,
      subject: cls.subject,
      period: period.name,
      year: year.label,
    };
    const name = slug(cls.gradeLevel, cls.section, cls.subjectCode, period.shortName, kind);
    downloadCsv(
      `${name}.csv`,
      kind === 'grid' ? gradebookCsv(gradebook.data, ctx) : summaryCsv(gradebook.data, ctx),
    );
  }, [gradebook, cls, period, year.label]);

  return (
    <div className="page">
      <div className="panel">
        <div className="panel-head" style={{ borderBottom: 0, paddingBottom: 4 }}>
          <div>
            <button className="link-back" onClick={onBack}>← My classes</button>
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

          <div className="menu-wrap">
            <button
              className="btn btn-sm"
              aria-haspopup="menu"
              aria-expanded={exportOpen}
              disabled={gradebook.status !== 'ready'}
              onClick={() => setExportOpen((v) => !v)}
            >
              Export ▾
            </button>
            {exportOpen && (
              <div className="menu" role="menu">
                <button role="menuitem" onClick={() => doExport('grid')}>
                  Gradebook (CSV)
                  <span>Every score, plus the calculated columns</span>
                </button>
                <button role="menuitem" onClick={() => doExport('summary')}>
                  Grade summary (CSV)
                  <span>One row per learner with the descriptor</span>
                </button>
                <button role="menuitem" onClick={() => doExport('print')}>
                  Print
                  <span>Uses the browser print dialog</span>
                </button>
                <p className="menu-note">
                  Official, numbered documents come from the registrar once the
                  document engine is built — see docs/11.
                </p>
              </div>
            )}
          </div>

          <button
            className="btn btn-primary btn-sm"
            onClick={() => onTabChange('submission')}
          >
            {isEditable(status) ? `Submit ${period?.shortName ?? ''}`.trim() : 'View submission'}
          </button>
        </div>

        <div style={{ padding: '10px 16px 0' }}>
          <div className="seg" role="group" aria-label="Grading period" style={{ marginBottom: 10 }}>
            {year.periods.map((p) => (
              <button key={p.id} aria-pressed={p.id === periodId} onClick={() => onPeriodChange(p.id)}>
                {p.name}
              </button>
            ))}
          </div>

          <div className="tabs" role="tablist">
            {CLASS_TABS.map((t, i) => (
              <>
                {/* A visual seam around the Record Book group, so the six
                    legacy sub-tabs read as one workflow rather than ten
                    peers. */}
                {t.group === 'record-book' && CLASS_TABS[i - 1]?.group !== 'record-book' && (
                  <span className="tab-group-label" aria-hidden="true">Record book</span>
                )}
                <button
                  key={t.key}
                  role="tab"
                  id={`tab-${t.key}`}
                  data-group={t.group}
                  aria-selected={tab === t.key}
                  aria-controls={`panel-${t.key}`}
                  onClick={() => { setDetail(null); onTabChange(t.key); }}
                >
                  {t.label}
                  {t.key === 'submission' && missing > 0 && (
                    <span className="tab-count" title={`${missing} missing scores`}>{missing}</span>
                  )}
                </button>
              </>
            ))}
          </div>
        </div>
      </div>

      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'overview' && (
          <Overview cls={cls} periodId={periodId} periodName={period?.name ?? ''} onGo={onTabChange} />
        )}

        {tab === 'setup' && period && (
          <Async state={gradebook} retry={retryGradebook} rows={6}>
            {(g) => (
              <RecordBookSetup
                cls={cls} period={period} yearLabel={year.label} data={g} status={status}
                save={(items) => saveAssessments(cls.id, periodId, items)}
                onSaved={onWorkflowChange}
              />
            )}
          </Async>
        )}

        {tab === 'gradebook' && (
          <Async state={gradebook} retry={retryGradebook} rows={8}>
            {(g) => <Gradebook data={g} onSaveScores={onSaveScores} />}
          </Async>
        )}

        {tab === 'summary' && period && (
          <Async state={gradebook} retry={retryGradebook} rows={8}>
            {(g) => (detail ? (
              <StudentDetail
                cls={cls} period={period} yearLabel={year.label} data={g} row={detail}
                onBack={() => setDetail(null)}
                onGoGradebook={() => { setDetail(null); onTabChange('gradebook'); }}
              />
            ) : (
              <RecordBookSummary
                cls={cls} period={period} yearLabel={year.label} data={g}
                onOpenStudent={setDetail}
                onGoGradebook={() => onTabChange('setup')}
              />
            ))}
          </Async>
        )}

        {tab === 'analytics' && period && (
          <Async state={gradebook} retry={retryGradebook} rows={6}>
            {(g) => (
              <RecordBookAnalytics
                cls={cls} period={period} data={g}
                onGoGradebook={() => onTabChange('setup')}
              />
            )}
          </Async>
        )}

        {tab === 'loa' && period && (
          <Async state={gradebook} retry={retryGradebook} rows={6}>
            {(g) => (
              <RecordBookLoa
                cls={cls} period={period} yearLabel={year.label} data={g}
                onGoGradebook={() => onTabChange('setup')}
              />
            )}
          </Async>
        )}

        {tab === 'attendance' && (
          <ClassAttendance classId={cls.id} load={loadAttendance} save={saveAttendance} />
        )}

        {tab === 'students' && (
          <ClassStudents classId={cls.id} load={loadStudents} />
        )}

        {tab === 'reports' && (
          <Reports onExport={doExport} disabled={gradebook.status !== 'ready'} />
        )}

        {tab === 'submission' && period && (
          <ClassSubmission
            cls={cls}
            period={period}
            status={status}
            validate={() => validateSubmission(cls.id, periodId)}
            submit={(ack) => submitGrades(cls.id, periodId, ack)}
            onSubmitted={onWorkflowChange}
            onReviewMissing={() => onTabChange('gradebook')}
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Overview({ cls, periodId, periodName, onGo }: {
  cls: ClassSummary; periodId: string; periodName: string;
  onGo: (t: ClassTab) => void;
}) {
  const done = cls.completeness[periodId];
  const progress = pct(done);
  const missing = missingCount(done);

  return (
    <div className="panel">
      <div className="panel-head"><h2>{periodName} at a glance</h2></div>
      <div className="panel-body">
        <div className="stat-row">
          <button className="stat stat-btn" onClick={() => onGo('students')}>
            <b>{cls.studentCount}</b><span>Learners</span>
          </button>
          <button className="stat stat-btn" onClick={() => onGo('gradebook')}>
            <b>{progress}%</b><span>Scores entered</span>
          </button>
          <button className="stat stat-btn" onClick={() => onGo('gradebook')}>
            <b data-warn={missing > 0}>{missing}</b><span>Missing scores</span>
          </button>
          <button className="stat stat-btn" onClick={() => onGo('submission')}>
            <b style={{ fontSize: 15 }}>{displayStatus(cls, periodId).replace('_', ' ')}</b>
            <span>Submission</span>
          </button>
        </div>
        <p className="page-sub" style={{ marginTop: 14 }}>
          Every tile opens the screen it summarises. Nothing here is decorative.
        </p>
      </div>
    </div>
  );
}

function Reports({ onExport, disabled }: {
  onExport: (k: 'grid' | 'summary' | 'print') => void; disabled: boolean;
}) {
  return (
    <div className="panel">
      <div className="panel-head"><h2>Reports</h2></div>
      <div className="panel-body">
        <div className="rep-grid">
          <ReportCard
            title="Class record (CSV)"
            body="Every score in this period with the calculated Initial and Grade columns. Opens in Excel."
            action={<button className="btn btn-sm" disabled={disabled} onClick={() => onExport('grid')}>Download</button>}
          />
          <ReportCard
            title="Grade summary (CSV)"
            body="One row per learner: initial grade, transmuted grade, descriptor and remark."
            action={<button className="btn btn-sm" disabled={disabled} onClick={() => onExport('summary')}>Download</button>}
          />
          <ReportCard
            title="Print the gradebook"
            body="Uses the browser's print dialog against the on-screen grid."
            action={<button className="btn btn-sm" disabled={disabled} onClick={() => onExport('print')}>Print</button>}
          />
          <ReportCard
            title="Report card (SF9)"
            planned
            body="An official report card is a numbered, signed, archived document. It comes from the registrar through the pipeline in docs/11-document-engine.md, not from a browser print."
          />
          <ReportCard
            title="DepEd E-Class Record (XLSX)"
            planned
            body="V0 already emits the exact DepEd workbook shape teachers expect (main.js:1176-1322). docs/10 says that layout knowledge ports across rather than being re-derived here."
          />
        </div>
      </div>
    </div>
  );
}

function ReportCard({ title, body, action, planned }: {
  title: string; body: string; action?: React.ReactNode; planned?: boolean;
}) {
  return (
    <div className="rep-card" data-planned={planned || undefined}>
      <div className="row">
        <h3>{title}</h3>
        <div className="spacer" />
        {planned && <span className="na-tag">Not yet</span>}
      </div>
      <p>{body}</p>
      {action}
    </div>
  );
}

export { ErrorState, Loading };
