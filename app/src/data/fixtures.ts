/**
 * Fixture data source.
 *
 * Mirrors the seeded database exactly (supabase/seed.sql) so the UI can
 * be developed and demonstrated before a Supabase project exists. The
 * Supabase implementation in `./supabase.ts` returns the identical
 * shapes, so swapping is one import.
 *
 * These are FIXTURES, not defaults. Nothing here ships to a school.
 */
import type {
  AcademicYear, AttendanceDay, AttendanceMark, ClassStudent, ClassSummary, CurrentUser,
  DirectoryStudent, GradebookData, PersistedGrade, RosterStudent, StudentGradeRow,
  StudentHistoryRow, StudentProfile, SubmissionRow, SubmissionStatus, ValidationReport,
} from './types';
import { DO015_CORE, DO015_MAPEH } from '../lib/grading/fixtures';
import type { Assessment } from '../lib/grading';
import { compute } from '../lib/grading';
import { TRANSITIONS } from '../lib/status';

export const YEAR_TRIMESTER: AcademicYear = {
  id: 'year-anhs',
  label: '2026-2027',
  periodStructure: 'trimester',
  periods: [
    { id: 'p1', ordinal: 1, name: 'Term 1', shortName: 'T1', startDate: '2026-06-08', endDate: '2026-09-15', status: 'closed' },
    { id: 'p2', ordinal: 2, name: 'Term 2', shortName: 'T2', startDate: '2026-09-16', endDate: '2026-12-18', status: 'active' },
    { id: 'p3', ordinal: 3, name: 'Term 3', shortName: 'T3', startDate: '2027-01-04', endDate: '2027-04-08', status: 'upcoming' },
  ],
};

/** The same code, a four-quarter school. Proves periods are data. */
export const YEAR_QUARTER: AcademicYear = {
  id: 'year-demo',
  label: '2026-2027',
  periodStructure: 'quarter',
  periods: [
    { id: 'q1', ordinal: 1, name: 'First Quarter', shortName: 'Q1', startDate: '2026-06-08', endDate: '2026-08-14', status: 'closed' },
    { id: 'q2', ordinal: 2, name: 'Second Quarter', shortName: 'Q2', startDate: '2026-08-17', endDate: '2026-10-30', status: 'active' },
    { id: 'q3', ordinal: 3, name: 'Third Quarter', shortName: 'Q3', startDate: '2026-11-03', endDate: '2027-01-29', status: 'upcoming' },
    { id: 'q4', ordinal: 4, name: 'Fourth Quarter', shortName: 'Q4', startDate: '2027-02-01', endDate: '2027-04-08', status: 'upcoming' },
  ],
};

export const CURRENT_USER: CurrentUser = {
  id: 'u-maria',
  name: 'Maria Santos',
  initials: 'MS',
  roles: ['teacher'],
  schoolId: 'school-anhs',
  schoolName: 'Angono National High School',
  schoolCode: 'ANHS',
};

const NAMES = [
  'Abad, Juan C.', 'Alvarez, Maria L.', 'Bautista, Pedro R.', 'Castillo, Ana M.',
  'Delos Santos, Andrea P.', 'Boyore, Joshua R.', 'Garcia, Liza M.', 'Hernandez, Mark A.',
  'Ignacio, Bea S.', 'Jimenez, Carlo D.', 'Lim, Patricia G.', 'Mendoza, Rafael T.',
  'Navarro, Sofia B.', 'Ocampo, Miguel V.', 'Pascual, Trisha N.', 'Quinto, Daniel E.',
  'Ramos, Isabel F.', 'Salazar, Nathan J.', 'Torres, Camille O.', 'Villanueva, Enzo K.',
];

export const ROSTER: RosterStudent[] = NAMES.map((displayName, i) => ({
  classEnrollmentId: `ce-${i + 1}`,
  studentId: `st-${i + 1}`,
  displayName,
}));

