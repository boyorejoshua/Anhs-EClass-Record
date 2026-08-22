import { useCallback, useEffect, useMemo, useState } from 'react';
import './styles/app.css';
import './styles/gradebook.css';
import './styles/sf10.css';
import './styles/themes.css';
import './styles/motion.css';

import { Sidebar } from './components/Sidebar';
import { AppearanceMenu, useAppearance } from './components/AppearanceMenu';
import { TeacherDashboard } from './screens/TeacherDashboard';
import { ClassWorkspace } from './screens/ClassWorkspace';
import { Sf10Preview } from './screens/Sf10Preview';
import { SignIn } from './screens/SignIn';

import { getDataSource, type SessionContext } from './data';
import type { AcademicYear, ClassSummary, CurrentUser, GradebookData, Role } from './data/types';
import type { Sf10Payload } from './data/sf10';
import { DEMO_MODE } from './config';
import { getSupabase } from './lib/supabase';

const SF10_DEMO_STUDENT = 'a8000000-0000-0000-0000-000000000005';

export default function App() {
  const source = getDataSource();
  const backendConfigured = Boolean(getSupabase());

  const [appearance, setAppearance] = useAppearance();
  const [session, setSession] = useState<SessionContext | null>(null);
  const [booting, setBooting] = useState(true);
  const [fatal, setFatal] = useState<string | null>(null);

  const [role, setRole] = useState<Role>('teacher');
  const [navKey, setNavKey] = useState('dashboard');
  const [classId, setClassId] = useState<string | null>(null);
  const [yearId, setYearId] = useState<string | null>(null);
  const [periodId, setPeriodId] = useState<string | null>(null);

  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [gradebook, setGradebook] = useState<GradebookData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sf10, setSf10] = useState<Sf10Payload | null>(null);

  /* ---- session ---------------------------------------------------- */
  const loadSession = useCallback(async () => {
    setBooting(true);
    setFatal(null);
    try {
      const s = await source.getSession();
      setSession(s);
      if (s) {
        const active = s.academicYears.find((y) => y.status === 'active') ?? s.academicYears[0];
        if (active) {
          setYearId(active.id);
          const p = active.periods.find((x) => x.status === 'active') ?? active.periods[0];
          setPeriodId(p?.id ?? null);
        }
      }
    } catch (e) {
      setFatal(e instanceof Error ? e.message : 'Could not start the application.');
    } finally {
      setBooting(false);
    }
  }, [source]);

  useEffect(() => { void loadSession(); }, [loadSession]);
  useEffect(() => source.onAuthChange(() => { void loadSession(); }), [source, loadSession]);

  const year: AcademicYear | null = useMemo(() => {
    const y = session?.academicYears.find((x) => x.id === yearId) ?? session?.academicYears[0];
    if (!y) return null;
    return {
      id: y.id, label: y.label, periodStructure: y.periodStructure,
      periods: y.periods,
    };
  }, [session, yearId]);

  const activePeriod = useMemo(() => {
    if (!year) return null;
    return year.periods.some((p) => p.id === periodId) ? periodId : year.periods[0]?.id ?? null;
  }, [year, periodId]);

  /* ---- classes ---------------------------------------------------- */
  useEffect(() => {
    if (!session || !year) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    source.getClasses(year.id)
      .then((c) => { if (!cancelled) setClasses(c); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [source, session, year]);

  /* ---- gradebook -------------------------------------------------- */
  useEffect(() => {
    if (!classId || !activePeriod) { setGradebook(null); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    source.getGradebook(classId, activePeriod)
      .then((g) => { if (!cancelled) setGradebook(g); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [source, classId, activePeriod]);

  /* ---- SF10 ------------------------------------------------------- */
  const showSf10 = navKey === 'records' || navKey === 'history';
  useEffect(() => {
    if (!showSf10 || sf10) return;
    source.getSf10(SF10_DEMO_STUDENT)
      .then(setSf10)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [showSf10, sf10, source]);

  /* ---- render ----------------------------------------------------- */
  if (booting) {
    return (
      <div className="app-state"><div className="app-state-card">
        <h2>Loading</h2><p>Fetching your account and classes.</p>
      </div></div>
    );
  }

  if (fatal) {
    return (
      <div className="app-state"><div className="app-state-card panel" style={{ padding: 24 }}>
        <h2>Something went wrong</h2>
        <p>{fatal}</p>
        <button className="btn" onClick={() => void loadSession()}>Try again</button>
      </div></div>
    );
  }

  // No session and a backend configured means: sign in. With fixtures
  // there is always a session, so this never shows.
  if (!session) {
    return <SignIn schoolName="Angono National High School" onSignIn={source.signIn} />;
  }

  const user: CurrentUser = {
    id: session.user.id,
    name: session.user.name,
    initials: session.user.initials,
    roles: [role],
    schoolId: session.school.id,
    schoolName: session.school.name,
    schoolCode: session.school.code,
  };

  const cls = classes.find((c) => c.id === classId) ?? null;

  return (
    <div className="shell">
      <Sidebar
        user={user}
        activeRole={role}
        activeKey={navKey}
        onNavigate={(k) => { setNavKey(k); if (k === 'dashboard') setClassId(null); }}
        onRoleChange={setRole}
      />

      <div className="main">
        <header className="topbar">
          <div className="crumbs">
            <span>Teaching</span><span>My Classes</span>
            {cls && <span>{cls.gradeLevel} – {cls.section}</span>}
          </div>
          <h1>
            {showSf10 ? 'Learner Permanent Record'
              : cls ? `${cls.gradeLevel} – ${cls.section} · ${cls.subject}` : 'Dashboard'}
          </h1>
          <div className="topbar-row">
            <span className="topbar-label">Academic year</span>
            <select
              className="select"
              value={activePeriod ?? ''}
              onChange={(e) => setPeriodId(e.target.value)}
            >
              {year?.periods.map((p) => (
                <option key={p.id} value={p.id}>SY {year.label} · {p.name}</option>
              ))}
            </select>

            <div className="spacer" />

            {/* Says plainly when the numbers are not real. Nobody should
                demo fixture data believing it is live. */}
            {source.kind === 'fixtures' && (
              <span className="source-chip" title="No backend configured — showing fixture data">
                <span aria-hidden="true">◈</span> Sample data
              </span>
            )}

            <AppearanceMenu value={appearance} onChange={setAppearance} />

            {DEMO_MODE && (
              <span className="demo-chip" title="Review aid — not part of the delivered product">
                <span aria-hidden="true">◈</span> Demo
              </span>
            )}

            {backendConfigured && (
              <button className="btn btn-sm" onClick={() => void source.signOut()}>Sign out</button>
            )}
          </div>
        </header>

        {loading && (
          <div className="load-banner" role="status" aria-live="polite">
            <span className="save-dot" aria-hidden="true" /> Loading…
          </div>
        )}
        {error && (
          <div className="err-banner" role="alert">
            <span>{error}</span>
            <button className="btn btn-sm" onClick={() => setError(null)}>Dismiss</button>
          </div>
        )}

        {showSf10 && sf10 ? (
          <Sf10Preview data={sf10} />
        ) : cls && gradebook && year && activePeriod ? (
          <ClassWorkspace
            cls={cls}
            year={year}
            periodId={activePeriod}
            onPeriodChange={setPeriodId}
            gradebook={gradebook}
            onSaveScores={source.saveScores}
          />
        ) : year && activePeriod ? (
          <TeacherDashboard
            teacherName={user.name}
            year={year}
            periodId={activePeriod}
            classes={classes}
            onOpenClass={(id) => { setClassId(id); setNavKey('gradebook'); }}
          />
        ) : (
          <div className="page"><div className="panel"><div className="empty">
            <strong>No academic year is set up</strong>
            An administrator needs to create a school year and its grading periods.
          </div></div></div>
        )}
      </div>
    </div>
  );
}
