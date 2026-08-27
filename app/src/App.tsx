import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './styles/app.css';
import './styles/gradebook.css';
import './styles/sf10.css';
import './styles/themes.css';
import './styles/motion.css';
import './styles/screens.css';

import { Sidebar } from './components/Sidebar';
import { AppearanceMenu, useAppearance } from './components/AppearanceMenu';
import { NotAvailable } from './components/NotAvailable';
import { Async, useAsync } from './components/Async';

import { TeacherDashboard, RegistrarDashboard, AdminDashboard } from './screens/Dashboards';
import { MyClasses } from './screens/MyClasses';
import { ClassWorkspace } from './screens/ClassWorkspace';
import { RegistrarQueue } from './screens/RegistrarQueue';
import { AdviserQueue } from './screens/AdviserQueue';
import { RegistrarStudents } from './screens/RegistrarStudents';
import { Students } from './screens/Students';
import { ClassesAndSections } from './screens/ClassesAndSections';
import { GlobalAnalytics, GlobalLoaReports } from './screens/GlobalReports';
import { ConsolidatedGrades } from './screens/ConsolidatedGrades';
import { Users } from './screens/Users';
import { SchoolSetup } from './screens/SchoolSetup';
import { MyAccount, PasswordForm } from './screens/MyAccount';
import { StudentRecordScreen } from './screens/StudentRecordScreen';
import { StudentGrades, StudentProfileScreen, StudentHistory } from './screens/StudentPortal';
import { Sf10Preview } from './screens/Sf10Preview';
import { SignIn } from './screens/SignIn';
import { Help } from './screens/Help';
import { ImportCenter } from './screens/ImportCenter';

import { getDataSource, type SessionContext } from './data';
import type { AcademicYear, CurrentUser, Role } from './data/types';
import { DEMO_MODE, signInBrand } from './config';
import { getSupabase } from './lib/supabase';
import {
  HOME, ROLE_LABEL, defaultRole, isReady, navItem, rolesFromSession,
  type ClassTab, type Route, type RouteId,
} from './nav';

/** Routes whose own picker owns the period, so the header's must stand down. */
const CARRIES_OWN_PERIOD: ReadonlySet<RouteId> = new Set(['analytics', 'loa-reports', 'consolidated']);

