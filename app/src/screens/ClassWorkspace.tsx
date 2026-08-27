import { Fragment, useCallback, useState } from 'react';
import type {
  AcademicPeriod, AcademicYear, AttendanceDay, AttendanceMark, ClassStudent, ClassSummary,
  GradebookData, LearnerNameFix, LearnerToAdd, MyClassRoster, PersistedGrade, ValidationReport,
} from '../data/types';
import type { ScoreEdit } from '../data/source';
import { StatusBadge } from '../components/StatusBadge';
import { Async, ErrorState, Loading, useAsync } from '../components/Async';
import { Gradebook } from './Gradebook';
import { RecordBookSummary, RecordBookAnalytics, RecordBookLoa } from './RecordBook';
import { RecordBookSetup } from './RecordBookSetup';
import { StudentDetail } from './StudentDetail';
import { summaryRows } from '../lib/recordbook';
import type { CohortSection } from '../lib/loa';
import type { AssessmentDraft } from '../data/source';
import { ClassSubmission } from './ClassSubmission';
import { ClassAttendance } from './ClassAttendance';
import { ClassStudents } from './ClassStudents';
import { ClassRoster } from './ClassRoster';
import { SchoolInformation } from './SchoolSetup';
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
  /** What the server recorded at submission; empty until one has run. */
  recorded: AsyncState<Record<string, PersistedGrade>>;
  onSaveScores: (edits: ScoreEdit[]) => Promise<{ written: number }>;
  onBack: () => void;
  /* data-layer calls, passed in so this screen never imports a source */
  validateSubmission: (classId: string, periodId: string) => Promise<ValidationReport>;
  submitGrades: (classId: string, periodId: string, ack: boolean) => Promise<void>;
  recallSubmission: (classId: string, periodId: string, reason?: string) => Promise<void>;
  loadStudents: (classId: string) => Promise<ClassStudent[]>;
  saveAssessments: (
    classId: string, periodId: string, items: AssessmentDraft[],
  ) => Promise<{ written: number; removed: number }>;
  loadAttendance: (classId: string, date: string) => Promise<AttendanceDay>;
  saveAttendance: (classId: string, date: string, marks: AttendanceMark[]) => Promise<{ written: number }>;
  onWorkflowChange: () => void;
  loadLoaCohort: (
    academicYearId: string, classId: string, periodId: string,
  ) => Promise<CohortSection[]>;
  /** Another period's gradebook, for Student Detail's year strip. */
  loadGradebook: (classId: string, periodId: string) => Promise<GradebookData>;
  /** Printed at the head of this class's forms. Read-only here. */
  school: {
    name: string; govtSchoolId: string | null;
    region: string | null; division: string | null; district: string | null;
  };
  teacherName: string;
  /* The roster editor. Absent for a role that may only read the list. */
  roster?: {
    load: (classId: string) => Promise<MyClassRoster>;
    add: (learner: LearnerToAdd) => Promise<string>;
    remove: (classEnrollmentId: string) => Promise<void>;
    rename: (fix: LearnerNameFix) => Promise<void>;
    onChanged: () => void;
  };
}

/**
 * The LOA report spans every section of this subject the teacher
 * carries, so it needs its own fetch — the workspace's gradebook is one
 * class. Loaded only when the tab is open: on a teacher with ten
 * sections this is ten round trips, and paying them to render a tab
 * nobody clicked would be rude.
 */