/** DO 015 s.2026 assessment shape: WW, PT, then ST1 / ST2 / TE. */
export const ASSESSMENTS: Assessment[] = [
  { id: 'a-ww1', componentId: 'WW', ordinal: 1, title: 'Quiz 1', highestPossibleScore: 20 },
  { id: 'a-ww2', componentId: 'WW', ordinal: 2, title: 'Quiz 2', highestPossibleScore: 20 },
  { id: 'a-ww3', componentId: 'WW', ordinal: 3, title: 'Seatwork 1', highestPossibleScore: 15 },
  { id: 'a-ww4', componentId: 'WW', ordinal: 4, title: 'Quiz 3', highestPossibleScore: 25 },
  { id: 'a-pt1', componentId: 'PT', ordinal: 1, title: 'Problem Set', highestPossibleScore: 40 },
  { id: 'a-pt2', componentId: 'PT', ordinal: 2, title: 'Group Task', highestPossibleScore: 30 },
  { id: 'a-pt3', componentId: 'PT', ordinal: 3, title: 'Project', highestPossibleScore: 50 },
  { id: 'a-st1', componentId: 'ST1', ordinal: 1, title: 'Summative Test 1', highestPossibleScore: 40 },
  { id: 'a-st2', componentId: 'ST2', ordinal: 1, title: 'Summative Test 2', highestPossibleScore: 40 },
  { id: 'a-te',  componentId: 'TE',  ordinal: 1, title: 'Term Examination', highestPossibleScore: 60 },
];

/** Deterministic pseudo-random so the demo is stable across reloads. */
function seeded(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h % 1000) / 1000;
}

function buildScores(periodId: string) {
  const scores: GradebookData['scores'] = {};
  for (const student of ROSTER) {
    const row: Record<string, { raw: number | null; isExcused: boolean }> = {};
    for (const item of ASSESSMENTS) {
      const r = seeded(student.classEnrollmentId + item.id + periodId);
      // Term 2 is deliberately partial: real gaps for the missing-score
      // flag, the gaps filter, and the submission warnings.
      const skip = periodId === 'p2' && (item.componentId === 'TE' || r > 0.86);
      row[item.id] = skip
        ? { raw: null, isExcused: false }
        : { raw: Math.round(item.highestPossibleScore * (0.58 + r * 0.4)), isExcused: false };
    }
    scores[student.classEnrollmentId] = row;
  }
  // One excused learner, so the excused-vs-missing distinction is visible.
  const excused = scores['ce-3'];
  if (excused) excused['a-pt2'] = { raw: null, isExcused: true };
  return scores;
}

export const CLASSES: ClassSummary[] = [
  {
    id: 'c-math10-pearl', gradeLevel: 'Grade 10', section: 'Pearl',
    subject: 'Mathematics 10', subjectCode: 'MATH10', studentCount: ROSTER.length,
    scheduleNote: 'MWF 8:00-9:00', room: 'Room 204',
    status: { p1: 'published', p2: 'draft', p3: 'draft' },
    receipts: {},
    completeness: { p1: { scored: 200, total: 200 }, p2: { scored: 142, total: 200 }, p3: { scored: 0, total: 200 } },
  },
  {
    id: 'c-math10-diamond', gradeLevel: 'Grade 10', section: 'Diamond',
    subject: 'Mathematics 10', subjectCode: 'MATH10', studentCount: 18,
    scheduleNote: 'MWF 9:00-10:00', room: 'Room 204',
    status: { p1: 'published', p2: 'submitted', p3: 'draft' },
    receipts: {},
    completeness: { p1: { scored: 180, total: 180 }, p2: { scored: 180, total: 180 }, p3: { scored: 0, total: 180 } },
  },
  {
    id: 'c-math9-ruby', gradeLevel: 'Grade 9', section: 'Ruby',
    subject: 'Mathematics 9', subjectCode: 'MATH9', studentCount: 19,
    scheduleNote: 'TTh 10:00-11:30', room: 'Room 201',
    status: { p1: 'published', p2: 'returned', p3: 'draft' },
    receipts: {},
    completeness: { p1: { scored: 190, total: 190 }, p2: { scored: 165, total: 190 }, p3: { scored: 0, total: 190 } },
  },
  {
    id: 'c-mapeh10-pearl', gradeLevel: 'Grade 10', section: 'Pearl',
    subject: 'MAPEH 10', subjectCode: 'MAPEH10', studentCount: ROSTER.length,
    scheduleNote: 'TTh 13:00-14:00', room: 'Gym',
    status: { p1: 'published', p2: 'draft', p3: 'draft' },
    receipts: {},
    completeness: { p1: { scored: 200, total: 200 }, p2: { scored: 0, total: 200 }, p3: { scored: 0, total: 200 } },
  },
];