export default function App() {
  const source = getDataSource();
  const backendConfigured = Boolean(getSupabase());

  const [appearance, setAppearance] = useAppearance();
  const [session, setSession] = useState<SessionContext | null>(null);
  const [booting, setBooting] = useState(true);
  const [fatal, setFatal] = useState<string | null>(null);

  /**
   * The role comes from the session, not from a literal.
   *
   * It used to be `useState<Role>('teacher')`, and `user.roles` was then
   * built as `[role]` — so a registrar signing in was shown the teacher
   * menu, and their real roles were discarded on the way to the UI.
   *
   * `roleOverride` is the demo switcher and nothing else. It is only
   * ever consulted when DEMO_MODE is on, and it changes which menu is
   * drawn — never what the database will return, which is decided by
   * the JWT and the user's `user_roles` rows.
   */
  const [roleOverride, setRoleOverride] = useState<Role | null>(null);
  const [route, setRoute] = useState<Route>(HOME);
  const [yearId, setYearId] = useState<string | null>(null);
  const [periodId, setPeriodId] = useState<string | null>(null);
  /** Bumped after a workflow action so dependent reads refetch. */
  const [revision, setRevision] = useState(0);
  /**
   * Whether this person is still holding a password an administrator
   * set for them. Null until the check has run, so the app never
   * flashes the whole shell and then yanks it away.
   */
  const [mustChangePassword, setMustChangePassword] = useState<boolean | null>(null);

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
          setPeriodId((active.periods.find((x) => x.status === 'active') ?? active.periods[0])?.id ?? null);
        }
        // Whether they are still on an administrator-issued password.
        // Never fatal: a school must not be locked out of a working
        // gradebook because one extra read failed, so an error here
        // means "assume they are fine" rather than "block the app".
        try {
          const account = await source.getMyAccount();
          setMustChangePassword(account.mustChangePassword === true);
        } catch {
          setMustChangePassword(false);
        }
      }
    } catch (e) {
      setFatal(e instanceof Error ? e.message : 'Could not start the application.');
    } finally {
      setBooting(false);
    }
  }, [source]);

  /**
   * Re-read the session WITHOUT the boot flag.
   *
   * `loadSession` sets `booting`, which swaps the whole shell for the
   * "Loading" card — right on first paint, wrong after a save: the
   * screen that triggered it unmounts, taking its "Saved." confirmation
   * with it, and the person is told nothing happened. This is for the
   * cases where something the shell displays (the school name in the
   * sidebar, on every form) changed underneath it.
   */
  const refreshSession = useCallback(async () => {
    try {
      setSession(await source.getSession());
    } catch {
      // A failed refresh must not tear down a working session — the
      // save already succeeded, and the stale name is cosmetic.
    }
  }, [source]);

  useEffect(() => { void loadSession(); }, [loadSession]);
  useEffect(() => source.onAuthChange(() => { void loadSession(); }), [source, loadSession]);

  const heldRoles = useMemo(
    () => rolesFromSession(session?.user.roles ?? []),
    [session],
  );
  const sessionRole = useMemo(
    () => defaultRole(session?.user.roles ?? []),
    [session],
  );
  const role: Role = (DEMO_MODE ? roleOverride : null) ?? sessionRole ?? 'teacher';

  const year: AcademicYear | null = useMemo(() => {
    const y = session?.academicYears.find((x) => x.id === yearId) ?? session?.academicYears[0];
    return y ? { id: y.id, label: y.label, periodStructure: y.periodStructure, periods: y.periods } : null;
  }, [session, yearId]);

  /**
   * Every year this account can report on, with its periods.
   *
   * The global report pickers need the whole list, not just the active
   * year — "show me Term 2 of last year" is the point of them. Derived
   * here rather than reaching into `session` inside the route switch,
   * where TypeScript cannot see the null guard.
   */
  const allYears: AcademicYear[] = useMemo(
    () => (session?.academicYears ?? []).map((y) => ({
      id: y.id, label: y.label, periodStructure: y.periodStructure, periods: y.periods,
    })),
    [session],
  );

  /**
   * The school as it prints on a form.
   *
   * Derived here rather than reached for inside the route switch, where
   * TypeScript cannot see the `if (!session)` guard — the same reason
   * `allYears` is built up here.
   */
  const schoolInfo = useMemo(() => ({
    name: session?.school.name ?? '',
    govtSchoolId: session?.school.govtSchoolId ?? null,
    region: session?.school.region ?? null,
    division: session?.school.division ?? null,
    district: session?.school.district ?? null,
  }), [session]);

  const activePeriod = useMemo(() => {
    if (!year) return null;
    return year.periods.some((p) => p.id === periodId) ? periodId : year.periods[0]?.id ?? null;
  }, [year, periodId]);

  /* ---- classes ---------------------------------------------------- */
  /**
   * Re-read the class list on every navigation, not just on `revision`.
   *
   * The workflow is now several people long: an adviser receiving a
   * record changes what the teacher's Submission tab should say, and
   * nothing in the teacher's own session bumps `revision` when that
   * happens. Keying on the route means walking back into a class always
   * shows the current state. It is one RPC returning a small payload —
   * cheaper than a teacher acting on a stale screen.
   */
  const [classesState, retryClasses] = useAsync(
    () => (year ? source.getClasses(year.id) : Promise.resolve([])),
    [source, year?.id, revision, route.id],
  );
  const classes = classesState.status === 'ready' ? classesState.data : [];

  /* ---- gradebook, only when a class is open ----------------------- */
  const [gradebookState, retryGradebook] = useAsync(
    () => (route.classId && activePeriod
      ? source.getGradebook(route.classId, activePeriod)
      : Promise.reject(new Error('No class selected.'))),
    [source, route.classId, activePeriod, revision],
  );

  /**
   * The grades the SERVER has recorded for this class and period.
   *
   * Loaded alongside the gradebook rather than derived from it, because
   * these two answer different questions: the gradebook is what the
   * scores are now, this is what was certified. `revision` is in the
   * dependency list so a submission refreshes it — the whole point is
   * that the Summary tab stops showing only a browser calculation the
   * moment a real grade exists.
   */
  const [recordedState] = useAsync(
    () => (route.classId && activePeriod
      ? source.getPeriodGrades(route.classId, activePeriod)
      : Promise.resolve({})),
    [source, route.classId, activePeriod, revision],
  );

  /* ---- navigation -------------------------------------------------- */
  const go = useCallback((id: RouteId, extra?: Partial<Route>) => {
    setRoute({ id, ...extra });
  }, []);

  const openClass = useCallback((classId: string, tab: ClassTab = 'gradebook') => {
    setRoute({ id: 'class', classId, tab });
  }, []);

  // Switching role changes which menu exists, so a route from the old
  // menu may not be reachable from the new one. Land on that role's home.
  //
  // This keys on the ROLE changing, not on the route changing. Keying on
  // the route looks equivalent and is not: the class workspace is not a
  // menu entry, so a "is this route in the menu" test run on every route
  // change bounces every attempt to open a class straight back to the
  // dashboard. The browser smoke test caught both halves of this — first
  // a registrar left sitting inside a teacher's gradebook, then, after
  // the naive fix, classes that would not open at all.
  const prevRole = useRef(role);
  useEffect(() => {
    if (prevRole.current !== role) {
      prevRole.current = role;
      setRoute(HOME);
    }
  }, [role]);

  const bumpRevision = useCallback(() => setRevision((r) => r + 1), []);

  /* ---- boot states -------------------------------------------------- */
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

  if (!session) {
    return <SignIn brand={signInBrand()} onSignIn={source.signIn} />;
  }

  // A signed-in account with no role can reach nothing, and saying so is
  // better than an empty shell that looks broken.
  if (heldRoles.length === 0 && !DEMO_MODE) {
    return (
      <div className="app-state"><div className="app-state-card panel" style={{ padding: 24 }}>
        <h2>No role assigned</h2>
        <p>
          This account exists but has not been given a role at {session.school.name}, so
          there is nothing it can open yet. An administrator assigns roles.
        </p>
        <button className="btn" onClick={() => void source.signOut()}>Sign out</button>
      </div></div>
    );
  }

  /**
   * The temporary-password gate.
   *
   * An administrator issued this password and therefore knows it, so
   * until the person replaces it there is no meaningful distinction
   * between them and their administrator — every grade they submit
   * would be attributable to two people. That is a chain-of-custody
   * problem, not a nagging preference, which is why this blocks rather
   * than showing a banner.
   *
   * Sign out stays reachable: somebody who realises they are on the
   * wrong account must not be trapped here.
   */
  if (mustChangePassword) {
    return (
      <div className="app-state">
        <div className="app-state-card" style={{ maxWidth: 620 }}>
          <h2>Choose your own password</h2>
          <p>
            You signed in with a temporary password that an administrator set
            for you. Choose one only you know before you go any further.
          </p>
          <PasswordForm
            mustChange
            changePassword={source.changeMyPassword}
            onChanged={() => setMustChangePassword(false)}
          />
          <button className="btn" onClick={() => void source.signOut()}>Sign out</button>
        </div>
      </div>
    );
  }

  const user: CurrentUser = {
    id: session.user.id,
    name: session.user.name,
    initials: session.user.initials,
    roles: heldRoles,
    schoolId: session.school.id,
    schoolName: session.school.name,
    schoolCode: session.school.code,
  };

  const cls = classes.find((c) => c.id === route.classId) ?? null;
  const item = navItem(role, route.id);
  const title = route.id === 'class' && cls
    ? `${cls.gradeLevel} – ${cls.section} · ${cls.subject}`
    : item?.label ?? 'Dashboard';

  /* ---- the screen ---------------------------------------------------
   * One switch. Every route resolves here, and a route with no screen
   * resolves to NotAvailable — never to some other screen.
   * ------------------------------------------------------------------ */
  function screen() {
    if (!year || !activePeriod) {
      return (
        <div className="page"><div className="panel"><div className="empty">
          <strong>No academic year is set up</strong>
          An administrator needs to create a school year and its grading periods.
        </div></div></div>
      );
    }

    // A menu entry marked `planned` always renders the honest dead end.
    if (route.id !== 'class' && !isReady(role, route.id)) {
      return <NotAvailable title={item?.label ?? 'Not available'} note={item?.note} />;
    }

    switch (route.id) {
      case 'dashboard':
        if (role === 'registrar') {
          return (
            <RegistrarDashboard
              year={year} yearId={year.id}
              loadQueue={source.getSubmissionQueue}
              onGoQueue={() => go('queue')}
              onGoStudents={() => go('students')}
            />
          );
        }
        if (role === 'school_admin') {
          return <AdminDashboard year={year} schoolName={user.schoolName} periodId={activePeriod} />;
        }
        if (role === 'student') {
          return <StudentGrades load={() => source.getMyGrades()} />;
        }
        return (
          <Async state={classesState} retry={retryClasses} rows={6}>
            {(list) => (
              <TeacherDashboard
                teacherName={user.name} year={year!} periodId={activePeriod!}
                classes={list}
                onOpenClass={openClass}
                onGoClasses={() => go('classes')}
              />
            )}
          </Async>
        );

      case 'classes':
      case 'attendance':
      case 'submissions': {
        const purpose =
          route.id === 'attendance' ? { label: 'Attendance — pick a class', tab: 'attendance' as const }
          : route.id === 'submissions' ? { label: 'Submissions — pick a class', tab: 'submission' as const }
          : undefined;
        return (
          <Async state={classesState} retry={retryClasses} rows={6}>
            {(list) => (
              <MyClasses
                classes={list} year={year!} periodId={activePeriod!}
                onOpenClass={openClass} purpose={purpose}
                // Only the teaching roles. `create_my_class` checks
                // classes.create.own itself and refuses anyone else, so
                // this only spares a registrar a button that would
                // error — the registrar's own path is Classes &
                // Sections, which can assign a class to somebody else.
                addClass={role === 'teacher' || role === 'adviser' ? {
                  loadOptions: source.getMyClassSetupOptions,
                  create: source.createMyClass,
                  onCreated: () => { retryClasses(); bumpRevision(); },
                } : undefined}
              />
            )}
          </Async>
        );
      }

      case 'reports':
        return (
          <Async state={classesState} retry={retryClasses} rows={6}>
            {(list) => (
              <MyClasses
                classes={list} year={year!} periodId={activePeriod!}
                onOpenClass={(id) => openClass(id, 'reports')}
                purpose={{ label: 'Reports — pick a class', tab: 'reports' as unknown as 'gradebook' }}
              />
            )}
          </Async>
        );

      case 'import':
        return (
          <ImportCenter
            resolveImport={source.resolveImport}
            commitImport={source.commitImport}
            getImportHistory={source.getImportHistory}
            // The period is not known from an import result, so land on
            // the class overview and let the teacher choose the term.
            onOpenClass={(classId) => openClass(classId, 'overview')}
          />
        );

      case 'help':
        return <Help />;

      case 'class':
        if (!cls) {
          return (
            <Async state={classesState} retry={retryClasses} rows={4}>
              {() => (
                <NotAvailable
                  title="Class not found"
                  note="This class is not in your current teaching load for this school year."
                />
              )}
            </Async>
          );
        }
        return (
          <ClassWorkspace
            cls={cls} year={year} periodId={activePeriod}
            tab={route.tab ?? 'gradebook'}
            onTabChange={(t) => setRoute((r) => ({ ...r, tab: t }))}
            onPeriodChange={setPeriodId}
            gradebook={gradebookState}
            retryGradebook={retryGradebook}
            recorded={recordedState}
            onSaveScores={source.saveScores}
            onBack={() => go('classes')}
            validateSubmission={source.validateSubmission}
            submitGrades={source.submitGrades}
            recallSubmission={source.recallSubmission}
            loadStudents={source.getClassStudents}
            saveAssessments={source.saveAssessments}
            loadAttendance={source.getAttendance}
            saveAttendance={source.saveAttendance}
            onWorkflowChange={bumpRevision}
            loadLoaCohort={source.getLoaCohort}
            loadGradebook={source.getGradebook}
            school={schoolInfo}
            teacherName={session?.user.name ?? ''}
            // Teaching roles only. add_learner_to_my_class checks
            // app.teaches_class itself and refuses anyone else, so this
            // only spares a registrar a panel they would be refused —
            // their path is Students, which admits with an LRN.
            roster={role === 'teacher' || role === 'adviser' ? {
              load: source.getMyClassRoster,
              add: source.addLearnerToMyClass,
              remove: source.removeLearnerFromMyClass,
              rename: source.correctLearnerName,
              onChanged: bumpRevision,
            } : undefined}
          />
        );

      case 'incoming':
        return (
          <AdviserQueue
            yearId={year.id}
            load={source.getAdviserQueue}
            actions={{
              receiveSubmission: source.receiveSubmission,
              forwardSubmission: source.forwardSubmission,
              unforwardSubmission: source.unforwardSubmission,
            }}
            onOpenClass={(classId, pid) => { setPeriodId(pid); openClass(classId, 'summary'); }}
          />
        );

      case 'consolidated':
        return (
          <ConsolidatedGrades
            years={allYears}
            loadSections={source.getMyAdvisorySections}
            loadGrades={source.getConsolidatedGrades}
          />
        );

      case 'queue':
        return (
          <RegistrarQueue
            yearId={year.id}
            load={source.getSubmissionQueue}
            actions={{
              registrarReceiveSubmission: source.registrarReceiveSubmission,
              returnSubmission: source.returnSubmission,
              approveSubmission: source.approveSubmission,
              finalizeSubmission: source.finalizeSubmission,
              publishSubmission: source.publishSubmission,
            }}
            onOpenClass={(classId, pid) => { setPeriodId(pid); openClass(classId, 'gradebook'); }}
          />
        );

      case 'analytics':
        return (
          <GlobalAnalytics
            years={allYears}
            loadClasses={source.getClasses}
            loadGradebook={source.getGradebook}
            onOpenClass={(classId, pid) => { setPeriodId(pid); openClass(classId, 'analytics'); }}
          />
        );

      case 'loa-reports':
        return (
          <GlobalLoaReports
            years={allYears}
            loadClasses={source.getClasses}
            loadCohort={source.getLoaCohort}
            onOpenClass={(classId, pid) => { setPeriodId(pid); openClass(classId, 'loa'); }}
          />
        );

      case 'students':
        return (
          <Students
            yearId={year.id}
            yearLabel={year.label}
            load={source.getStudents}
            loadOptions={source.getEnrollmentOptions}
            admit={source.admitStudent}
            onOpenStudent={(studentId) => setRoute({ id: 'student', studentId })}
            // A courtesy, not a control: `admit_student` checks
            // students.write itself and refuses anyone else, so hiding
            // the button only spares a teacher a pointless error.
            canAdmit={role === 'registrar' || role === 'school_admin'}
          />
        );

      case 'sections':
        return (
          <ClassesAndSections
            yearId={year.id}
            yearLabel={year.label}
            load={source.getSectionSetupOptions}
            createSection={source.createSection}
            createClass={source.createClass}
          />
        );

      case 'student':
        if (!route.studentId) return <Students
          yearId={year.id} yearLabel={year.label}
          load={source.getStudents} loadOptions={source.getEnrollmentOptions}
          admit={source.admitStudent}
          onOpenStudent={(studentId) => setRoute({ id: 'student', studentId })}
          canAdmit={role === 'registrar' || role === 'school_admin'}
        />;
        return (
          <StudentRecordScreen
            studentId={route.studentId}
            load={source.getStudentRecord}
            onBack={() => go('students')}
          />
        );

      case 'records':
        // No hard-coded student. The registrar picks one; the SF10 is
        // then fetched for that id and the server decides whether this
        // caller may read it.
        if (!route.studentId) {
          return (
            <RegistrarStudents
              yearId={year.id}
              load={source.getStudents}
              purpose="Academic records"
              onOpenRecord={(studentId) => setRoute({ id: 'records', studentId })}
            />
          );
        }
        return <Sf10Screen studentId={route.studentId} onBack={() => go('records')} />;

      case 'setup':
        return (
          <SchoolSetup
            load={source.getSchoolProfile}
            save={source.updateSchoolProfile}
            // The school name is in the sidebar and on every form, so a
            // change to it has to reach the whole shell, not just this
            // screen. Silently — see refreshSession.
            onSaved={() => { void refreshSession(); }}
          />
        );

      case 'users':
        return (
          <Users
            load={source.getStaffDirectory}
            createAccount={source.createAccount}
            resetPassword={source.resetPassword}
            setUserRoles={source.setUserRoles}
            setUserStatus={source.setUserStatus}
          />
        );

      case 'account':
        return (
          <MyAccount
            load={source.getMyAccount}
            save={source.updateMyProfile}
            changePassword={source.changeMyPassword}
            onPasswordChanged={() => setMustChangePassword(false)}
          />
        );

      case 'profile':
        return <StudentProfileScreen load={source.getMyProfile} />;

      case 'history':
        return (
          <StudentHistory
            load={source.getMyHistory}
            loadGrades={(yid) => source.getMyGrades(yid)}
          />
        );

      default:
        return <NotAvailable title={item?.label ?? 'Not available'} note={item?.note} />;
    }
  }

  return (
    <div className="shell">
      <Sidebar
        user={user}
        activeRole={role}
        heldRoles={heldRoles}
        activeKey={route.id}
        onNavigate={(k) => go(k)}
        onRoleChange={setRoleOverride}
      />

      <div className="main">
        <header className="topbar">
          <div className="crumbs">
            <span>{ROLE_LABEL[role]}</span>
            {route.id === 'class' && <span>My Classes</span>}
            {route.id === 'class' && cls && <span>{cls.gradeLevel} – {cls.section}</span>}
          </div>
          <h1>{title}</h1>
          {/*
            The header's period selector drives the class workspace. On a
            screen that carries its OWN year and period picker it does
            nothing, and two controls labelled "Grading period" on one
            page is worse than none — a teacher changes the wrong one and
            concludes the report is broken.
          */}
          <div className="topbar-row">
            {/* Only the period control stands down — the rest of this row
                (appearance, sign out) belongs on every screen. */}
            {!CARRIES_OWN_PERIOD.has(route.id) && (
              <>
                <label className="topbar-label" htmlFor="period-select">Grading period</label>
                <select
                  id="period-select"
                  className="select"
                  value={activePeriod ?? ''}
                  onChange={(e) => setPeriodId(e.target.value)}
                >
                  {year?.periods.map((p) => (
                    <option key={p.id} value={p.id}>SY {year.label} · {p.name}</option>
                  ))}
                </select>
              </>
            )}

            <div className="spacer" />

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

        {screen()}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Sf10Screen({ studentId, onBack }: { studentId: string; onBack: () => void }) {
  const source = getDataSource();
  const [state, retry] = useAsync(() => source.getSf10(studentId), [source, studentId]);
  return (
    <>
      <div className="page" style={{ paddingBottom: 0 }}>
        <button className="link-back" onClick={onBack}>← All learners</button>
      </div>
      <Async state={state} retry={retry} rows={10}>
        {(data) => <Sf10Preview data={data} />}
      </Async>
    </>
  );
}