function LoaTab({ cls, period, yearLabel, yearId, load, onGoGradebook }: {
  cls: ClassSummary; period: AcademicPeriod; yearLabel: string; yearId: string;
  load: (y: string, c: string, p: string) => Promise<CohortSection[]>;
  onGoGradebook: () => void;
}) {
  const [state, retry] = useAsync(
    () => load(yearId, cls.id, period.id),
    [load, yearId, cls.id, period.id],
  );
  return (
    <Async state={state} retry={retry} rows={6}>
      {(cohort) => (
        <RecordBookLoa
          cls={cls} period={period} yearLabel={yearLabel} cohort={cohort}
          onGoGradebook={onGoGradebook}
        />
      )}
    </Async>
  );
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
    recorded, onSaveScores, onBack, validateSubmission, submitGrades, recallSubmission,
    loadStudents, loadLoaCohort, loadGradebook, roster, school, teacherName,
    loadAttendance, saveAttendance, onWorkflowChange, saveAssessments,
  } = props;

  const [exportOpen, setExportOpen] = useState(false);
  /**
   * Which learner the Summary drilled into — held as a CLASS ENROLMENT
   * ID, not as the SummaryRow itself.
   *
   * It used to hold the row, and the comment here claimed it was
   * "cleared whenever the tab or the period changes". Only the tab
   * cleared it. Switching period therefore left a snapshot of the OLD
   * period's marks rendered under the NEW period's heading — Term 1's
   * numbers labelled Term 2, silently, with no error.
   *
   * An id cannot go stale that way: the row is re-derived from
   * whichever period's gradebook is currently loaded. That works
   * precisely because a class_enrollment identifies an ENROLMENT rather
   * than a name or a period — the same property that lets a learner be
   * renamed without orphaning their marks.
   */
  const [detailId, setDetailId] = useState<string | null>(null);
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
              // The key belongs on the FRAGMENT, which is the element
              // this map returns. It used to sit on the <button> inside,
              // which React does not see as the list item — so every tab
              // re-keyed on each render.
              <Fragment key={t.key}>
                {/* A visual seam around the Record Book group, so the six
                    legacy sub-tabs read as one workflow rather than ten
                    peers. */}
                {t.group === 'record-book' && CLASS_TABS[i - 1]?.group !== 'record-book' && (
                  <span className="tab-group-label" aria-hidden="true">Record book</span>
                )}
                <button
                  role="tab"
                  id={`tab-${t.key}`}
                  data-group={t.group}
                  aria-selected={tab === t.key}
                  aria-controls={`panel-${t.key}`}
                  onClick={() => { setDetailId(null); onTabChange(t.key); }}
                >
                  {t.label}
                  {t.key === 'submission' && missing > 0 && (
                    <span className="tab-count" title={`${missing} missing scores`}>{missing}</span>
                  )}
                </button>
              </Fragment>
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
              <>
                {/*
                  The legacy Setup screen opened with a School
                  Information block a teacher typed into — which is how
                  one school ended up with three spellings of its own
                  name across three teachers' files. Same block, shown
                  rather than typed, and it says where each part is
                  actually edited.
                */}
                <SchoolInformation school={school} teacherName={teacherName} />
                <RecordBookSetup
                  cls={cls} period={period} yearLabel={year.label} data={g} status={status}
                  save={(items) => saveAssessments(cls.id, periodId, items)}
                  onSaved={onWorkflowChange}
                />
                {/*
                  The legacy Setup screen carried the Student List right
                  under the score configuration, and that is where a
                  teacher goes looking — reported directly: "even on
                  setup page, there's no way a teacher can add its
                  students". Same component as the Students tab, not a
                  second implementation, so the two cannot drift.
                */}
                {roster && (
                  <div style={{ marginTop: 18 }}>
                    <ClassRoster
                      classId={cls.id}
                      load={roster.load}
                      add={async (l) => { const id = await roster.add(l); roster.onChanged(); return id; }}
                      remove={async (id) => { await roster.remove(id); roster.onChanged(); }}
                      rename={async (f) => { await roster.rename(f); roster.onChanged(); }}
                    />
                  </div>
                )}
              </>
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
            {(g) => {
              // Re-derived from THIS period's gradebook every render.
              // A learner not on this period's roster resolves to null
              // and falls back to Summary, rather than rendering a
              // detail screen for somebody who is not in the class.
              const detail = detailId
                ? summaryRows(g).find((r) => r.classEnrollmentId === detailId) ?? null
                : null;
              return detail ? (
                <StudentDetail
                  cls={cls} period={period} yearLabel={year.label} data={g} row={detail}
                  onBack={() => setDetailId(null)}
                  onGoGradebook={() => { setDetailId(null); onTabChange('gradebook'); }}
                  periods={year.periods}
                  // Both keep the learner and change one axis. Neither
                  // clears the selection, because the row is derived
                  // rather than snapshotted.
                  onSelectPeriod={onPeriodChange}
                  onSelectStudent={(r) => setDetailId(r.classEnrollmentId)}
                  loadGradebook={loadGradebook}
                />
              ) : (
                <RecordBookSummary
                  cls={cls} period={period} yearLabel={year.label} data={g}
                  recorded={recorded.status === 'ready' ? recorded.data : {}}
                  onOpenStudent={(r) => setDetailId(r.classEnrollmentId)}
                  onGoGradebook={() => onTabChange('setup')}
                />
              );
            }}
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
          <LoaTab
            cls={cls} period={period} yearLabel={year.label} yearId={year.id}
            load={loadLoaCohort}
            onGoGradebook={() => onTabChange('setup')}
          />
        )}

        {tab === 'attendance' && (
          <ClassAttendance classId={cls.id} load={loadAttendance} save={saveAttendance} />
        )}

        {tab === 'students' && (
          <>
            {/*
              The editable roster comes FIRST. A teacher opening the
              Students tab of an empty class they just created is here
              to put learners in it, not to read a list of nobody.
            */}
            {roster && (
              <ClassRoster
                classId={cls.id}
                load={roster.load}
                add={async (l) => { const id = await roster.add(l); roster.onChanged(); return id; }}
                remove={async (id) => { await roster.remove(id); roster.onChanged(); }}
                rename={async (f) => { await roster.rename(f); roster.onChanged(); }}
              />
            )}
            <ClassStudents classId={cls.id} load={loadStudents} />
          </>
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
            recall={(reason) => recallSubmission(cls.id, periodId, reason)}
            // `?.` guards `.receivedAt`, not the lookup itself — an RPC
            // that omits `receipts` entirely (it happened: see migration
            // 0028) would still throw here without the leading `?.` on
            // `cls.receipts`, and with no error boundary in the app that
            // is a blank screen, not a friendly gap.
            receivedAt={cls.receipts?.[periodId]?.receivedAt}
            registrarReceivedAt={cls.receipts?.[periodId]?.registrarReceivedAt}
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