export function getGradebook(classId: string, periodId: string): GradebookData {
  const cls = CLASSES.find((c) => c.id === classId) ?? CLASSES[0]!;
  const status = cls.status[periodId] ?? 'draft';
  return {
    classId,
    periodId,
    // MAPEH carries 20/60/20; everything else 20/50/30. Scheme comes
    // from the subject category, never from a constant in the screen.
    scheme: cls.subjectCode.startsWith('MAPEH') ? DO015_MAPEH : DO015_CORE,
    assessments: ASSESSMENTS,
    roster: ROSTER.slice(0, cls.studentCount),
    scores: buildScores(periodId),
    status,
    editable: status === 'draft' || status === 'in_progress' || status === 'returned' || status === 'reopened',
  };
}


/* ------------------------------------------------------------------ *
 * DataSource implementation
 *
 * Async throughout, deliberately. A synchronous fixture path would let
 * loading and error states go unwritten, and they would then be
 * discovered by a school on a bad connection rather than by us.
 * ------------------------------------------------------------------ */
import type { DataSource, ScoreEdit, SessionContext } from './source';
import { SF10_FIXTURE } from './sf10';

const FIXTURE_SESSION: SessionContext = {
  user: {
    id: CURRENT_USER.id,
    name: CURRENT_USER.name,
    initials: CURRENT_USER.initials,
    email: 'maria@anhs.test',
    employeeId: 'EMP-003',
    schoolId: CURRENT_USER.schoolId,
    roles: ['teacher'],
  },
  school: {
    id: CURRENT_USER.schoolId,
    code: CURRENT_USER.schoolCode,
    name: CURRENT_USER.schoolName,
    govtSchoolId: '301417',
    region: 'IV-A CALABARZON',
    division: 'Rizal',
    district: 'Angono',
  },
  academicYears: [YEAR_TRIMESTER, YEAR_QUARTER].map((y) => ({
    id: y.id,
    label: y.label,
    periodStructure: y.periodStructure,
    status: 'active',
    periods: y.periods.map((p) => ({
      id: p.id, ordinal: p.ordinal, name: p.name, shortName: p.shortName,
      startDate: p.startDate, endDate: p.endDate, status: p.status,
    })),
  })),
  settings: {},
};

/** Mutable in-memory scores, so edits persist for the length of a session. */
const editedScores = new Map<string, { raw: number | null; isExcused: boolean }>();

/**
 * The chain of custody, per `classId|periodId`.
 *
 * Kept beside the status rather than derived from it, because a receipt
 * is a fact about the past: once the adviser has signed for a record,
 * that stays true through a later return and resubmission. The status
 * says where the record IS; these say where it has BEEN.
 */
const receipts = new Map<string, {
  receivedAt: string | null;
  forwardedAt: string | null;
  registrarReceivedAt: string | null;
}>();

function receiptsFor(classId: string, periodId: string) {
  const key = `${classId}|${periodId}`;
  let r = receipts.get(key);
  if (!r) { r = { receivedAt: null, forwardedAt: null, registrarReceivedAt: null }; receipts.set(key, r); }
  return r;
}

/** `classId|periodId` -> classEnrollmentId -> the grade as recorded at submission. */
const persistedGrades = new Map<string, Record<string, PersistedGrade>>();

/**
 * The fixtures' stand-in for `record_period_grades`.
 *
 * It calls the SAME engine the server's Edge Function calls, in the same
 * FINAL mode, for the same reason: at submission an unscored assessment
 * is a zero, because that is what the teacher is certifying. If this
 * used the running mode the gradebook displays, a demo would show one
 * number on screen and store another.
 */
