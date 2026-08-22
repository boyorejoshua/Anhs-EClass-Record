import { useMemo, useState } from 'react';
import './styles/app.css';
import './styles/gradebook.css';
import './styles/sf10.css';
import { Sidebar } from './components/Sidebar';
import { TeacherDashboard } from './screens/TeacherDashboard';
import { ClassWorkspace } from './screens/ClassWorkspace';
import { CLASSES, CURRENT_USER, YEAR_QUARTER, YEAR_TRIMESTER, getGradebook } from './data/fixtures';
import { Sf10Preview } from './screens/Sf10Preview';
import { SF10_FIXTURE } from './data/sf10';
import { DEMO_MODE } from './config';
import type { Role } from './data/types';

export default function App() {
  const [role, setRole] = useState<Role>('teacher');
  const [navKey, setNavKey] = useState('dashboard');
  const [classId, setClassId] = useState<string | null>(null);
  const [periodId, setPeriodId] = useState('p2');
  // Toggling this switches the whole app between a three-trimester and a
  // four-quarter school. Nothing but data changes.
  const [quarterSchool, setQuarterSchool] = useState(false);

  const year = quarterSchool ? YEAR_QUARTER : YEAR_TRIMESTER;

  const activePeriod = useMemo(
    () => (year.periods.some((p) => p.id === periodId) ? periodId : year.periods[1]?.id ?? year.periods[0]!.id),
    [year, periodId],
  );

  const cls = CLASSES.find((c) => c.id === classId) ?? null;
  const gradebook = useMemo(
    () => (cls ? getGradebook(cls.id, activePeriod) : null),
    [cls, activePeriod],
  );

  const openClass = (id: string) => { setClassId(id); setNavKey('gradebook'); };

  // Academic Records (registrar) and Academic History (student) both
  // land on the permanent record.
  const showSf10 = navKey === 'records' || navKey === 'history';

  return (
    <div className="shell">
      <Sidebar
        user={CURRENT_USER}
        activeRole={role}
        activeKey={navKey}
        onNavigate={(k) => { setNavKey(k); if (k === 'dashboard') setClassId(null); }}
        onRoleChange={setRole}
      />

      <div className="main">
        <header className="topbar">
          <div className="crumbs">
            <span>Teaching</span>
            <span>My Classes</span>
            {cls && <span>{cls.gradeLevel} – {cls.section}</span>}
          </div>
          <h1>
            {showSf10
              ? 'Learner Permanent Record'
              : cls ? `${cls.gradeLevel} – ${cls.section} · ${cls.subject}` : 'Dashboard'}
          </h1>
          <div className="topbar-row">
            <span className="topbar-label">Academic year</span>
            <select
              className="select"
              value={activePeriod}
              onChange={(e) => setPeriodId(e.target.value)}
            >
              {year.periods.map((p) => (
                <option key={p.id} value={p.id}>SY {year.label} · {p.name}</option>
              ))}
            </select>

            <div className="spacer" />
            {/* DEMO SCAFFOLDING — a review aid that demonstrates the
                multi-school claim in one click. Absent from a production
                build; see src/config.ts. */}
            {DEMO_MODE && (
              <>
                <span className="demo-chip" title="Review aid — not part of the delivered product">
                  <span aria-hidden="true">◈</span> Demo
                </span>
                <button
                  className="btn btn-sm"
                  aria-pressed={quarterSchool}
                  onClick={() => { setQuarterSchool((v) => !v); setPeriodId(''); }}
                  title="Switch the tenant's period structure. Same code, different rows."
                >
                  {quarterSchool ? '4 quarters' : '3 trimesters'}
                </button>
              </>
            )}
          </div>
        </header>

        {showSf10 ? (
          <Sf10Preview data={SF10_FIXTURE} />
        ) : cls && gradebook ? (
          <ClassWorkspace
            cls={cls}
            year={year}
            periodId={activePeriod}
            onPeriodChange={setPeriodId}
            gradebook={gradebook}
          />
        ) : (
          <TeacherDashboard
            teacherName={CURRENT_USER.name}
            year={year}
            periodId={activePeriod}
            classes={CLASSES}
            onOpenClass={openClass}
          />
        )}
      </div>
    </div>
  );
}