function recordPeriodGrades(gb: GradebookData): void {
  const rows: Record<string, PersistedGrade> = {};
  // ONE stamp for the whole run. Postgres `now()` is transaction-stable,
  // so a real batch shares a single computed_at and the Summary tab can
  // say "filed at 10:04". Stamping each learner separately here would
  // produce twenty timestamps a millisecond apart and suppress it.
  const computedAt = new Date().toISOString();
  for (const learner of gb.roster) {
    const cells = gb.scores[learner.classEnrollmentId] ?? {};
    const result = compute(
      gb.scheme,
      gb.assessments,
      gb.assessments.map((a) => ({
        assessmentId: a.id,
        raw: cells[a.id]?.raw ?? null,
        isExcused: cells[a.id]?.isExcused ?? false,
      })),
      { includeUnscored: true },
    );
    const previous = persistedGrades.get(`${gb.classId}|${gb.periodId}`)
      ?.[learner.classEnrollmentId];
    rows[learner.classEnrollmentId] = {
      initialGrade: result.initialGrade,
      periodGrade: result.periodGrade,
      descriptor: result.descriptor,
      remark: result.remark,
      passed: result.passed,
      computedAt,
      computedMode: 'final',
      version: (previous?.version ?? 0) + 1,
      componentBreakdown: result.components,
    };
  }
  persistedGrades.set(`${gb.classId}|${gb.periodId}`, rows);
}

/** Every period's status as the fixture ships, so a reset is exact. */
const INITIAL_STATUS: Array<Record<string, SubmissionStatus>> =
  CLASSES.map((c) => ({ ...c.status }));

/**
 * Put the mutable fixture state back where it started.
 *
 * CLASSES, `receipts`, `editedScores` and `persistedGrades` are all
 * module-level, so without this a test that submits a period leaves it
 * submitted for every test after it — which is exactly what happened:
 * `beforeEach(() => source = createFixtureSource())` looked like
 * isolation and provided none. The app builds the source once
 * (data/index.ts memoises it), so resetting here costs nothing there.
 */
function resetFixtureState(): void {
  CLASSES.forEach((c, i) => { c.status = { ...INITIAL_STATUS[i]! }; });
  receipts.clear();
  editedScores.clear();
  persistedGrades.clear();
}

export function createFixtureSource(): DataSource {
  resetFixtureState();

  // Named, not returned inline, so the methods below can call each other
  // by name. They used to use `this` — which broke the moment App passed
  // a method to a screen as a bare reference (`submitGrades={source.submitGrades}`),
  // because a detached method has no receiver. Submitting a period in
  // demo mode failed with "Cannot read properties of undefined" and the
  // teacher saw an error where a submission should have been.
  const src: DataSource = {
    kind: 'fixtures',

    async getSession() { return FIXTURE_SESSION; },
    async signIn() { /* no auth against fixtures */ },
    async signOut() { /* no-op */ },
    onAuthChange() { return () => {}; },

    /**
     * Receipts are stamped into their own map by the transitions below,
     * then merged in here — the same shape `rds.classes` returns. If they
     * were only stored on CLASSES the demo would show a chain of custody
     * that never moved.
     */
    async getClasses() {
      // A DEEP copy, deliberately. A shallow spread leaves `status`
      // pointing at the same mutable object every caller shares, so a
      // stale cached list appears to track live status changes while its
      // other fields quietly do not — which is exactly the bug that hid
      // a stale receipts map behind a correct-looking badge. A real
      // fetch returns a snapshot; so does this.
      return CLASSES.map((c) => ({
        ...c,
        status: { ...c.status },
        completeness: { ...c.completeness },
        receipts: Object.fromEntries(
          Object.keys(c.status)
            .filter((pid) => receipts.has(`${c.id}|${pid}`))
            .map((pid) => [pid, { ...receiptsFor(c.id, pid), recalledAt: null }]),
        ),
      }));
    },

    async getGradebook(classId, periodId) {
      const base = getGradebook(classId, periodId);
      // Replay edits made this session so the grid does not appear to
      // discard work when a period is switched and switched back.
      for (const [key, value] of editedScores) {
        const [ceId, aId] = key.split('|');
        if (!ceId || !aId) continue;
        const row = base.scores[ceId];
        if (row) row[aId] = value;
      }
      return base;
    },

    async saveScores(edits: ScoreEdit[]) {
      for (const e of edits) {
        editedScores.set(`${e.classEnrollmentId}|${e.assessmentId}`,
          { raw: e.raw, isExcused: e.isExcused });
      }
      return { written: edits.length };
    },

    async getSf10() {
      // Static import, not dynamic: a dynamic one emits a second chunk,
      // which the single-file staging build cannot inline and which then
      // 404s at runtime. The fixture is a couple of kilobytes.
      return SF10_FIXTURE;
    },

    async getClassStudents(classId) {
      const cls = CLASSES.find((c) => c.id === classId) ?? CLASSES[0]!;
      return ROSTER.slice(0, cls.studentCount).map((r, i) => ({
        classEnrollmentId: r.classEnrollmentId,
        enrollmentId: `en-${i + 1}`,
        studentId: r.studentId,
        displayName: r.displayName,
        studentNumber: `2026-${String(i + 1).padStart(4, '0')}`,
        lrn: `1367890100${String(i + 1).padStart(2, '0')}`,
        sex: i % 2 === 0 ? 'male' : 'female',
        enrollmentStatus: 'enrolled',
        classStatus: 'active',
        finalGrade: null,
      })) satisfies ClassStudent[];
    },

    async getStudents(_yearId, search) {
      const all: DirectoryStudent[] = ROSTER.map((r, i) => ({
        studentId: r.studentId,
        displayName: r.displayName,
        studentNumber: `2026-${String(i + 1).padStart(4, '0')}`,
        lrn: `1367890100${String(i + 1).padStart(2, '0')}`,
        sex: i % 2 === 0 ? 'male' : 'female',
        gradeLevel: 'Grade 10',
        section: 'Pearl',
        enrollmentStatus: 'enrolled',
        generalAverage: null,
      }));
      const q = (search ?? '').trim().toLowerCase();
      return q ? all.filter((s) => s.displayName.toLowerCase().includes(q)
        || (s.lrn ?? '').includes(q) || (s.studentNumber ?? '').includes(q)) : all;
    },

    async getAttendance(classId, date) {
      const cls = CLASSES.find((c) => c.id === classId) ?? CLASSES[0]!;
      const weekend = [0, 6].includes(new Date(date + 'T00:00:00').getDay());
      return {
        classId, date,
        calendarDayId: weekend ? null : `cd-${date}`,
        dayType: weekend ? 'non_teaching' : 'class_day',
        dayNote: null,
        isClassDay: !weekend,
        statuses: ATTENDANCE_STATUSES,
        roster: ROSTER.slice(0, cls.studentCount).map((r, i) => ({
          enrollmentId: `en-${i + 1}`,
          studentId: r.studentId,
          displayName: r.displayName,
          statusId: attendanceMarks.get(`${date}|en-${i + 1}`) ?? null,
          note: null,
        })),
      } satisfies AttendanceDay;
    },

    async saveAttendance(_classId, date, marks: AttendanceMark[]) {
      for (const m of marks) attendanceMarks.set(`${date}|${m.enrollmentId}`, m.statusId);
      return { written: marks.length };
    },

    /* ---- workflow ---------------------------------------------------
     * The fixture runs the SAME state machine as the database, from the
     * same table of legal transitions. If it were more permissive the
     * UI would be developed against rules the server does not have, and
     * the difference would surface only in production.
     * ------------------------------------------------------------------ */

    async saveAssessments(classId, periodId, items) {
      const cls = CLASSES.find((c) => c.id === classId);
      if (!cls) throw new Error('Class not found.');
      if (!['draft', 'returned', 'reopened'].includes(cls.status[periodId] ?? 'draft')) {
        throw new Error('this period has been submitted and can no longer be reconfigured');
      }
      // Mirror the server's totals so the UI is developed against the
      // same numbers: the completeness denominator moves when the shape
      // of the record book changes.
      const before = cls.completeness[periodId]?.total ?? 0;
      cls.completeness[periodId] = {
        scored: Math.min(cls.completeness[periodId]?.scored ?? 0, items.length * cls.studentCount),
        total: items.length * cls.studentCount,
      };
      return { written: items.length, removed: before > items.length * cls.studentCount ? 1 : 0 };
    },

    async validateSubmission(classId, periodId) {
      const cls = CLASSES.find((c) => c.id === classId) ?? CLASSES[0]!;
      const c = cls.completeness[periodId] ?? { scored: 0, total: 0 };
      const missing = Math.max(0, c.total - c.scored);
      return {
        ok: c.total > 0,
        errors: c.total === 0
          ? [{ code: 'no_assessments', message: 'No assessments have been defined for this period' }]
          : [],
        warnings: missing > 0
          ? [{ code: 'missing_scores', message: `${missing} score(s) not yet entered` }]
          : [],
      } satisfies ValidationReport;
    },

    /**
     * Mirrors what the server does, in the same order: compute and
     * record the grades FIRST, then move the workflow. The fixtures are
     * a stand-in for the database, not for the browser, so a demo that
     * submits must leave a recorded grade behind exactly as production
     * does — otherwise the Summary tab would look materialised on real
     * data and empty on fixtures, and the difference would only surface
     * in front of a school.
     */
    async submitGrades(classId, periodId, acknowledgeWarnings) {
      const cls = CLASSES.find((c) => c.id === classId);
      if (!cls) throw new Error('Class not found.');
      const report = await src.validateSubmission(classId, periodId);
      if (!report.ok) throw new Error(report.errors.map((e) => e.message).join('; '));
      if (report.warnings.length > 0 && !acknowledgeWarnings) {
        throw new Error('This submission has warnings that need acknowledging.');
      }
      assertTransition(cls.status[periodId] ?? 'draft', 'submitted');

      recordPeriodGrades(await src.getGradebook(classId, periodId));
      cls.status[periodId] = 'submitted';
    },

    async getLoaCohort(_yearId, classId, periodId) {
      const self = CLASSES.find((c) => c.id === classId);
      if (!self) return [];
      const peers = CLASSES
        .filter((c) => c.subjectCode === self.subjectCode && c.gradeLevel === self.gradeLevel)
        .sort((a, b) => a.section.localeCompare(b.section));
      return Promise.all(peers.map(async (c) => ({
        classId: c.id,
        label: `${c.gradeLevel} – ${c.section}`,
        data: await src.getGradebook(c.id, periodId),
      })));
    },

    async getPeriodGrades(classId, periodId) {
      return persistedGrades.get(`${classId}|${periodId}`) ?? {};
    },

    /**
     * The REGISTRAR's queue. Strict chain: nothing appears here until the
     * adviser has forwarded it, because until then it is not the
     * registrar's to act on.
     */
    async getSubmissionQueue(_yearId) {
      return CLASSES.flatMap((c) =>
        Object.entries(c.status)
          .filter(([, st]) => !['draft', 'submitted', 'received'].includes(st))
          .map(([periodId, st]) => ({
            submissionId: `sub-${c.id}-${periodId}`,
            classId: c.id,
            periodId,
            periodName: YEAR_TRIMESTER.periods.find((p) => p.id === periodId)?.name ?? periodId,
            gradeLevel: c.gradeLevel,
            section: c.section,
            subject: c.subject,
            teacher: CURRENT_USER.name,
            status: st,
            submittedAt: '2026-09-16T08:00:00Z',
            ...receiptsFor(c.id, periodId),
            returnedAt: st === 'returned' ? '2026-09-17T09:00:00Z' : null,
            returnReason: st === 'returned' ? '5 missing scores in Written Works' : null,
            studentCount: c.studentCount,
            completeness: c.completeness[periodId] ?? { scored: 0, total: 0 },
          })),
      ) satisfies SubmissionRow[];
    },

    /**
     * The ADVISER's queue: everything submitted in their sections,
     * including what the registrar now holds, so they can see their
     * hand-off landed. No marks and no completeness — see the note on
     * SubmissionRow.
     */
    async getAdviserQueue(_yearId) {
      return CLASSES.flatMap((c) =>
        Object.entries(c.status)
          .filter(([, st]) => st !== 'draft')
          .map(([periodId, st]) => ({
            submissionId: `sub-${c.id}-${periodId}`,
            classId: c.id,
            periodId,
            periodName: YEAR_TRIMESTER.periods.find((p) => p.id === periodId)?.name ?? periodId,
            gradeLevel: c.gradeLevel,
            section: c.section,
            subject: c.subject,
            teacher: CURRENT_USER.name,
            status: st,
            submittedAt: '2026-09-16T08:00:00Z',
            ...receiptsFor(c.id, periodId),
            returnedAt: st === 'returned' ? '2026-09-17T09:00:00Z' : null,
            returnReason: st === 'returned' ? '5 missing scores in Written Works' : null,
          })),
      ) satisfies SubmissionRow[];
    },

    async recallSubmission(classId, periodId) {
      const cls = CLASSES.find((c) => c.id === classId);
      if (!cls) throw new Error('Class not found.');
      const from = cls.status[periodId] ?? 'draft';
      // The same refusal the database gives, in the same words, so the
      // demo teaches the real rule rather than a friendlier fiction.
      if (from !== 'submitted') {
        const holder = from === 'received' ? 'class adviser'
          : from === 'forwarded' || from === 'registrar_received' ? 'registrar'
          : from;
        throw new Error(
          `This period is already with the ${holder} and can no longer be recalled; `
          + 'ask for it to be returned instead.',
        );
      }
      assertTransition(from, 'draft');
      cls.status[periodId] = 'draft';
    },

    async receiveSubmission(submissionId) {
      const { cls, periodId } = locate(submissionId);
      assertTransition(cls.status[periodId] ?? 'draft', 'received');
      cls.status[periodId] = 'received';
      receiptsFor(cls.id, periodId).receivedAt = new Date().toISOString();
    },

    async forwardSubmission(submissionId) {
      const { cls, periodId } = locate(submissionId);
      assertTransition(cls.status[periodId] ?? 'draft', 'forwarded');
      cls.status[periodId] = 'forwarded';
      receiptsFor(cls.id, periodId).forwardedAt = new Date().toISOString();
    },

    async unforwardSubmission(submissionId) {
      const { cls, periodId } = locate(submissionId);
      if ((cls.status[periodId] ?? 'draft') !== 'forwarded') {
        throw new Error(
          'The registrar has already received this; ask for it to be returned instead.',
        );
      }
      cls.status[periodId] = 'received';
      receiptsFor(cls.id, periodId).forwardedAt = null;
    },

    async registrarReceiveSubmission(submissionId) {
      const { cls, periodId } = locate(submissionId);
      const from = cls.status[periodId] ?? 'draft';
      if (from !== 'forwarded') {
        throw new Error(
          'This record has not been forwarded yet — it is still '
          + (from === 'submitted' ? 'waiting for the class adviser to receive it'
             : from === 'received' ? 'with the class adviser, who has not forwarded it'
             : `at ${from}`) + '.',
        );
      }
      cls.status[periodId] = 'registrar_received';
      receiptsFor(cls.id, periodId).registrarReceivedAt = new Date().toISOString();
    },

    async returnSubmission(submissionId, reason) {
      if (!reason.trim()) throw new Error('A reason is required when returning a submission.');
      moveSubmission(submissionId, 'returned');
    },
    async approveSubmission(submissionId)  { moveSubmission(submissionId, 'approved'); },
    async finalizeSubmission(submissionId) { moveSubmission(submissionId, 'finalized'); },
    async publishSubmission(submissionId)  { moveSubmission(submissionId, 'published'); },

    /* ---- student portal --------------------------------------------- */

    async getMyProfile() {
      return {
        student: {
          studentId: 'st-6', displayName: 'Boyore, Joshua Reyes',
          firstName: 'Joshua', middleName: 'Reyes', lastName: 'Boyore', suffix: null,
          lrn: '136789010005', studentNumber: '2026-0005', sex: 'Male',
          birthDate: '2010-05-18', barangay: 'Mahabang Parang',
          municipality: 'Angono', province: 'Rizal',
        },
        enrollment: {
          academicYear: '2026-2027', gradeLevel: 'Grade 10', section: 'Pearl',
          status: 'enrolled', dateEnrolled: '2026-06-08', adviser: 'Juan Dela Cruz',
        },
        settings: { student_can_view_attendance: false },
      } satisfies StudentProfile;
    },

    async getMyGrades() {
      // Only PUBLISHED periods carry a number. p2 and p3 are not
      // published in the fixture, so they read as null — the same thing
      // the RLS policies do on the real database, rather than a
      // friendlier fiction.
      return CLASSES.slice(0, 2).map((c) => ({
        academicYear: '2026-2027',
        academicYearId: YEAR_TRIMESTER.id,
        gradeLevel: c.gradeLevel,
        section: c.section,
        subject: c.subject,
        subjectCode: c.subjectCode,
        periods: YEAR_TRIMESTER.periods.map((p) => ({
          ordinal: p.ordinal, name: p.name, shortName: p.shortName,
          grade: c.status[p.id] === 'published' ? 88 : null,
        })),
        finalGrade: null,
        remark: null,
      })) satisfies StudentGradeRow[];
    },

    async getMyHistory() {
      return [
        {
          academicYearId: YEAR_TRIMESTER.id, academicYear: '2026-2027',
          gradeLevel: 'Grade 10', section: 'Pearl', status: 'enrolled',
          promotionStatus: null, generalAverage: null,
          schoolName: 'Angono National High School',
        },
        {
          academicYearId: 'year-2025', academicYear: '2025-2026',
          gradeLevel: 'Grade 9', section: null, status: 'completed',
          promotionStatus: 'promoted', generalAverage: 86,
          schoolName: 'Taytay National High School',
        },
      ] satisfies StudentHistoryRow[];
    },
  };

  return src;
}

/* ------------------------------------------------------------------ *
 * Fixture-side workflow support
 * ------------------------------------------------------------------ */

const ATTENDANCE_STATUSES: AttendanceDay['statuses'] = [
  { id: 'as-p', code: 'P', label: 'Present', symbol: 'P', countsAs: 'present' },
  { id: 'as-a', code: 'A', label: 'Absent',  symbol: 'A', countsAs: 'absent' },
  { id: 'as-l', code: 'L', label: 'Late',    symbol: 'L', countsAs: 'present' },
  { id: 'as-e', code: 'E', label: 'Excused', symbol: 'E', countsAs: 'neutral' },
];

const attendanceMarks = new Map<string, string>();

/**
 * The legal transitions, mirroring app.assert_transition in migration
 * 0010. Exported so the test suite can assert the two agree.
 */
/**
 * Re-exported, not redefined.
 *
 * This file used to keep its own copy of the table so offline
 * development exercised real constraints. It kept a test honest right up
 * until migration 0022 added three states, at which point the copy was
 * simply wrong and the fixtures accepted transitions the server refuses.
 * One table, imported.
 */
export { TRANSITIONS } from '../lib/status';

export function assertTransition(from: string, to: string): void {
  const legal = (TRANSITIONS as Record<string, readonly string[]>)[from];
  if (!legal?.includes(to)) {
    throw new Error(`Illegal transition: ${from} → ${to}`);
  }
}

/** id shape: sub-<classId>-<periodId> */
function locate(submissionId: string): { cls: ClassSummary; periodId: string } {
  const rest = submissionId.replace(/^sub-/, '');
  const cls = CLASSES.find((c) => rest.startsWith(`${c.id}-`));
  if (!cls) throw new Error('Submission not found.');
  return { cls, periodId: rest.slice(cls.id.length + 1) };
}

function moveSubmission(submissionId: string, to: SubmissionRow['status']): void {
  // id shape: sub-<classId>-<periodId>
  const rest = submissionId.replace(/^sub-/, '');
  const cls = CLASSES.find((c) => rest.startsWith(`${c.id}-`));
  if (!cls) throw new Error('Submission not found.');
  const periodId = rest.slice(cls.id.length + 1);
  assertTransition(cls.status[periodId] ?? 'draft', to);
  cls.status[periodId] = to;
}
